import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { parseVnYmd } from "@/lib/time/vn";
import {
  validateCostImport,
  type CostImportContext,
  type CostImportRow,
} from "@/lib/finance/cost-import";

// B-05 (§B.6.7) — import chi phí từ file mẫu.
//
// Khuôn theo `app/api/admin/import/holidays/route.ts`: client đọc file, gửi JSON `rows`.
// Phần validate THUẦN nằm ở `lib/finance/cost-import.ts` (có unit test), route này chỉ lo
// quyền, tra danh mục/cơ sở, và ghi.
//
// 🔴 BA điều khác với các trình import khác trong repo, đều có lý do:
//  1. **Mọi dòng vào `DRAFT`**, không vào thẳng báo cáo. Import là đường NHẬP, không phải
//     đường DUYỆT — gộp lại là bỏ mất bước kiểm của kế toán trên đúng lô dữ liệu dễ sai nhất.
//  2. **Báo ĐỦ dòng lỗi**, không dừng ở dòng đầu (xem ghi chú trong cost-import.ts).
//  3. **Chống trùng bằng `dedupeKey`** + `skipDuplicates`: import lại cùng file không đẻ
//     bản ghi thứ hai. Không có nó thì bấm nhầm hai lần là chi phí gấp đôi và lợi nhuận
//     tụt một nửa — sai theo hướng bi quan nên sẽ có người tin.

export const dynamic = "force-dynamic";

/** Đọc một ô có thể là chuỗi/số/Date từ file Excel về chuỗi thô. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(
      v.getUTCDate(),
    ).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    // Excel serial date (ngày kể từ 1899-12-30). Chỉ áp cho ô NGÀY — ô số tiền cũng là
    // number nhưng người gọi đưa qua `cell()` rồi `parseVndAmount()` xử, không đi nhánh này.
    return String(v);
  }
  return String(v).trim();
}

/** Excel serial → "YYYY-MM-DD" (giữ nguyên nếu đã là chuỗi ngày). */
function normaliseDateCell(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  if (/^\d+$/.test(raw)) {
    const serial = Number(raw);
    // Chặn số rác: serial hợp lệ nằm trong khoảng ~1900–2100.
    if (serial > 0 && serial < 100_000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
      ).padStart(2, "0")}`;
    }
  }
  return raw;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // `costs:manage` — import là NHẬP. Duyệt vẫn cần `costs:approve` ở màn sổ chi.
  if (!(await checkPermission("costs:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = (body as { rows?: unknown[] })?.rows;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "Không có dữ liệu" }, { status: 400 });
  }
  if (raw.length > 5000) {
    return NextResponse.json({ error: "Quá 5000 dòng" }, { status: 400 });
  }

  const actor = await resolveActor(session.user.id);
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;

  const [categories, centers] = await Promise.all([
    db.costCategory.findMany({
      where: { isActive: true },
      select: { id: true, code: true, isSystemFed: true },
    }),
    db.center.findMany({
      where: { isActive: true },
      select: { id: true, code: true },
    }),
  ]);

  const ctx: CostImportContext = {
    categories: new Map(
      categories.map((c) => [c.code.toUpperCase(), { id: c.id, isSystemFed: c.isSystemFed }]),
    ),
    // Chỉ đưa vào bảng tra những cơ sở người này ĐƯỢC PHÉP ghi ⇒ mã ngoài phạm vi rơi
    // vào nhánh "không tồn tại hoặc ngoài phạm vi" và bị BÁO LỖI, không im lặng bỏ qua.
    centers: new Map(
      centers
        .filter((c) => isGlobalAllowed || actor.visibleCenterIds.includes(c.id))
        .filter((c): c is { id: string; code: string } => !!c.code)
        .map((c) => [c.code.toUpperCase(), c.id]),
    ),
    allowCompanyLevel: isGlobalAllowed,
  };

  const rows: CostImportRow[] = raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      rowNumber: i + 2, // +2: dòng 1 là tiêu đề, người dùng đếm từ 1
      spentDate: normaliseDateCell(cell(o.spentDate ?? o["Ngày chi"])),
      categoryCode: cell(o.categoryCode ?? o["Mã đầu mục"]),
      centerCode: cell(o.centerCode ?? o["Mã cơ sở"]),
      amount: cell(o.amount ?? o["Số tiền"]),
      vendor: cell(o.vendor ?? o["Nhà cung cấp"]),
      note: cell(o.note ?? o["Ghi chú"]),
    };
  });

  const { parsed, errors, duplicatesInFile } = validateCostImport(rows, ctx);

  // Ngày đã qua regex ở validator, nhưng "2026-02-30" vẫn lọt regex — kiểm lịch thật.
  const bad: typeof errors = [];
  const toInsert = parsed.filter((p) => {
    const d = parseVnYmd(p.spentDate);
    if (!d) {
      bad.push({ rowNumber: p.rowNumber, message: `Ngày "${p.spentDate}" không có thật` });
      return false;
    }
    return true;
  });

  let created = 0;
  if (toInsert.length > 0) {
    const res = await db.costEntry.createMany({
      data: toInsert.map((p) => ({
        centerId: p.centerId,
        categoryId: p.categoryId,
        spentDate: parseVnYmd(p.spentDate)!,
        amount: p.amount,
        vendor: p.vendor,
        note: p.note,
        status: "DRAFT" as const,
        source: "IMPORT" as const,
        dedupeKey: p.dedupeKey,
        createdById: session.user.id,
      })),
      // Trùng với khoản ĐÃ CÓ trong DB (kể cả khoản nhập tay) thì bỏ qua, không lỗi.
      skipDuplicates: true,
    });
    created = res.count;
  }

  revalidatePath("/admin/chi-phi");

  const skippedExisting = toInsert.length - created;
  const rowErrors = [...errors, ...bad]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map((e) => ({ row: e.rowNumber, error: e.message }));

  // Hai con số "bỏ qua" hiện thành DÒNG THÔNG BÁO riêng, không nhét vào `errors`:
  // người dùng cần phân biệt "hệ thống từ chối dữ liệu của tôi" với "file của tôi lặp
  // dòng" với "khoản này đã có sẵn trong sổ". Gộp cả ba thành "không nhập được N dòng"
  // là bỏ mất đúng thông tin giúp họ sửa.
  if (duplicatesInFile > 0) {
    rowErrors.push({
      row: 0,
      error: `${duplicatesInFile} dòng bị lặp NGAY TRONG FILE — đã bỏ qua bản sau, không phải lỗi dữ liệu`,
    });
  }
  if (skippedExisting > 0) {
    rowErrors.push({
      row: 0,
      error: `${skippedExisting} khoản đã có sẵn trong sổ — bỏ qua để không nhập trùng`,
    });
  }

  // Khoá `success`/`errors[].row`/`errors[].error` là hợp đồng của `<ExcelImporter>`
  // (`components/admin/ExcelImporter.tsx`). Đổi tên khoá ở đây là màn import im lặng
  // báo "0 dòng thành công" trong khi server đã ghi đủ.
  return NextResponse.json({ success: created, errors: rowErrors });
}
