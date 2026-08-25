/**
 * V-02 — vế "CHỖ HIỂN THỊ" của hợp đồng `spendAvailable`.
 *
 * `lib/crm/funnel-query.test.ts` chứng minh con số ĐÚNG (QLCS không đọc được chi phí toàn
 * công ty). File này chứng minh con số đó được TRÌNH BÀY đúng — phần trước đây không có một
 * khẳng định nào, nên trang vẫn in "Chi phí QC: 0 · CPL: 0 · CPA: 0 · ROAS: 0.00" cho quản
 * lý cơ sở, tức đổi một lỗi (rò tiền toàn công ty) lấy một lỗi ngược chiều (số 0 sai).
 */
import { describe, it, expect } from "vitest";
import { buildFunnelCards, KHONG_DO_DUOC, type FunnelCardInput } from "@/lib/crm/funnel-cards";
import { computeFunnelMetrics } from "@/lib/crm/marketing-metrics";

/** Bảng số của QLCS CS1: đếm được lead/doanh thu, KHÔNG đo được chi phí QC. */
const cuaQlcs: FunnelCardInput = {
  l1: 2,
  l2: 2,
  l3: 1,
  spend: 0,
  revenue: 1_000_000,
  spendAvailable: false,
};

/** Bảng số của Hội sở: đo được tất cả. */
const cuaHoiSo: FunnelCardInput = {
  l1: 8,
  l2: 5,
  l3: 3,
  spend: 9_000_000,
  revenue: 8_000_000,
  spendAvailable: true,
};

const oTheo = (input: FunnelCardInput, label: string) => {
  const card = buildFunnelCards(input, computeFunnelMetrics(input)).find((c) => c.label === label);
  if (!card) throw new Error(`Không có thẻ "${label}" — bộ thẻ đã đổi, sửa test cho khớp.`);
  return card;
};

const O_PHU_THUOC_CHI_PHI = ["Chi phí QC", "CPL", "CPA", "ROAS"] as const;

describe("[V-02] spendAvailable = false ⇒ KHÔNG in số 0", () => {
  for (const label of O_PHU_THUOC_CHI_PHI) {
    it(`"${label}" hiện "${KHONG_DO_DUOC}", không phải 0`, () => {
      const o = oTheo(cuaQlcs, label);
      expect(o.value).toBe(KHONG_DO_DUOC);
      expect(o.khongDoDuoc).toBe(true);
    });
  }

  it("KHÔNG ô nào trong 4 ô đó chứa chuỗi '0' (kể cả '0.00' của ROAS)", () => {
    const cards = buildFunnelCards(cuaQlcs, computeFunnelMetrics(cuaQlcs));
    const bon = cards.filter((c) => (O_PHU_THUOC_CHI_PHI as readonly string[]).includes(c.label));
    expect(bon).toHaveLength(4);
    for (const c of bon) expect(c.value).not.toMatch(/\d/);
  });

  it("L1/L2/L3 + CR VẪN hiện số thật — chúng đã lọc theo cơ sở nên đúng ở mọi phạm vi", () => {
    expect(oTheo(cuaQlcs, "L1 (hội thoại)").value).toBe("2");
    expect(oTheo(cuaQlcs, "L2 (đạt SĐT)").value).toBe("2");
    expect(oTheo(cuaQlcs, "L3 (chốt)").value).toBe("1");
    expect(oTheo(cuaQlcs, "CR L2→L3").value).toBe("50.0%");
    // Và chúng KHÔNG bị đánh dấu "không đo được".
    expect(oTheo(cuaQlcs, "L2 (đạt SĐT)").khongDoDuoc).toBeUndefined();
  });
});

describe("[V-02] spendAvailable = true ⇒ hiển thị y như trước (không đổi nghĩa cho Hội sở)", () => {
  it("Chi phí QC / CPL / CPA / ROAS ra số thật", () => {
    expect(oTheo(cuaHoiSo, "Chi phí QC").value).toBe((9_000_000).toLocaleString("vi-VN"));
    // CPL = 9tr / 5 L2 = 1.8tr · CPA = 9tr / 3 L3 = 3tr · ROAS = 8tr / 9tr.
    expect(oTheo(cuaHoiSo, "CPL").value).toBe((1_800_000).toLocaleString("vi-VN"));
    expect(oTheo(cuaHoiSo, "CPA").value).toBe((3_000_000).toLocaleString("vi-VN"));
    expect(oTheo(cuaHoiSo, "ROAS").value).toBe("0.89");
  });

  it("không ô nào bị đánh dấu 'không đo được'", () => {
    const cards = buildFunnelCards(cuaHoiSo, computeFunnelMetrics(cuaHoiSo));
    expect(cards.every((c) => !c.khongDoDuoc)).toBe(true);
  });

  it("chi phí thật = 0 đồng VẪN in '0' — 'không chạy quảng cáo' khác 'không đo được'", () => {
    const khongChayQc: FunnelCardInput = { ...cuaHoiSo, spend: 0, spendAvailable: true };
    expect(oTheo(khongChayQc, "Chi phí QC").value).toBe("0");
    expect(oTheo(khongChayQc, "Chi phí QC").khongDoDuoc).toBe(false);
  });
});
