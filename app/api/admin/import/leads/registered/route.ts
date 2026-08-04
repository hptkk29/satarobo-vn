// Task #07 Việc 1 — POST /api/admin/import/leads/registered
// Import danh sách "khách ĐÃ ĐĂNG KÝ" (file Excel thật của Sale, 3 sheet theo
// tháng) → Lead status REGISTERED + LeadChild per học viên.
//
// - multipart/form-data: file (.xlsx) + mode ("dry-run" | "confirm").
// - Dry-run BẮT BUỘC trước: trả preview {tổng, hợp lệ, lỗi, sẽ gộp, bỏ qua} —
//   KHÔNG ghi DB. Chỉ ghi khi mode=confirm.
// - Idempotent: import lại cùng file → 0 record mới (dedupe SĐT + tên con,
//   note đã có marker thì không append lại).
// - Parse/plan thuần ở lib/lead/import-registered.ts (unit-tested).
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
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
import { checkPermission } from "@/lib/auth/check-permission";
import {
  parseRegisteredSheets,
  type RegisteredRowOverride,
  planRegisteredImport,
  splitMergesByScope,
  buildCourseKeyMap,
  type SheetAoA,
  type CellValue,
  type ExistingLead,
} from "@/lib/lead/import-registered";

export const maxDuration = 60;

