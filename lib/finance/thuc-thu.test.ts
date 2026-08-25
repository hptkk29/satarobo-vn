// B-02 / quyết định B3 (24/08/2026) — "thực thu" là MỘT công thức duy nhất.
// Ba tình huống bắt buộc: thu thường · có hoàn · có điều chỉnh giảm.
import { describe, it, expect } from "vitest";
import {
  tinhThucThu,
  butToanThucThu,
  WHERE_THUC_THU,
  TRANG_THAI_THUC_THU,
  type ThucThuButToan,
} from "@/lib/finance/thuc-thu";

/** Dựng 1 bút toán Payment phẳng cho test. */
function bt(
  id: string,
  amount: number,
  accountantStatus: string,
  adjustmentOfId: string | null = null,
): ThucThuButToan {
  return { id, amount, accountantStatus, adjustmentOfId };
}

describe("[B-02] tinhThucThu — thu thường", () => {
  it("cộng đúng các khoản kế toán ĐÃ xác nhận", () => {
    expect(tinhThucThu([bt("p1", 5_000_000, "CONFIRMED"), bt("p2", 3_000_000, "CONFIRMED")])).toBe(
      8_000_000,
    );
  });

  it("không có bút toán nào → 0", () => {
    expect(tinhThucThu([])).toBe(0);
  });

  it("khoản Sale mới ghi nhận (PENDING) và khoản bị từ chối (REJECTED) KHÔNG phải tiền thật", () => {
    expect(
      tinhThucThu([
        bt("p1", 5_000_000, "CONFIRMED"),
        bt("p2", 9_000_000, "PENDING"),
        bt("p3", 7_000_000, "REJECTED"),
      ]),
    ).toBe(5_000_000);
  });
});

describe("[B-02] tinhThucThu — có hoàn tiền", () => {
  it("hoàn toàn bộ → thực thu về 0, KHÔNG còn phồng bằng khoản gốc", () => {
    // refundPayment() ghi bút toán ÂM, trỏ adjustmentOfId về gốc, KHÔNG xoá gốc.
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -5_000_000, "REFUNDED", "p1")];
    expect(tinhThucThu(rows)).toBe(0);
  });

  it("hoàn một phần → trừ đúng phần đã hoàn", () => {
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")];
    expect(tinhThucThu(rows)).toBe(3_000_000);
  });

  it("bút toán hoàn KHÔNG thay thế bản gốc (hoàn là đối ứng, không phải sửa số)", () => {
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("r1", -2_000_000, "REFUNDED", "p1")];
    expect(butToanThucThu(rows).map((r) => r.id).sort()).toEqual(["p1", "r1"]);
  });
});

describe("[B-02] tinhThucThu — có điều chỉnh giảm", () => {
  it("bản điều chỉnh THAY THẾ bản gốc: không cộng đôi, không giữ số cũ", () => {
    // adjustPayment() tạo bản MỚI (ADJUSTED) mang số đúng, bản gốc CONFIRMED giữ nguyên.
    const rows = [bt("p1", 5_000_000, "CONFIRMED"), bt("a1", 3_000_000, "ADJUSTED", "p1")];
    expect(tinhThucThu(rows)).toBe(3_000_000); // KHÔNG 8tr (cộng đôi), KHÔNG 5tr (số cũ)
    expect(butToanThucThu(rows).map((r) => r.id)).toEqual(["a1"]);
  });

  it("điều chỉnh TĂNG cũng theo đúng bản mới", () => {
    const rows = [bt("p1", 3_000_000, "CONFIRMED"), bt("a1", 5_000_000, "ADJUSTED", "p1")];
    expect(tinhThucThu(rows)).toBe(5_000_000);
  });

  it("chuỗi điều chỉnh nhiều lần → chỉ bản cuối cùng được tính", () => {
    const rows = [
      bt("p1", 5_000_000, "CONFIRMED"),
      bt("a1", 4_000_000, "ADJUSTED", "p1"),
      bt("a2", 3_000_000, "ADJUSTED", "a1"),
    ];
    expect(tinhThucThu(rows)).toBe(3_000_000);
  });

  it("điều chỉnh giảm rồi hoàn nốt → 0", () => {
    const rows = [
      bt("p1", 5_000_000, "CONFIRMED"),
      bt("a1", 3_000_000, "ADJUSTED", "p1"),
      bt("r1", -3_000_000, "REFUNDED", "a1"),
    ];
    expect(tinhThucThu(rows)).toBe(0);
  });

  it("điều chỉnh trên khoản CHƯA xác nhận không kéo theo tiền ảo", () => {
    // Gốc PENDING (chưa phải tiền thật) — bản ADJUSTED mới là số kế toán chốt.
    const rows = [bt("p1", 5_000_000, "PENDING"), bt("a1", 3_000_000, "ADJUSTED", "p1")];
    expect(tinhThucThu(rows)).toBe(3_000_000);
  });
});

describe("[B-02] hợp đồng where dùng chung", () => {
  it("chỉ 3 trạng thái tham gia phép tính thực thu", () => {
    expect([...TRANG_THAI_THUC_THU].sort()).toEqual(["ADJUSTED", "CONFIRMED", "REFUNDED"]);
  });

  it("where chuẩn loại bản ghi xoá mềm VÀ loại bản gốc đã bị điều chỉnh thay thế", () => {
    // Mảnh `where` này là bản dịch SQL của đúng luật mà butToanThucThu() cài đặt.
    // Bỏ nhánh `adjustments.none` = bản gốc quay lại phép cộng ⇒ doanh thu phồng lại.
    expect(WHERE_THUC_THU.deletedAt).toBeNull();
    expect(WHERE_THUC_THU.accountantStatus).toEqual({ in: [...TRANG_THAI_THUC_THU] });
    expect(WHERE_THUC_THU.adjustments).toEqual({
      none: { accountantStatus: "ADJUSTED", deletedAt: null },
    });
  });

  it("lọc theo where chuẩn rồi vẫn qua hàm thuần thì kết quả không đổi (idempotent)", () => {
    const rows = [bt("a1", 3_000_000, "ADJUSTED", "p1"), bt("r1", -1_000_000, "REFUNDED", "a1")];
    expect(tinhThucThu(butToanThucThu(rows))).toBe(tinhThucThu(rows));
  });
});
