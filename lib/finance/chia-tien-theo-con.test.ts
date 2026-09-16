// Ca [CTC-*] — chia một giao dịch ngân hàng đích danh theo đợt (PHIÊN B).
//
// Bốn trong bảy ca chủ dự án yêu cầu là luật SỐ HỌC thuần, kiểm được ở đây không cần Postgres:
//   · 5.016.000 chia 2 con            → [CTC-01]
//   · 1 giao dịch chia 2 đợt          → [CTC-01]
//   · Σ ≠ số tiền giao dịch → chặn    → [CTC-03]
//   · vượt nợ → chặn                  → [CTC-02]
// Ba ca còn lại (3 giao dịch vào một đợt · gỡ gắn · sale bấm IGNORED) là luật về ĐƯỜNG GHI và
// về QUYỀN — chúng ở `tests/finance/gan-theo-con.test.ts` (chạm DB thật) và
// `lib/finance/quyen-doi-soat.test.ts`.
import { describe, it, expect } from "vitest";
import {
  kiemChiaTheoCon,
  dungDotDeChia,
  type DotDeChia,
  type TranCuaCon,
} from "./chia-tien-theo-con";

const AN = "oi-an";
const BINH = "oi-binh";

/** Đúng con số thật trên prod: một giao dịch 5.016.000đ cho HAI con. */
const GIAO_DICH_HAI_CON = 5_016_000;

const dot = (id: string, orderItemId: string | null, installmentNo: number, conLai: number, tenCon: string): DotDeChia => ({
  id,
  orderItemId,
  installmentNo,
  conLai,
  tenCon,
});

const tran = (orderItemId: string, ten: string, conNo: number): TranCuaCon => ({
  orderItemId,
  ten,
  conNo,
});

describe("[CTC-01] chia đúng — tiền của mỗi bé vào đúng đợt của bé đó", () => {
  it("5.016.000đ cho HAI con: 2.508.000 + 2.508.000", () => {
    const r = kiemChiaTheoCon({
      soTienGiaoDich: GIAO_DICH_HAI_CON,
      dong: [
        { paymentRequestId: "pr-an-1", soTien: 2_508_000 },
        { paymentRequestId: "pr-binh-1", soTien: 2_508_000 },
      ],
      dot: [
        dot("pr-an-1", AN, 1, 4_000_000, "Nguyễn Minh An"),
        dot("pr-binh-1", BINH, 1, 4_000_000, "Nguyễn Minh Bình"),
      ],
      tranCon: [tran(AN, "Nguyễn Minh An", 8_000_000), tran(BINH, "Nguyễn Minh Bình", 8_000_000)],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tong).toBe(GIAO_DICH_HAI_CON);
  });

  it("chia KHÔNG đều cũng được — 5.016.000 = 5.000.000 của An + 16.000 của Bình", () => {
    // Không có luật "chia đôi": phụ huynh chuyển một khoản cho hai bé theo tỉ lệ nào là việc
    // của họ. Hệ thống chỉ canh trần, không đoán ý.
    const r = kiemChiaTheoCon({
      soTienGiaoDich: GIAO_DICH_HAI_CON,
      dong: [
        { paymentRequestId: "pr-an-1", soTien: 5_000_000 },
        { paymentRequestId: "pr-binh-1", soTien: 16_000 },
      ],
      dot: [
        dot("pr-an-1", AN, 1, 5_000_000, "An"),
        dot("pr-binh-1", BINH, 1, 5_000_000, "Bình"),
      ],
      tranCon: [tran(AN, "An", 8_000_000), tran(BINH, "Bình", 8_000_000)],
    });
    expect(r.ok).toBe(true);
  });

  it("MỘT giao dịch chia cho HAI ĐỢT của CÙNG một con", () => {
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 3_000_000,
      dong: [
        { paymentRequestId: "pr-an-1", soTien: 1_000_000 },
        { paymentRequestId: "pr-an-2", soTien: 2_000_000 },
      ],
      dot: [dot("pr-an-1", AN, 1, 1_000_000, "An"), dot("pr-an-2", AN, 2, 2_000_000, "An")],
      tranCon: [tran(AN, "An", 3_000_000)],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dong).toHaveLength(2);
  });

  it("dòng để TRỐNG (0đ) bị bỏ qua, không tính là 'nhập hai lần'", () => {
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 1_000_000,
      dong: [
        { paymentRequestId: "pr-an-1", soTien: 1_000_000 },
        { paymentRequestId: "pr-binh-1", soTien: 0 },
      ],
      dot: [dot("pr-an-1", AN, 1, 1_000_000, "An"), dot("pr-binh-1", BINH, 1, 1_000_000, "Bình")],
      tranCon: [tran(AN, "An", 5_000_000), tran(BINH, "Bình", 5_000_000)],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dong).toHaveLength(1);
  });
});