function err(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

const OVERRIDABLE = new Set([
  "grade", "course", "tuition", "center",
  "parentName", "parentCccd", "address", "note", "source", "sales",
]);

/**
 * Đọc danh sách ô đã sửa từ form. Bỏ qua im lặng những gì không hợp lệ thay vì
 * 400: một ô sửa hỏng không đáng làm hỏng cả lượt import 100 dòng — và cột không
 * nằm trong allowlist thì KHÔNG được đè (SĐT/tên học viên là định danh gộp trùng).
 */
function parseOverrides(raw: FormDataEntryValue | null): RegisteredRowOverride[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: RegisteredRowOverride[] = [];
  for (const it of arr.slice(0, 2000)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const sheet = typeof o.sheet === "string" ? o.sheet : null;
    const row = typeof o.row === "number" && Number.isInteger(o.row) ? o.row : null;
    if (!sheet || row === null || row < 1) continue;
    const vals = o.values;
    if (!vals || typeof vals !== "object") continue;
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(vals as Record<string, unknown>)) {
      if (!OVERRIDABLE.has(k)) continue;
      if (typeof v !== "string") continue;
      values[k] = v.slice(0, 300);
    }
    if (Object.keys(values).length > 0) {
      out.push({ sheet, row, values } as RegisteredRowOverride);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return err(401, "UNAUTHORIZED", "Chưa đăng nhập");
  // Guard leads:import (đã thêm vào registry lib/auth/permissions.ts —
  // SUPER_ADMIN/CENTER_MANAGER, pattern students:import).
  if (!(await checkPermission("leads:import"))) {
    return err(403, "FORBIDDEN", "Không có quyền import lead");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(400, "INVALID_BODY", "Body phải là multipart/form-data");
  }
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "dry-run");
  if (!(file instanceof File)) return err(400, "MISSING_FILE", "Thiếu file Excel");
  if (mode !== "dry-run" && mode !== "confirm") {
    return err(400, "INVALID_MODE", "mode phải là dry-run hoặc confirm");
  }
  if (file.size > 15 * 1024 * 1024) return err(400, "FILE_TOO_LARGE", "File quá 15MB");

  // ── Đọc workbook → AoA (KHÔNG cellDates: serial number giữ nguyên, parser tự
  // làm tròn về ngày — tránh lệch timezone).
  let sheets: SheetAoA[];
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    sheets = wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[name], {
        header: 1,
        defval: null,
        raw: true,
      }),
    }));
  } catch (e) {
    return err(400, "INVALID_XLSX", `Không đọc được file Excel: ${e instanceof Error ? e.message : "Unknown"}`);
  }

  // 04/08 — sửa tay ở màn xem thử. Nhận danh sách ô đã sửa, đè vào lúc phân tích
  // để MỌI suy diễn (tuổi, tiền, cơ sở, gộp trùng, cảnh báo) tính lại theo giá trị
  // người nhập nhìn thấy — không có khoảng lệch giữa bản xem và bản ghi.
  const overrides = parseOverrides(form.get("overrides"));
  const parsed = parseRegisteredSheets(sheets, overrides);

  // ── Context resolve từ DB (center/orgUnit theo code — dual-write 2-phase như
  // route import leads sự kiện; course theo tên/slug; user active cho fuzzy Sales).
  // Cách ly cơ sở: Center/OrgUnit/User exempt, Course global → sdb pass-through.
  // Lead trùng SĐT phải tra TOÀN HỆ THỐNG (câu 34 BGĐ: gộp về record CŨ NHẤT bất kể
  // cơ sở — sdb sẽ ẩn lead cơ sở khác và gây TẠO TRÙNG) → bypass HẸP cho đúng truy
  // vấn này + ghi audit AC10 khi actor không phải HO/SUPER_ADMIN.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const phones = parsed.parents.map((p) => p.phone);
  if (phones.length > 0 && getModelVisibleCenterIds("Lead", actor) !== "ALL") {
    await logScopeBypass(actor, "import/leads/registered: dedupe+gộp lead theo SĐT toàn hệ thống");
  }
  const [centers, orgUnits, courses, users, existingLeads] = await Promise.all([
    sdb.center.findMany({ where: { code: { not: null } }, select: { id: true, code: true } }),
    sdb.orgUnit.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    sdb.course.findMany({ select: { id: true, name: true, slug: true } }),
    sdb.user.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, role: true, roles: true },
    }),
    phones.length > 0
      ? scopedDb(actor, { bypass: true }).lead.findMany({
          // AUTH-SĐT P1 — tìm cả bản ghi `0…` cũ chưa backfill, nếu không thì
          // đường GỘP ngừng thấy lead cũ và import sẽ tạo lead trùng.
          where: { phone: { in: expandPhoneVariants(phones) }, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            parentName: true,
            phone: true,
            status: true,
            note: true,
            centerId: true,
            orgUnitId: true,
            courseId: true,
            assignedToId: true,
            children: {
              select: {
                id: true,
                fullName: true,
                gradeLevel: true,
                note: true,
                interestedCourseId: true,
                interestedCenterId: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // DB có thể chứa lead trùng SĐT (data cũ) → GỘP vào lead CŨ NHẤT (câu 34: giữ record cũ).
  const existingByPhone = new Map<string, ExistingLead>();
  for (const l of existingLeads) {
    // Key theo canonical: query trên trả về cả 2 dạng, key thô sẽ tra trượt.
    const k = phoneKey(l.phone);
    if (!existingByPhone.has(k)) existingByPhone.set(k, l as ExistingLead);
  }

  const plan = planRegisteredImport(parsed, {
    centerByCode: new Map(centers.filter((c) => c.code).map((c) => [c.code as string, c.id])),
    orgUnitByCode: new Map(orgUnits.filter((o) => o.code).map((o) => [o.code, o.id])),
    courseByKey: buildCourseKeyMap(courses),
    salesUsers: users.map((u) => ({
      id: u.id,
      name: u.name,
      roles: [...new Set([u.role, ...u.roles])],
    })),
    existingByPhone,
  });

  // ── Câu 34 (user chốt 09/07/2026): CHẶN gộp cross-center ──────────────────
  // Trước đây đường GỘP là dedupe SĐT toàn hệ thống: Sale CS1 import một SĐT đang thuộc
  // lead của CS2 thì ghi đè/bổ sung thẳng vào lead CS2 — vượt qua cách ly cơ sở, và
  // đường ghi KHÔNG được scopedDb bảo vệ (scopedDb chỉ scope READ).
  // Nay: existing lead có centerId ngoài phạm vi actor → KHÔNG gộp, KHÔNG tạo mới, chỉ
  // báo SĐT. Không trả tên phụ huynh / trạng thái / người phụ trách (không lộ cơ sở khác).
  // Lead untagged (centerId null) vẫn gộp — không phải dữ liệu của cơ sở nào.
  const { allowed: scopedMerges, rejectedPhones } = splitMergesByScope(
    plan.merges,
    new Map([...existingByPhone].map(([phone, l]) => [phone, l.centerId])),
    (centerId) => passesScope("Lead", { centerId }, actor),
  );
  const mergeRejected = rejectedPhones.map((sdt) => ({ sdt }));

  const changedMerges = scopedMerges.filter((m) => m.changed);

  // ── Cách ly cơ sở trên đường TẠO lead (DoD#4). scopedDb chỉ scope READ, KHÔNG
  // scope WRITE → chốt WRITE bằng passesScope per-lead như route import sự kiện
  // (app/api/admin/import/leads/route.ts): actor center-level KHÔNG được tạo lead
  // cho cơ sở NGOÀI phạm vi (vd Sale CS1 gặp dòng gắn CS2 → loại, không tạo lead CS2).
  // Lead untagged (centerId null) KHÔNG phải leak cross-center → giữ (tạo như hiện trạng;
  // gán cơ sở sau). Đường GỘP nay cũng bị chặn cross-center — xem `mergeRejected` bên dưới.
  const scopeRejected: { sdt: string; tenPH: string; coSo: string }[] = [];
  const scopedCreates = plan.creates.filter((c) => {
    if (c.centerId == null || passesScope("Lead", { centerId: c.centerId }, actor)) {
      return true;
    }
    scopeRejected.push({ sdt: c.phone, tenPH: c.parentName, coSo: c.centerId });
    return false;
  });

  const summary = {
    // Preview dry-run theo spec task #07.
    tongDongDoc: parsed.totalDataRows,
    boQua: parsed.skippedEmpty,
    hopLe: parsed.validRows,
    gopTrongFile: parsed.mergedDuplicateRows,
    loi: parsed.errors.map((e) => ({ sheet: e.sheet, dong: e.row, lyDo: e.reason })),
    phuHuynh: parsed.parents.length,
    hocVien: parsed.parents.reduce((n, p) => n + p.children.length, 0),
    seTao: scopedCreates.map((c) => ({
      sdt: c.phone,
      tenPH: c.parentName,
      soCon: c.children.length,
    })),
    ngoaiPhamVi: scopeRejected,
    seGop: scopedMerges.map((m) => ({
      sdt: m.phone,
      tenPH: m.parentName,
      soConMoi: m.newChildren.length,
      coThayDoi: m.changed,
    })),
    // Câu 34 — SĐT trùng lead cơ sở khác: không gộp, không tạo. Chỉ SĐT (không lộ tên).
    trungCoSoKhac: mergeRejected,
    salesKhongKhop: plan.unmatchedSales,
    khoaKhongKhop: plan.unmatchedCourses,
    coSoKhongKhop: plan.unmatchedCenters,
    // 04/08 — DÒNG CẦN KIỂM TRA: vẫn import được, nhưng thiếu/mờ thông tin. Liệt kê
    // ở màn xem thử để người nhập sửa NGAY TRONG EXCEL rồi tải lại, thay vì import
    // xong mới đi dò từng lead từng phụ huynh.
    canKiemTra: parsed.parents.flatMap((p) =>
      p.children
        .filter((c) => c.warnings.length > 0)
        .map((c) => ({
          sdt: p.phone,
          hocVien: c.fullName,
          sheet: c.sources[0]?.sheet ?? "",
          dong: c.sources[0]?.row ?? 0,
          thieu: c.warnings,
          daDong: c.paidAmount,
          cachDong: c.feeMode,
          tuoi: c.ageYears,
          // Giá trị ĐANG dùng (đã tính cả ô người nhập vừa sửa) → đổ vào ô nhập
          // trên màn, để sửa tiếp là sửa trên chính con số mình đang nhìn.
          giaTri: {
            grade: c.grade ?? "",
            course: c.courseRaw ?? "",
            tuition: c.tuitionRaw ?? "",
            center: c.centerCode ?? "",
            parentName: p.parentName ?? "",
            parentCccd: p.parentCccd ?? "",
            address: p.address ?? "",
            note: c.noteRaw ?? "",
          },
        })),
    ),
  };

  if (mode === "dry-run") {
    return NextResponse.json({ ok: true, data: { mode, ...summary } });
  }

  // ── mode=confirm: ghi DB trong transaction.
  const { actorId, actorName } = getAuditActor(session);
  let createdLeads = 0;
  let createdChildren = 0;
  let mergedLeads = 0;
  try {
    await sdb.$transaction(
      async (tx) => {
        for (const c of scopedCreates) {
          await tx.lead.create({
            data: {
              parentName: c.parentName,
              phone: c.phone,
              centerId: c.centerId,
              orgUnitId: c.orgUnitId, // dual-write 2-phase
              courseId: c.courseId,
              assignedToId: c.assignedToId,
              assignedAt: c.assignedToId ? new Date() : null,
              // BGĐ câu 4(1): khách ĐÃ đăng ký → REGISTERED trực tiếp (backfill,
              // không đi transition guard C4). Convert → flow convert v2.
              status: "REGISTERED",
              source: c.source,
              note: c.note,
              children: {
                create: c.children.map((ch) => ({
                  fullName: ch.fullName,
                  gradeLevel: ch.gradeLevel,
                  ageYears: ch.ageYears,
                  interestedCourseId: ch.interestedCourseId,
                  interestedCenterId: ch.interestedCenterId,
                  note: ch.note,
                })),
              },
              activities: {
                create: {
                  actorId,
                  actorName,
                  type: "NOTE",
                  content: `Nhập từ Excel danh sách đăng ký (REGISTERED, ${c.children.length} học viên)`,
                  metadata: { system: true, import: "registered-excel" },
                },
              },
            },
            select: { id: true },
          });
          createdLeads++;
          createdChildren += c.children.length;
        }

        for (const m of changedMerges) {
          const existing = existingByPhone.get(m.phone);
          await tx.lead.update({
            where: { id: m.leadId },
            data: {
              ...m.set,
              ...(m.noteAppend
                ? { note: existing?.note ? `${existing.note}\n\n${m.noteAppend}` : m.noteAppend }
                : {}),
              ...(m.set.assignedToId ? { assignedAt: new Date() } : {}),
              children: {
                create: m.newChildren.map((ch) => ({
                  fullName: ch.fullName,
                  gradeLevel: ch.gradeLevel,
                  interestedCourseId: ch.interestedCourseId,
                  interestedCenterId: ch.interestedCenterId,
                  note: ch.note,
                })),
              },
              activities: {
                create: {
                  actorId,
                  actorName,
                  type: "NOTE",
                  content: `Gộp từ Excel danh sách đăng ký (bổ sung field trống${m.newChildren.length > 0 ? `, +${m.newChildren.length} học viên` : ""}${m.set.status ? ", chuyển REGISTERED" : ""})`,
                  metadata: { system: true, import: "registered-excel", merge: true },
                },
              },
            },
          });
          for (const cu of m.childUpdates) {
            const before = existing?.children.find((ch) => ch.id === cu.childId);
            await tx.leadChild.update({
              where: { id: cu.childId },
              data: {
                ...cu.set,
                ...(cu.noteAppend
                  ? { note: before?.note ? `${before.note}\n\n${cu.noteAppend}` : cu.noteAppend }
                  : {}),
              },
            });
          }
          mergedLeads++;
          createdChildren += m.newChildren.length;
        }
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    return err(500, "WRITE_FAILED", `Lỗi ghi DB: ${e instanceof Error ? e.message : "Unknown"}`);
  }

  revalidatePath("/leads");
  return NextResponse.json({
    ok: true,
    data: {
      mode,
      ...summary,
      daTaoLead: createdLeads,
      daTaoHocVien: createdChildren,
      daGopLead: mergedLeads,
      khongDoi: plan.merges.length - changedMerges.length,
    },
  });
}
