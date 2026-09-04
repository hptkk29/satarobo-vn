// W3-1 / LMS-9 — computeRefund (THUẦN). Pure: Σ confirmed − buổi đã học × đơn giá, clamp ≥0.
// HT (27/08/2026) — thêm `soTienConCoTheHoan`: mẫu số của computeRefund phải là số CÒN
// LẠI THẬT, không phải số gộp. Trước khi vá, lần hoàn thứ hai đề xuất trên số gộp như
// thể lần một chưa xảy ra — đó là đường hoàn dư.
import { describe, it, expect } from "vitest";
import { computeRefund, soTienConCoTheHoan } from "@/lib/finance/refund";

describe("[W3-1] computeRefund", () => {
  it("đơn giá = round(finalPrice / sessionsTotal)", () => {
    expect(computeRefund({ paidConfirmed: 0, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 0 }).unitPrice).toBe(375_000);
    // làm tròn
    expect(computeRefund({ paidConfirmed: 0, finalPrice: 1_000_000, sessionsTotal: 3, sessionsLearned: 0 }).unitPrice).toBe(333_333);
  });

  it("chưa học buổi nào → hoàn ≈ đã đóng", () => {
    const r = computeRefund({ paidConfirmed: 9_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 0 });
    expect(r.proposedAmount).toBe(9_000_000);
  });

  it("học giữa khoá → hoàn = đã đóng − buổi học × đơn giá", () => {
    // 9tr / 24 buổi = 375k. Đã đóng 9tr, học 8 buổi → 9tr − 8×375k = 6tr.
    const r = computeRefund({ paidConfirmed: 9_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 8 });
    expect(r.unitPrice).toBe(375_000);
    expect(r.proposedAmount).toBe(6_000_000);
  });

  it("học hết → hoàn 0", () => {
    const r = computeRefund({ paidConfirmed: 9_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 24 });
    expect(r.proposedAmount).toBe(0);
  });

  it("clamp ≥ 0 (học quá số buổi / đóng thiếu)", () => {
    const r = computeRefund({ paidConfirmed: 1_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 24 });
    expect(r.proposedAmount).toBe(0);
  });

  it("sessionsTotal = 0 → đơn giá 0, hoàn = đã đóng", () => {
    const r = computeRefund({ paidConfirmed: 2_000_000, finalPrice: 9_000_000, sessionsTotal: 0, sessionsLearned: 0 });
    expect(r.unitPrice).toBe(0);
    expect(r.proposedAmount).toBe(2_000_000);
  });
});

describe("[HT-20] soTienConCoTheHoan — mẫu số của đề xuất hoàn", () => {
  it("chưa hoàn lần nào → còn nguyên số thực thu", () => {
    expect(soTienConCoTheHoan({ thucThu: 9_000_000, daDuyetHoan: 0, daGhiSoHoan: 0 })).toBe(
      9_000_000,
    );
  });

  it("chưa thu đồng nào → 0 (không đẻ ra yêu cầu hoàn rỗng)", () => {
    expect(soTienConCoTheHoan({ thucThu: 0, daDuyetHoan: 0, daGhiSoHoan: 0 })).toBe(0);
  });

  it("hoàn lần một ĐÃ ghi sổ → thực thu đã tự trừ, không trừ thêm lần nữa", () => {
    // thucThu = 9tr − 4tr = 5tr; đề xuất đã duyệt 4tr và bút toán âm 4tr đã có.
    expect(soTienConCoTheHoan({ thucThu: 5_000_000, daDuyetHoan: 4_000_000, daGhiSoHoan: 4_000_000 })).toBe(
      5_000_000,
    );
  });

  it("đã DUYỆT nhưng kế toán CHƯA ghi bút toán âm → trừ phần đang chờ chi", () => {
    // Cửa sổ chết người: approveRefund() chỉ đổi trạng thái yêu cầu, KHÔNG ghi Payment âm.
    // Không trừ ở đây thì đề xuất lần hai vẫn đề nghị hoàn trọn 9tr.
    expect(soTienConCoTheHoan({ thucThu: 9_000_000, daDuyetHoan: 4_000_000, daGhiSoHoan: 0 })).toBe(
      5_000_000,
    );
  });

  it("kế toán ghi hoàn THẲNG, không qua đề xuất → không trừ âm hai lần", () => {
    // daGhiSoHoan > daDuyetHoan ⇒ phần "chờ chi" clamp về 0, chứ không cộng ngược lên.
    expect(soTienConCoTheHoan({ thucThu: 7_000_000, daDuyetHoan: 0, daGhiSoHoan: 2_000_000 })).toBe(
      7_000_000,
    );
  });

  it("đã duyệt hoàn nhiều hơn số còn lại → clamp về 0, không trả số âm", () => {
    expect(soTienConCoTheHoan({ thucThu: 3_000_000, daDuyetHoan: 9_000_000, daGhiSoHoan: 0 })).toBe(0);
  });

  it("hoàn vượt số đã thu (sổ đã âm) → 0, không đề xuất hoàn tiếp", () => {
    expect(soTienConCoTheHoan({ thucThu: -1_000_000, daDuyetHoan: 0, daGhiSoHoan: 0 })).toBe(0);
  });
});

describe("[HT-21] computeRefund trên mẫu số đã vá — hoàn lần hai", () => {
  // Ghi danh 9tr / 24 buổi, đã đóng đủ 9tr, học 8 buổi (đơn giá 375k).
  const KHOA = { finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 8 };

  it("lần một: đề xuất 6tr", () => {
    const conLai = soTienConCoTheHoan({ thucThu: 9_000_000, daDuyetHoan: 0, daGhiSoHoan: 0 });
    expect(computeRefund({ paidConfirmed: conLai, ...KHOA }).proposedAmount).toBe(6_000_000);
  });

  it("lần hai SAU khi đã hoàn 6tr và ghi sổ: đề xuất 0 — không hoàn dư", () => {
    const conLai = soTienConCoTheHoan({
      thucThu: 3_000_000, // 9tr − 6tr đã hoàn
      daDuyetHoan: 6_000_000,
      daGhiSoHoan: 6_000_000,
    });
    expect(conLai).toBe(3_000_000);
    // 3tr − 8×375k = 0 → clamp.
    expect(computeRefund({ paidConfirmed: conLai, ...KHOA }).proposedAmount).toBe(0);
  });

  it("LỖI CŨ tái hiện: lấy số gộp làm mẫu số → đề xuất 6tr lần thứ hai (hoàn dư)", () => {
    // Đây là hành vi trước khi vá — giữ lại làm mốc so sánh, KHÔNG phải hành vi mong muốn.
    expect(computeRefund({ paidConfirmed: 9_000_000, ...KHOA }).proposedAmount).toBe(6_000_000);
  });

  it("lần hai KHI lần một đã duyệt mà chưa ghi sổ: cũng không đề xuất dư", () => {
    const conLai = soTienConCoTheHoan({
      thucThu: 9_000_000, // bút toán âm chưa được kế toán ghi
      daDuyetHoan: 6_000_000,
      daGhiSoHoan: 0,
    });
    expect(conLai).toBe(3_000_000);
    expect(computeRefund({ paidConfirmed: conLai, ...KHOA }).proposedAmount).toBe(0);
  });
});
