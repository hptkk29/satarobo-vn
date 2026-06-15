import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getAuditActor } from "@/lib/audit/log";
import { parseLeadImportRow } from "@/lib/lead/import";
import { autoAssignNewLead } from "@/lib/lead/auto-assign";
import { can } from "@/lib/auth/permissions";

type ImportError = { row: number; error: string };

// POST /api/admin/import/leads — nhập nhiều lead từ Excel (thu ở sự kiện).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user, "leads:create")) {
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
  const [centers, courses] = await Promise.all([
    db.center.findMany({ where: { code: { not: null } }, select: { id: true, code: true } }),
    db.course.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  const centerByCode = new Map(centers.map((c) => [c.code, c.id]));
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
    if (d.centerCode) {
      centerId = centerByCode.get(d.centerCode) ?? null;
      if (!centerId) {
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
      courseId,
      source: d.source,
      note: d.note,
    });
  }

  // Chống trùng với lead đã tồn tại (theo SĐT).
  if (valid.length > 0) {
    const existing = await db.lead.findMany({
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
    await db.$transaction(async (tx) => {
      for (const v of valid) {
        const created = await tx.lead.create({
          data: {
            parentName: v.parentName,
            phone: v.phone,
            email: v.email,
            childName: v.childName,
            childAge: v.childAge,
            centerId: v.centerId,
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