describe("[CTC-02] trần — vượt thì CHẶN", () => {
  it("vượt CÒN LẠI CỦA ĐỢT → chặn, và câu lỗi gọi tên bé + số đợt", () => {
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 5_000_000,
      dong: [{ paymentRequestId: "pr-an-1", soTien: 5_000_000 }],
      dot: [dot("pr-an-1", AN, 1, 3_000_000, "Nguyễn Minh An")],
      tranCon: [tran(AN, "Nguyễn Minh An", 9_000_000)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.loi).toContain("Nguyễn Minh An");
      expect(r.loi).toContain("đợt 1");
      expect(r.loi).toContain("3.000.000");
    }
  });

  it("vượt CÒN NỢ CỦA CON dù từng đợt đều trong trần → chặn", () => {
    // Hai đợt của cùng một bé, mỗi đợt còn 3tr, nhưng bé chỉ còn nợ 4tr (đợt được tạo từ
    // trước rồi kế toán xác nhận thêm một khoản khác). Trần theo đợt cho qua, trần theo con
    // thì không.
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 6_000_000,
      dong: [
        { paymentRequestId: "pr-an-1", soTien: 3_000_000 },
        { paymentRequestId: "pr-an-2", soTien: 3_000_000 },
      ],
      dot: [dot("pr-an-1", AN, 1, 3_000_000, "An"), dot("pr-an-2", AN, 2, 3_000_000, "An")],
      tranCon: [tran(AN, "An", 4_000_000)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.loi).toContain("còn nợ của bé");
  });

  it("đợt KHÔNG thuộc đơn → chặn (chống gửi id phiếu của đơn khác)", () => {
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 1_000_000,
      dong: [{ paymentRequestId: "pr-nha-nguoi-khac", soTien: 1_000_000 }],
      dot: [dot("pr-an-1", AN, 1, 1_000_000, "An")],
      tranCon: [tran(AN, "An", 1_000_000)],
    });
    expect(r.ok).toBe(false);
  });

  it("nhập HAI LẦN cùng một đợt → chặn", () => {
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 2_000_000,
      dong: [
        { paymentRequestId: "pr-an-1", soTien: 1_000_000 },
        { paymentRequestId: "pr-an-1", soTien: 1_000_000 },
      ],
      dot: [dot("pr-an-1", AN, 1, 3_000_000, "An")],
      tranCon: [tran(AN, "An", 3_000_000)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.loi).toContain("hai lần");
  });

  it("số ÂM → chặn (không có 'bút toán đảo' bằng cách gõ số âm vào ô chia)", () => {
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 1_000_000,
      dong: [
        { paymentRequestId: "pr-an-1", soTien: 2_000_000 },
        { paymentRequestId: "pr-an-2", soTien: -1_000_000 },
      ],
      dot: [dot("pr-an-1", AN, 1, 3_000_000, "An"), dot("pr-an-2", AN, 2, 3_000_000, "An")],
      tranCon: [tran(AN, "An", 9_000_000)],
    });
    expect(r.ok).toBe(false);
  });
});

describe("[CTC-03] Σ phải ĐÚNG BẰNG số tiền giao dịch — bất biến B2", () => {
  const nen = {
    dot: [dot("pr-an-1", AN, 1, 9_000_000, "An")],
    tranCon: [tran(AN, "An", 9_000_000)],
  };

  it("thừa 1đ → chặn", () => {
    const r = kiemChiaTheoCon({
      ...nen,
      soTienGiaoDich: 5_016_000,
      dong: [{ paymentRequestId: "pr-an-1", soTien: 5_016_001 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.loi).toContain("THỪA");
  });

  it("thiếu 1đ → chặn", () => {
    const r = kiemChiaTheoCon({
      ...nen,
      soTienGiaoDich: 5_016_000,
      dong: [{ paymentRequestId: "pr-an-1", soTien: 5_015_999 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.loi).toContain("THIẾU");
  });

  it("đúng khít → qua", () => {
    const r = kiemChiaTheoCon({
      ...nen,
      soTienGiaoDich: 5_016_000,
      dong: [{ paymentRequestId: "pr-an-1", soTien: 5_016_000 }],
    });
    expect(r.ok).toBe(true);
  });

  it("KHÔNG nhập gì → chặn (không có đường 'gắn mà không chia')", () => {
    const r = kiemChiaTheoCon({ ...nen, soTienGiaoDich: 5_016_000, dong: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.loi).toContain("Chưa nhập");
  });

  it("thứ tự kiểm: sai ĐỢT thì báo sai đợt, KHÔNG báo lệch tổng", () => {
    // Người nhập nhầm đợt cần nghe "đợt này không thuộc đơn". Câu "tổng lệch 3.000.000đ"
    // đúng về số nhưng chỉ đường đi tìm sai chỗ.
    const r = kiemChiaTheoCon({
      soTienGiaoDich: 1_000_000,
      dong: [{ paymentRequestId: "pr-la", soTien: 4_000_000 }],
      dot: [dot("pr-an-1", AN, 1, 9_000_000, "An")],
      tranCon: [tran(AN, "An", 9_000_000)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.loi).not.toContain("THỪA");
  });
});

describe("[CTC-04] dungDotDeChia — màn hình và đường ghi dùng CHUNG một phép dựng", () => {
  it("conLai = amountDue − daRot, kẹp ở 0", () => {
    const r = dungDotDeChia([
      {
        orderItemId: AN,
        ten: "An",
        dotDangMo: [
          { id: "p1", installmentNo: 1, amountDue: 3_000_000, daRot: 1_000_000 },
          { id: "p2", installmentNo: 2, amountDue: 2_000_000, daRot: 0 },
          // Rót QUÁ (dung sai/ghi tay) — `conLai` không được ra số ÂM, kẻo nó kéo tụt
          // phép so tổng ở chỗ khác.
          { id: "p3", installmentNo: 3, amountDue: 1_000_000, daRot: 1_500_000 },
        ],
      },
    ]);
    expect(r.map((x) => x.conLai)).toEqual([2_000_000, 2_000_000, 0]);
    expect(r.every((x) => x.orderItemId === AN)).toBe(true);
    expect(r.every((x) => x.tenCon === "An")).toBe(true);
  });
});
