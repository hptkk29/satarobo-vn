// Ca [CPG-*] — chia một lần tiền về cho các con THEO PHIẾU GỘP.
//
// Đây là bộ giải ca nghiệp vụ gốc của chủ dự án 16/09: *"đợt 1 đóng học phí cho cả 2 (hoặc
// cọc học phí) nhưng sang đợt 2 lại chỉ muốn đóng cho 1 bạn"*. Ca `[KHC-04]` đã ghim rằng
// thứ tự rót TOÀN CỤC không giải được ca đó; bộ này là lời giải.
//
// Số dùng ở đây là số thật của đơn `ORD-260915-000007` (bé A 8.976.000đ · bé B 9.492.000đ
// · cọc 2.000.000đ chia đôi 1.000.000 mỗi bé).
import { describe, it, expect } from "vitest";
import { chiaTheoPhieuGop, tienPhieuGop, type DongPhieuGop } from "./chia-phieu-gop";
import { thuTuRot } from "./thu-tu-rot";

/** Phiếu gộp "đợt 1 của cả nhà": đúng hai dòng, mỗi bé một. */
function phieuCocCaNha(): DongPhieuGop[] {
  return [
    {
      paymentRequestId: "pr-a-d1",
      sortOrder: thuTuRot({ thuTuDong: 0, installmentNo: 1 }),
      amount: 1_000_000,
      amountDue: 1_000_000,
      daRot: 0,
    },
    {
      paymentRequestId: "pr-b-d1",
      sortOrder: thuTuRot({ thuTuDong: 1, installmentNo: 1 }),
      amount: 1_000_000,
      amountDue: 1_000_000,
      daRot: 0,
    },
  ];
}

describe("[CPG-01] CA GỐC: cọc của cả nhà rót đúng hai bé", () => {
  it("2.000.000đ ⇒ mỗi bé 1.000.000đ, không dư", () => {
    // So với `[KHC-04]`: cùng số tiền, cùng đơn, nhưng đi QUA phiếu gộp thì bé B không còn
    // bị bỏ lại. Khác biệt không nằm ở thuật toán — nằm ở chỗ ý định được KHAI BÁO.
    const r = chiaTheoPhieuGop(2_000_000, phieuCocCaNha());
    expect(r.lines).toEqual([
      { paymentRequestId: "pr-a-d1", amount: 1_000_000 },
      { paymentRequestId: "pr-b-d1", amount: 1_000_000 },
    ]);
    expect(r.du).toBe(0);
  });

  it("số in lên QR = Σ dòng, tính ở đúng MỘT chỗ", () => {
    expect(tienPhieuGop(phieuCocCaNha())).toBe(2_000_000);
  });

  it("dòng RÁC không làm QR in một số còn sổ ghi số khác", () => {
    // Ca này thêm sau một lượt cấy LỌT: không ca nào truyền số âm nên phép kẹp trong
    // `tienPhieuGop` là mã chết trước mắt lưới. Bất biến thật là HAI HÀM PHẢI ĐỒNG Ý —
    // số in lên QR phải đúng bằng số mà bộ chia rót được khi khách trả đủ.
    const d: DongPhieuGop[] = [
      { paymentRequestId: "pr-a", sortOrder: 0, amount: -500_000, amountDue: 1_000_000, daRot: 0 },
      { paymentRequestId: "pr-b", sortOrder: 100, amount: Number.NaN, amountDue: 1_000_000, daRot: 0 },
      { paymentRequestId: "pr-c", sortOrder: 200, amount: 1_000_000, amountDue: 1_000_000, daRot: 0 },
    ];
    const inRa = tienPhieuGop(d);
    expect(inRa).toBe(1_000_000);
    const r = chiaTheoPhieuGop(inRa, d);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(inRa);
    expect(r.du).toBe(0);
  });
});

describe("[CPG-02] THIẾU thì lấp dần theo thứ tự dòng, KHÔNG chia tỷ lệ", () => {
  it("1.500.000đ ⇒ bé A đủ 1.000.000, bé B được 500.000", () => {
    // Chia tỷ lệ sẽ ra 750.000/750.000 — và khi đó KHÔNG bé nào đóng xong đợt 1, tức cả
    // hai vẫn hiện "chưa đóng cọc". Lấp dần thì ít nhất một bé xong dứt điểm.
    const r = chiaTheoPhieuGop(1_500_000, phieuCocCaNha());
    expect(r.lines).toEqual([
      { paymentRequestId: "pr-a-d1", amount: 1_000_000 },
      { paymentRequestId: "pr-b-d1", amount: 500_000 },
    ]);
    expect(r.du).toBe(0);
  });

  it("thiếu tới mức chỉ đủ một phần dòng đầu ⇒ chỉ ghi MỘT dòng", () => {
    const r = chiaTheoPhieuGop(300_000, phieuCocCaNha());
    expect(r.lines).toEqual([{ paymentRequestId: "pr-a-d1", amount: 300_000 }]);
  });

  it("0đ (hoặc số rác) ⇒ không ghi dòng nào, không ném", () => {
    for (const x of [0, -5_000, Number.NaN]) {
      expect(chiaTheoPhieuGop(x, phieuCocCaNha()).lines, String(x)).toEqual([]);
    }
  });
});

