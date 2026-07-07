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
  const valid: Valid[] = [];
  const seenPhones = new Set<string>();

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

    // Chống trùng trong file.
    if (seenPhones.has(d.phone)) {
      errors.push({ row: rowNo, error: `Trùng SĐT trong file: ${d.phone}` });
      continue;
    }
    seenPhones.add(d.phone);

    valid.push({
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
    });
  }

  // Chống trùng với lead đã tồn tại (theo SĐT) — dedupe TOÀN HỆ THỐNG (không tạo
  // lead trùng SĐT giữa các cơ sở). sdb sẽ ẩn lead cơ sở khác → dùng bypass HẸP cho
  // đúng truy vấn này (chỉ select phone, không lộ PII khác) + ghi audit AC10.
  if (valid.length > 0) {
    if (getModelVisibleCenterIds("Lead", actor) !== "ALL") {
      await logScopeBypass(actor, "import/leads: dedupe SĐT lead toàn hệ thống");
    }
    const existing = await scopedDb(actor, { bypass: true }).lead.findMany({
      where: { phone: { in: valid.map((v) => v.phone) }, deletedAt: null },
      select: { phone: true },
    });
    const existingPhones = new Set(existing.map((e) => e.phone));
    for (let i = valid.length - 1; i >= 0; i--) {
      if (existingPhones.has(valid[i].phone)) {
        errors.push({ row: 0, error: `SĐT đã tồn tại trong CRM — bỏ qua: ${valid[i].phone}` });
        valid.splice(i, 1);
      }
    }
  }

  if (valid.length === 0) return NextResponse.json({ success: 0, errors });

  const { actorId, actorName } = getAuditActor(session);
  let success = 0;
  const createdIds: string[] = [];
  try {
    await sdb.$transaction(async (tx) => {
      for (const v of valid) {
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
            activities: {
              create: {
                actorId,
                actorName,
                type: "NOTE",
                content: "Nhập lead từ Excel (sự kiện)",
                metadata: { system: true },
              },
            },
          },
          select: { id: true },
        });
        createdIds.push(created.id);
        success++;
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

  revalidatePath("/leads");
  return NextResponse.json({ success, errors });
}
