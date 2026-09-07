// lib/finance/ghi-nhan.test.ts — CỔNG chống mọc lại bản chép tay của trục B.
//
// Bước 4b. Trục B ("hệ thống đã ghi nhận bao nhiêu") từng có 9 nơi tự gõ lại điều kiện
// `saleStatus: "RECORDED", deletedAt: null`. Chín bản chép tay nghĩa là chín cơ hội để một
// người sửa lệch một chỗ mà không ai biết — mà đây là con số in trên mã QR và con số máy
// dùng để đối khớp tiền về.
//
// Cổng này KHÔNG cấm chuỗi `saleStatus: "RECORDED"` — nó là giá trị hợp lệ khi GHI một
// phiếu thu mới. Cổng chỉ cấm dùng chuỗi đó làm ĐIỀU KIỆN LỌC ngoài `ghi-nhan.ts`.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { KHOAN_DA_GHI_NHAN, sumRecorded } from "./ghi-nhan";

const GOC = process.cwd();
const THU_MUC_QUET = ["app", "lib"];

/**
 * Nơi được phép còn chuỗi `saleStatus: "RECORDED"` — kèm LÝ DO.
 *
 * Luật thêm dòng mới: chỉ khi đó là chỗ **GHI** (tạo phiếu thu / ghi AuditLog.newValues).
 * Nếu là chỗ **ĐỌC** thì không xin ngoại lệ — dùng `KHOAN_DA_GHI_NHAN`.
 */
const NGOAI_LE: Record<string, string> = {
  "lib/finance/ghi-nhan.ts": "chính là nhà của trục B",
  "lib/finance/ghi-nhan.test.ts": "TEST: chính cổng này — khẳng định hình dạng hằng",
  "lib/finance/payment.ts": "GHI: tạo phiếu thu + AuditLog.newValues (đường đọc đã dùng hằng)",
  "lib/crm/backfill-order.ts": "GHI: tạo phiếu thu backfill khi chuyển dữ liệu",
  "lib/payments/payos-ingest.ts": "GHI: tạo phiếu thu từ cổng thanh toán",
  "lib/payments/summary.test.ts": "TEST: khẳng định đúng hình dạng `where` mà hằng sinh ra",
};

function duyet(thuMuc: string, ra: string[]): void {
  for (const ten of readdirSync(thuMuc)) {
    if (ten === "node_modules" || ten === ".next") continue;
    const duongDan = join(thuMuc, ten);
    if (statSync(duongDan).isDirectory()) duyet(duongDan, ra);
    else if (/\.tsx?$/.test(ten)) ra.push(duongDan);
  }
}

function quetTatCaFile(): string[] {
  const ra: string[] = [];
  for (const t of THU_MUC_QUET) duyet(join(GOC, t), ra);
  return ra;
}

describe("[BUOC-4b] trục B chỉ có MỘT nhà", () => {
  const files = quetTatCaFile();

  it("quét được đủ file (chống cổng rỗng)", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("không nơi nào ngoài ghi-nhan.ts tự gõ lại điều kiện `saleStatus: RECORDED`", () => {
    const viPham: string[] = [];
    for (const f of files) {
      const key = relative(GOC, f).split(sep).join("/");
      if (NGOAI_LE[key]) continue;
      const noiDung = readFileSync(f, "utf8");
      if (/saleStatus:\s*"RECORDED"/.test(noiDung)) viPham.push(key);
    }
    expect(viPham, `Dùng KHOAN_DA_GHI_NHAN từ @/lib/finance/ghi-nhan thay vì gõ tay:\n${viPham.join("\n")}`).toEqual([]);
  });

  it("mọi ngoại lệ khai trong NGOAI_LE đều còn tồn tại và còn chứa chuỗi đó", () => {
    // Ngoại lệ chết là ngoại lệ nguy hiểm: nó nới cổng cho một file đã dọn xong.
    for (const [key, lyDo] of Object.entries(NGOAI_LE)) {
      const noiDung = readFileSync(join(GOC, key), "utf8");
      expect(/saleStatus:\s*"RECORDED"/.test(noiDung), `${key} (${lyDo}) không còn chuỗi — xoá khỏi NGOAI_LE`).toBe(true);
    }
  });
});

describe("[BUOC-4b] hằng của trục B", () => {
  it("KHÔNG lọc theo accountantStatus — khoản chờ kế toán vẫn là tiền đã về", () => {
    expect(KHOAN_DA_GHI_NHAN).toEqual({ saleStatus: "RECORDED", deletedAt: null });
    expect("accountantStatus" in KHOAN_DA_GHI_NHAN).toBe(false);
  });

  it("KHÔNG lọc theo paymentType — bút toán ADJUSTMENT mang delta nên phải được cộng", () => {
    expect("paymentType" in KHOAN_DA_GHI_NHAN).toBe(false);
  });

  it("KHÔNG ép khoá enrollmentId — payos-ingest không bao giờ set, ép là nuốt tiền", () => {
    expect("enrollmentId" in KHOAN_DA_GHI_NHAN).toBe(false);
    expect(sumRecorded.length).toBe(1); // khoá duy nhất: orderId
  });
});