describe("[CPG-03] THỪA ra ví gia đình, KHÔNG tràn sang đợt sau", () => {
  it("2.500.000đ ⇒ đủ hai bé, dư 500.000 vào ví", () => {
    // Khác `planAllocation` ở đúng điểm này. Nhà chuyển dư khi đóng cọc KHÔNG có nghĩa là
    // họ muốn đóng trước đợt 2 của bé A — mà phiếu gộp thì chỉ hứa đúng hai dòng cọc.
    const r = chiaTheoPhieuGop(2_500_000, phieuCocCaNha());
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(2_000_000);
    expect(r.du).toBe(500_000);
  });

  it("KHÔNG rót quá phần đã hứa trên tờ QR, dù phiếu thu còn nợ nhiều hơn", () => {
    // Dòng cọc của bé A chỉ hứa 1.000.000, trong khi phiếu thu đó có thể là phiếu "cả
    // khoá" còn thiếu 8.976.000. Rót vượt là ghi một con số khách chưa từng đồng ý.
    const d = phieuCocCaNha();
    d[0]!.amountDue = 8_976_000;
    const r = chiaTheoPhieuGop(5_000_000, d);
    expect(r.lines[0]).toEqual({ paymentRequestId: "pr-a-d1", amount: 1_000_000 });
    expect(r.du).toBe(3_000_000);
  });
});

describe("[CPG-04] dòng đã đóng đủ thì NHƯỜNG tiền cho dòng sau", () => {
  it("bé A đã đóng lẻ trước ⇒ tiền chảy thẳng sang bé B", () => {
    const d = phieuCocCaNha();
    d[0]!.daRot = 1_000_000; // bé A xong rồi
    const r = chiaTheoPhieuGop(1_000_000, d);
    expect(r.lines).toEqual([{ paymentRequestId: "pr-b-d1", amount: 1_000_000 }]);
    expect(r.du).toBe(0);
  });

  it("bé A mới đóng một PHẦN ⇒ chỉ lấp phần còn thiếu rồi mới sang bé B", () => {
    const d = phieuCocCaNha();
    d[0]!.daRot = 400_000;
    const r = chiaTheoPhieuGop(1_200_000, d);
    expect(r.lines).toEqual([
      { paymentRequestId: "pr-a-d1", amount: 600_000 },
      { paymentRequestId: "pr-b-d1", amount: 600_000 },
    ]);
  });

  it("MỌI dòng đã đủ ⇒ toàn bộ tiền vào ví, không ghi dòng 0đ", () => {
    const d = phieuCocCaNha();
    for (const x of d) x.daRot = x.amountDue;
    const r = chiaTheoPhieuGop(2_000_000, d);
    expect(r.lines).toEqual([]);
    expect(r.du).toBe(2_000_000);
  });
});

describe("[CPG-05] thứ tự rót là của PHIẾU, và phải TẤT ĐỊNH", () => {
  it("dòng truyền vào lộn xộn vẫn rót theo `sortOrder` của phiếu", () => {
    const d = phieuCocCaNha().reverse();
    const r = chiaTheoPhieuGop(1_200_000, d);
    expect(r.lines[0]!.paymentRequestId).toBe("pr-a-d1");
  });

  it("hai dòng TRÙNG `sortOrder` (dữ liệu hỏng) vẫn cho kết quả GIỐNG NHAU mọi lượt", () => {
    // Ngẫu nhiên ở đây nghĩa là cùng một khoản tiền chia khác nhau giữa hai lần chạy lại —
    // không đối soát được, và không ai giải thích nổi cho kế toán.
    const hong = (): DongPhieuGop[] => [
      { paymentRequestId: "pr-z", sortOrder: 7, amount: 500_000, amountDue: 500_000, daRot: 0 },
      { paymentRequestId: "pr-a", sortOrder: 7, amount: 500_000, amountDue: 500_000, daRot: 0 },
    ];
    const lan1 = chiaTheoPhieuGop(500_000, hong());
    const lan2 = chiaTheoPhieuGop(500_000, hong().reverse());
    expect(lan1.lines).toEqual(lan2.lines);
    expect(lan1.lines[0]!.paymentRequestId).toBe("pr-a");
  });

  it("KHÔNG sửa mảng người gọi truyền vào", () => {
    // Đường webhook dùng lại mảng này để ghi `PaymentAllocation`; sắp tại chỗ là đổi thứ
    // tự dưới chân người gọi.
    const d = phieuCocCaNha().reverse();
    const truoc = d.map((x) => x.paymentRequestId);
    chiaTheoPhieuGop(2_000_000, d);
    expect(d.map((x) => x.paymentRequestId)).toEqual(truoc);
  });
});

describe("[CPG-06] phiếu ba con — không có gì đặc biệt, và đó là điểm mạnh", () => {
  const baCon = (): DongPhieuGop[] =>
    [0, 1, 2].map((i) => ({
      paymentRequestId: `pr-${i}`,
      sortOrder: thuTuRot({ thuTuDong: i, installmentNo: 1 }),
      amount: 1_500_000,
      amountDue: 1_500_000,
      daRot: 0,
    }));

  it("đủ tiền ⇒ ba dòng đủ", () => {
    const r = chiaTheoPhieuGop(4_500_000, baCon());
    expect(r.lines.map((l) => l.amount)).toEqual([1_500_000, 1_500_000, 1_500_000]);
  });

  it("thiếu ⇒ hai bé đầu đủ, bé ba dở dang — không ai bị rải mỏng", () => {
    const r = chiaTheoPhieuGop(3_200_000, baCon());
    expect(r.lines.map((l) => l.amount)).toEqual([1_500_000, 1_500_000, 200_000]);
  });
});
