import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { expandPhoneVariants, phoneKey } from "@/lib/phone";
import { resolveActor } from "@/lib/auth/actor";
import {
  scopedDb,
  passesScope,
  getModelVisibleCenterIds,
  logScopeBypass,
} from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { getAuditActor } from "@/lib/audit/log";
import { parseLeadImportRow, resolveDefaultCenterId } from "@/lib/lead/import";
import { normalizeVi } from "@/lib/lead/import-registered";
import { autoAssignNewLead } from "@/lib/lead/auto-assign";
import { checkPermission } from "@/lib/auth/check-permission";
import { orgUnitIdForCenter } from "@/lib/org/org-service";

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

  // 26/07 — QL cơ sở BỎ TRỐNG cột "Cơ sở" → lead tự về cơ sở của họ. Trước đây dòng
  // không có mã CS bị chặn ("cần quyền HO/SUPER_ADMIN") nên QL cơ sở vừa không import
  // được, vừa không có lead nào để chia. Người nhìn thấy NHIỀU cơ sở (HO/SUPER_ADMIN)
  // giữ nguyên hành vi cũ: để trống = lead không gắn cơ sở.
  const defaultCenterId = resolveDefaultCenterId(
    getModelVisibleCenterIds("Lead", actor),
    session.user.centerId,
  );
  const defaultOrgUnitId = defaultCenterId ? await orgUnitIdForCenter(defaultCenterId) : null;
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
  // Gộp con (1 PH nhiều con): nhóm theo SĐT. 26/07 — GỘP TỰ ĐỘNG, không cần bấm
  // "Xác nhận gộp con" nữa: các dòng cùng SĐT (kể cả ghi KHÁC tên phụ huynh — bố/mẹ
  // ghi khác nhau) coi như CÙNG MỘT NHÀ, con dồn vào 1 lead. Tên PH khác được ghi lại
  // trong hoạt động lead để sale đối chiếu, KHÔNG ghi đè tên đang có.
  type Child = { name: string | null; age: number | null };
  type Group = { base: Valid; children: Child[]; otherParentNames: string[] };
  const groups = new Map<string, Group>();

  for (let i = 0; i < parsed.length; i++) {
    const rowNo = i + 2;
    const p = parsed[i];
    if (!p.ok) {
      errors.push({ row: rowNo, error: p.error });
      continue;
    }
    const d = p.data;

    let centerId: string | null = defaultCenterId;
    let orgUnitId: string | null = defaultOrgUnitId;
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

    const g = groups.get(d.phone);
    if (g) {
      // Trùng SĐT trong file → gộp con vào lead của nhóm (tự động).
      g.children.push({ name: d.childName, age: d.childAge });
      if (normalizeVi(d.parentName) !== normalizeVi(g.base.parentName)) {
        g.otherParentNames.push(d.parentName);
      }
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
      otherParentNames: [],
    });
  }

  // Đối chiếu lead đã tồn tại (theo SĐT) — dedupe TOÀN HỆ THỐNG. sdb ẩn lead cơ sở
  // khác → bypass HẸP (id/phone/centerId + tên PH/tên con để dedupe khi GỘP, không lộ
  // note/email) + ghi audit AC10. 26/07 — SĐT đã có trong CRM thì LUÔN gộp con vào lead
  // cũ (không tạo lead trùng số, không cần xác nhận), kể cả khi file ghi khác tên PH.
  type MergeOp = {
    leadId: string;
    phone: string;
    children: Child[];
    legacyChild: Child | null; // childName cũ (backfill thành LeadChild khi children[] rỗng)
    existingNames: string[];
    /** Tên PH trong file khác tên PH của lead cũ → ghi chú lại, không ghi đè. */
    otherParentNames: string[];
  };
  const mergeOps: MergeOp[] = [];
  if (groups.size > 0) {
    if (getModelVisibleCenterIds("Lead", actor) !== "ALL") {
      await logScopeBypass(actor, "import/leads: dedupe SĐT lead toàn hệ thống");
    }
    const existing = await scopedDb(actor, { bypass: true }).lead.findMany({
      // AUTH-SĐT P1 — xem "phoneVariants" trong lib/phone.ts.
      where: { phone: { in: expandPhoneVariants([...groups.keys()]) }, deletedAt: null },
      select: {
        id: true,
        phone: true,
        centerId: true,
        parentName: true,
        childName: true,
        childAge: true,
        children: { select: { fullName: true } },
      },
    });
    for (const ex of existing) {
      const g = groups.get(phoneKey(ex.phone));
      if (!g) continue;
      groups.delete(phoneKey(ex.phone));
      // Gộp = GHI vào lead cũ → phải trong phạm vi quyền (không gộp chéo cơ sở).
      if (!passesScope("Lead", { centerId: ex.centerId }, actor)) {
        errors.push({
          row: 0,
          error: `SĐT ${ex.phone} thuộc lead cơ sở khác — không thể gộp (liên hệ HO)`,
        });
        continue;
      }
      const fileNames = [g.base.parentName, ...g.otherParentNames];
      mergeOps.push({
        leadId: ex.id,
        phone: ex.phone,
        children: g.children,
        legacyChild: ex.childName ? { name: ex.childName, age: ex.childAge } : null,
        existingNames: ex.children.map((c) => c.fullName),
        otherParentNames: [
          ...new Set(fileNames.filter((n) => normalizeVi(n) !== normalizeVi(ex.parentName))),
        ],
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
            status: "MOI",
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
                  (g.children.length > 1
                    ? `Nhập lead từ Excel (sự kiện) — gộp ${g.children.length} con cùng SĐT`
                    : "Nhập lead từ Excel (sự kiện)") +
                  (g.otherParentNames.length > 0
                    ? ` · file còn ghi tên PH khác cùng số: ${g.otherParentNames.join(", ")}`
                    : ""),
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
            error: `ℹ️ SĐT ${m.phone}: con trong file đã có sẵn trong lead (hoặc dòng không ghi tên con) — không thêm gì`,
          });
          continue;
        }
        const otherNamesNote =
          m.otherParentNames.length > 0
            ? ` · file ghi tên PH khác cùng số: ${m.otherParentNames.join(", ")} (giữ nguyên tên PH hiện tại)`
            : "";
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
                content: `Gộp thêm ${added} con từ import Excel (sự kiện) — trùng SĐT với lead có sẵn${otherNamesNote}`,
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
      error: `ℹ️ Đã gộp ${mergedChildren} con vào ${mergedLeads} lead có sẵn cùng SĐT (không tạo lead trùng số)`,
    });
  }
  revalidatePath("/leads");
  return NextResponse.json({ success, errors });
}
