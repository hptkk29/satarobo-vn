import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import {
  scopedDb,
  passesScope,
  getModelVisibleCenterIds,
  logScopeBypass,
} from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { getAuditActor } from "@/lib/audit/log";
import { parseLeadImportRow } from "@/lib/lead/import";
import { normalizeVi } from "@/lib/lead/import-registered";
import { autoAssignNewLead } from "@/lib/lead/auto-assign";
import { checkPermission } from "@/lib/auth/check-permission";

type ImportError = { row: number; error: string };

// POST /api/admin/import/leads — nhập nhiều lead từ Excel (thu ở sự kiện).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkPermission("leads:create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rows = (body as { rows?: unknown[] })?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Không có dữ liệu" }, { status: 400 });
  }
  if (rows.length > 5000) return NextResponse.json({ error: "Quá 5000 rows" }, { status: 400 });

  // Stage 1: parse thuần từng dòng.
  const parsed = rows.map((r) => parseLeadImportRow((r ?? {}) as Record<string, unknown>));

  // Resolve cơ sở (mã CS → centerId, mọi cơ sở có code) + khoá (tên/slug → courseId).
  // Dual-write 2-phase: resolve OrgUnit theo mã (tự nhiên gồm cả HO "HO" — HO
  // không có Center row nên chỉ map được qua OrgUnit).
  // Cách ly cơ sở: Lead ∈ SCOPED_MODELS. Write theo centerId form → guard passesScope
  // per-row (CM chỉ import lead vào cơ sở mình; Sale HO/SUPER_ADMIN chọn cơ sở tự do
  // — câu 4.1 BGĐ). Center/OrgUnit exempt, Course catalog global → pass-through.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const [centers, orgUnits, courses] = await Promise.all([
    sdb.center.findMany({ where: { code: { not: null } }, select: { id: true, code: true } }),
    sdb.orgUnit.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true },
    }),
    sdb.course.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  const centerByCode = new Map(centers.map((c) => [c.code, c.id]));
  const orgUnitByCode = new Map(orgUnits.map((o) => [o.code, o.id]));
  const courseByKey = new Map<string, string>();
  for (const c of courses) {
    courseByKey.set(c.name.trim().toLowerCase(), c.id);
    if (c.slug) courseByKey.set(c.slug.trim().toLowerCase(), c.id);
  }

  const errors: ImportError[] = [];
  type Valid = {
    parentName: string;
    phone: string;
    email: string | null;
    childName: string | null;
    childAge: number | null;
    centerId: string | null;
    orgUnitId: string | null;
    courseId: string | null;
    source: string;
    note: string | null;
  };
  // Gộp con (1 PH nhiều con): nhóm theo SĐT. Dòng trùng SĐT trong file CHỈ được
  // nhận khi client gắn cờ __confirmMerge (Sale bấm "Xác nhận gộp con" ở preview)
  // — con của dòng đó nhập chung vào lead của nhóm thay vì bị bỏ.
  type Child = { name: string | null; age: number | null };
  type Group = { base: Valid; children: Child[]; anyConfirm: boolean };
  const groups = new Map<string, Group>();

  for (let i = 0; i < parsed.length; i++) {
    const rowNo = i + 2;
    const p = parsed[i];
    if (!p.ok) {
      errors.push({ row: rowNo, error: p.error });
      continue;
    }
    const d = p.data;

    let centerId: string | null = null;
    let orgUnitId: string | null = null;
    if (d.centerCode) {
      centerId = centerByCode.get(d.centerCode) ?? null;
      orgUnitId = orgUnitByCode.get(d.centerCode) ?? null;
      // HO không có Center row → cho phép nếu khớp OrgUnit theo mã.
      if (!centerId && !orgUnitId) {
        errors.push({ row: rowNo, error: `Không tìm thấy cơ sở ${d.centerCode}` });
        continue;
      }
    }

    let courseId: string | null = null;
    if (d.courseRaw) {
      courseId = courseByKey.get(d.courseRaw.trim().toLowerCase()) ?? null;
      if (!courseId) {
        errors.push({ row: rowNo, error: `Khoá "${d.courseRaw}" không khớp khoá có thật` });
        continue;
      }
    }

    if (!passesScope("Lead", { centerId }, actor)) {
      errors.push({
        row: rowNo,
        error: d.centerCode
          ? `Cơ sở "${d.centerCode}" ngoài phạm vi quyền của bạn`
          : "Lead không gắn cơ sở cần quyền HO/SUPER_ADMIN",
      });
      continue;
    }

    const confirmMerge = Boolean(
      (rows[i] as Record<string, unknown> | null)?.["__confirmMerge"],
    );
    const g = groups.get(d.phone);
    if (g) {
      // Trùng SĐT trong file: chưa xác nhận gộp → bỏ qua như cũ.
      if (!confirmMerge) {
        errors.push({ row: rowNo, error: `Trùng SĐT trong file: ${d.phone} — chưa xác nhận gộp` });
        continue;
      }
      g.children.push({ name: d.childName, age: d.childAge });
      g.anyConfirm = true;
      continue;
    }
    groups.set(d.phone, {
      base: {
        parentName: d.parentName,
        phone: d.phone,
        email: d.email,
        childName: d.childName,
        childAge: d.childAge,
        centerId,
        orgUnitId,
        courseId,
        source: d.source,
        note: d.note,
      },
      children: [{ name: d.childName, age: d.childAge }],
      anyConfirm: confirmMerge,
    });
  }

  // Đối chiếu lead đã tồn tại (theo SĐT) — dedupe TOÀN HỆ THỐNG. sdb ẩn lead cơ sở
  // khác → bypass HẸP (id/phone/centerId + tên con để dedupe khi GỘP, không lộ
  // note/email) + ghi audit AC10. Nhóm có __confirmMerge → GỘP con vào lead cũ;
  // không xác nhận → bỏ qua như cũ.
  type MergeOp = {
    leadId: string;
    phone: string;
    children: Child[];
    legacyChild: Child | null; // childName cũ (backfill thành LeadChild khi children[] rỗng)
    existingNames: string[];
  };
  const mergeOps: MergeOp[] = [];
  if (groups.size > 0) {
    if (getModelVisibleCenterIds("Lead", actor) !== "ALL") {
      await logScopeBypass(actor, "import/leads: dedupe SĐT lead toàn hệ thống");
    }
    const existing = await scopedDb(actor, { bypass: true }).lead.findMany({
      where: { phone: { in: [...groups.keys()] }, deletedAt: null },
      select: {
        id: true,
        phone: true,
        centerId: true,
        childName: true,
        childAge: true,
        children: { select: { fullName: true } },
      },
    });
    for (const ex of existing) {
      const g = groups.get(ex.phone);
      if (!g) continue;
      groups.delete(ex.phone);
      if (!g.anyConfirm) {
        errors.push({ row: 0, error: `SĐT đã tồn tại trong CRM — bỏ qua: ${ex.phone}` });
        continue;
      }
      // Gộp = GHI vào lead cũ → phải trong phạm vi quyền (không gộp chéo cơ sở).
      if (!passesScope("Lead", { centerId: ex.centerId }, actor)) {
        errors.push({
          row: 0,
          error: `SĐT ${ex.phone} thuộc lead cơ sở khác — không thể gộp (liên hệ HO)`,
        });
        continue;
      }
      mergeOps.push({
        leadId: ex.id,
        phone: ex.phone,
        children: g.children,
        legacyChild: ex.childName ? { name: ex.childName, age: ex.childAge } : null,
        existingNames: ex.children.map((c) => c.fullName),
      });
    }
  }

  if (groups.size === 0 && mergeOps.length === 0) {
    return NextResponse.json({ success: 0, errors });
  }

  const { actorId, actorName } = getAuditActor(session);
  let success = 0;
  let mergedChildren = 0;
  let mergedLeads = 0;
  const createdIds: string[] = [];
  try {
    await sdb.$transaction(async (tx) => {
      for (const g of groups.values()) {
        const v = g.base;
        // Nhiều con (đã xác nhận gộp trong file) → tạo LeadChild cho các con CÓ TÊN
        // (convention R7-01 như import "đã đăng ký"); childName legacy = con đầu.
        const namedChildren =
          g.children.length > 1
            ? g.children.filter((c) => c.name && c.name.trim())
            : [];
        const created = await tx.lead.create({
          data: {
            parentName: v.parentName,
            phone: v.phone,
            email: v.email,
            childName: v.childName,
            childAge: v.childAge,
            centerId: v.centerId,
            orgUnitId: v.orgUnitId, // dual-write 2-phase
            courseId: v.courseId,
            source: v.source,
            note: v.note,
            status: "NEW",
            ...(namedChildren.length > 0
              ? {
                  children: {
                    create: namedChildren.map((c) => ({
                      fullName: c.name!.trim(),
                      ageYears: c.age,
                    })),
                  },
                }
              : {}),
            activities: {
              create: {
                actorId,
                actorName,
                type: "NOTE",
                content:
                  g.children.length > 1
                    ? `Nhập lead từ Excel (sự kiện) — gộp ${g.children.length} con cùng SĐT`
                    : "Nhập lead từ Excel (sự kiện)",
                metadata: { system: true },
              },
            },
          },
          select: { id: true },
        });
        createdIds.push(created.id);
        success++;
      }

      // GỘP con vào lead CÓ SẴN (Sale đã bấm xác nhận): dedupe theo tên chuẩn hoá,
      // backfill childName cũ thành LeadChild để danh sách con đầy đủ.
      for (const m of mergeOps) {
        const seen = new Set(m.existingNames.map((n) => normalizeVi(n)));
        if (m.legacyChild?.name) seen.add(normalizeVi(m.legacyChild.name));
        const toCreate: Child[] = [];
        if (m.existingNames.length === 0 && m.legacyChild?.name) {
          toCreate.push(m.legacyChild); // backfill con cũ
        }
        let added = 0;
        for (const ch of m.children) {
          const name = ch.name?.trim();
          if (!name) continue;
          if (seen.has(normalizeVi(name))) continue;
          seen.add(normalizeVi(name));
          toCreate.push(ch);
          added++;
        }
        if (added === 0) {
          errors.push({
            row: 0,
            error: `SĐT ${m.phone}: con trùng tên/không có tên — không thêm gì vào lead có sẵn`,
          });
          continue;
        }
        await tx.lead.update({
          where: { id: m.leadId },
          data: {
            children: {
              create: toCreate.map((c) => ({
                fullName: c.name!.trim(),
                ageYears: c.age,
              })),
            },
            activities: {
              create: {
                actorId,
                actorName,
                type: "NOTE",
                content: `Gộp thêm ${added} con từ import Excel (sự kiện) — Sale xác nhận ở preview`,
                metadata: { system: true, import: "event-excel", merge: true },
              },
            },
          },
        });
        mergedChildren += added;
        mergedLeads++;
      }
    });
  } catch (err) {
    return NextResponse.json(
      { success: 0, errors: [...errors, { row: 0, error: `Lỗi ghi: ${err instanceof Error ? err.message : "Unknown"}` }] },
      { status: 500 },
    );
  }

  // Auto-chia từng lead vừa tạo (theo cơ sở → chế độ cơ sở).
  for (const id of createdIds) {
    await autoAssignNewLead(id, { actorId, actorName }).catch((err) =>
      console.error("[import/leads] auto-assign error:", err),
    );
  }

  if (mergedLeads > 0) {
    errors.push({
      row: 0,
      error: `ℹ️ Đã gộp ${mergedChildren} con vào ${mergedLeads} lead có sẵn (không tạo lead mới cho các dòng này)`,
    });
  }
  revalidatePath("/leads");
  return NextResponse.json({ success, errors });
}
