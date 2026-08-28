// B-05 (§B.6.7) — phần THUẦN của trình import chi phí: khoá chống trùng + validate
// từng dòng. Không chạm DB nên test được không cần Postgres.
//
// 🔴 Hai quy tắc quan trọng hơn code:
//  1. **Báo ĐỦ dòng lỗi**, không dừng ở dòng đầu tiên. Kế toán import 200 dòng mà mỗi
//     lần chỉ biết một lỗi thì phải chạy 200 lượt — và sẽ bỏ cuộc, quay lại nhập tay.
//  2. Đầu phí `isSystemFed` (ADS) bị **từ chối ngay ở validator**. Đây là chốt chặn thứ
//     nhất chống trừ hai lần tiền quảng cáo; chốt thứ hai nằm ở truy vấn B2. Trùng lặp
//     có chủ đích: mất một cái vẫn còn cái kia.

export type CostImportRow = {
  /** Số dòng trong file (tính cả dòng tiêu đề) — để báo lỗi người dùng tìm được. */
  rowNumber: number;
  spentDate: string;
  categoryCode: string;
  centerCode: string;
  amount: string;
  vendor: string;
  note: string;
};

export type CostImportError = { rowNumber: number; message: string };

export type CostImportParsed = {
  rowNumber: number;
  spentDate: string;
  categoryId: string;
  centerId: string | null;
  amount: number;
  vendor: string | null;
  note: string | null;
  dedupeKey: string;
};

export type CostImportContext = {
  /** code → id của đầu phí đang bật, kèm cờ do-hệ-thống-nạp. */
  categories: Map<string, { id: string; isSystemFed: boolean }>;
  /** code → id của cơ sở người dùng ĐƯỢC PHÉP ghi. */
  centers: Map<string, string>;
  /** Người dùng có được ghi chi phí cấp công ty không (centerCode để trống). */
  allowCompanyLevel: boolean;
};

/**
 * Khoá chống trùng của một khoản chi.
 *
 * ⚠️ Cố ý KHÔNG gồm `note`: kế toán import lại file đã sửa mỗi ghi chú thì đó vẫn là
 * cùng một khoản chi, không phải khoản thứ hai. Gồm `vendor` vì hai hoá đơn cùng ngày,
 * cùng đầu mục, cùng số tiền nhưng khác nhà cung cấp là hai khoản thật.
 *
 * ⚠️ Cũng cố ý KHÔNG gồm nguồn (MANUAL/IMPORT): nhập tay rồi import lại đúng khoản đó
 * phải bị chặn, chứ không phải tạo bản thứ hai.
 */
export function buildCostDedupeKey(input: {
  spentDate: string;
  categoryId: string;
  centerId: string | null;
  amount: number;
  vendor: string | null;
}): string {
  return [
    input.spentDate,
    input.categoryId,
    input.centerId ?? "COMPANY",
    String(input.amount),
    (input.vendor ?? "").trim().toLowerCase(),
  ].join("|");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Đọc số tiền kiểu người Việt gõ: "1.200.000", "1 200 000", "1200000", "1.200.000₫".
 *
 * ⚠️ DẤU PHẨY BỊ TỪ CHỐI, có chủ đích. Ở Việt Nam dấu phẩy là dấu THẬP PHÂN, nên "1,5"
 * nghĩa là một-phẩy-năm. Nếu bỏ dấu phẩy đi như bỏ dấu chấm thì "1,5" thành **15** —
 * một con số sai, im lặng, và trông hợp lệ. VND không có đơn vị lẻ trong sổ sách của
 * hệ này (`amount` là `Int`), nên đầu vào có dấu phẩy chắc chắn là người gõ nhầm hoặc
 * đang nghĩ theo đơn vị khác ("1,5 triệu"). Từ chối và bắt họ ghi rõ là đúng.
 */
export function parseVndAmount(raw: string): number | null {
  if (raw.includes(",")) return null;
  const cleaned = raw.replace(/[.\s]/g, "").replace(/₫|đ|VND/gi, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function validateCostImport(
  rows: readonly CostImportRow[],
  ctx: CostImportContext,
): { parsed: CostImportParsed[]; errors: CostImportError[]; duplicatesInFile: number } {
  const errors: CostImportError[] = [];
  const parsed: CostImportParsed[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;

  for (const r of rows) {
    const push = (message: string) => errors.push({ rowNumber: r.rowNumber, message });

    const spentDate = r.spentDate.trim();
    if (!DATE_RE.test(spentDate)) {
      push(`Ngày chi "${r.spentDate}" không đúng dạng YYYY-MM-DD`);
      continue;
    }

    const code = r.categoryCode.trim().toUpperCase();
    const category = ctx.categories.get(code);
    if (!category) {
      push(`Đầu mục "${r.categoryCode}" không có trong danh mục đang dùng`);
      continue;
    }
    if (category.isSystemFed) {
      // Thông báo nói rõ HẬU QUẢ chứ không chỉ nói "không được phép" — người nhập cần
      // hiểu vì sao, nếu không họ sẽ tìm cách lách bằng đầu mục "Chi phí khác".
      push(
        `Đầu mục "${code}" do hệ thống tự nạp từ dữ liệu quảng cáo — nhập vào đây sẽ làm lợi nhuận bị trừ hai lần`,
      );
      continue;
    }

    const centerCode = r.centerCode.trim().toUpperCase();
    let centerId: string | null = null;
    if (centerCode === "") {
      if (!ctx.allowCompanyLevel) {
        push("Bỏ trống cơ sở nghĩa là chi phí cấp công ty — bạn không có quyền ghi mục này");
        continue;
      }
    } else {
      const found = ctx.centers.get(centerCode);
      if (!found) {
        push(`Cơ sở "${r.centerCode}" không tồn tại hoặc ngoài phạm vi của bạn`);
        continue;
      }
      centerId = found;
    }

    const amount = parseVndAmount(r.amount);
    if (amount === null) {
      push(`Số tiền "${r.amount}" không hợp lệ (phải là số nguyên dương)`);
      continue;
    }

    const vendor = r.vendor.trim() || null;
    const dedupeKey = buildCostDedupeKey({
      spentDate,
      categoryId: category.id,
      centerId,
      amount,
      vendor,
    });
    if (seen.has(dedupeKey)) {
      // Trùng NGAY TRONG FILE — báo riêng, không lẫn vào lỗi: người dùng cần biết đó là
      // file của họ lặp dòng chứ không phải hệ thống từ chối.
      duplicatesInFile++;
      continue;
    }
    seen.add(dedupeKey);

    parsed.push({
      rowNumber: r.rowNumber,
      spentDate,
      categoryId: category.id,
      centerId,
      amount,
      vendor,
      note: r.note.trim() || null,
      dedupeKey,
    });
  }

  return { parsed, errors, duplicatesInFile };
}
