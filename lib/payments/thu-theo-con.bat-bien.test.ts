// Ca [BTC-*] — BẤT BIẾN của thiết kế "công nợ theo CON, QR theo ĐƠN".
//
// ─────────────────────────────────────────────────────────────────────────────
// VIẾT TRƯỚC KHI HIỆN THỰC — chủ dự án chốt 16/09: *"sau công tắc, fixture + test bất biến
// trước"*. Nên tệp này có HAI loại ca, và phải đọc được cái nào là cái nào:
//
//   · ca THƯỜNG — bất biến đã hiện thực xong, xanh hôm nay, đỏ nếu ai phá.
//   · ca `it.fails` — bất biến của phần CHƯA XÂY (cột `orderItemId`, `PaymentBill`).
//     Hôm nay thân ca ném nên CI không đỏ; xây xong nó chuyển XANH và vitest báo
//     "expected to fail" ⇒ buộc người xây gỡ ghim. Đó là cách tệp này biến thành
//     danh sách việc tự kiểm.
//
// FIXTURE dùng SỐ THẬT, không số tròn: đơn `ORD-260915-000007` trên `satarobo_local` —
// hai con, tổng 18.468.000đ, kế hoạch 5 đợt + cọc 2.000.000đ. Dữ liệu tròn trịa trong test
// là dữ liệu không kiểm được gì (luật đọc số của repo).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planAllocation, type AllocTarget } from "@/lib/payments/allocation";
import {
  BUOC_DONG,
  docThuTuRot,
  lechTongDotCuaDong,
  thuTuRot,
  TRAN_SO_DONG,
} from "./thu-tu-rot";

/** Hai dòng của đơn thật — số lấy từ DB, không bịa. */
const DONG_BE_A = { thuTuDong: 0, thanhTien: 8_976_000 }; // Sata3
const DONG_BE_B = { thuTuDong: 1, thanhTien: 9_492_000 }; // Sata4

/** Dựng một phiếu thu cho bộ chia waterfall đã có sẵn. */
const phieu = (
  id: string,
  thuTuDong: number,
  installmentNo: number,
  amountDue: number,
  allocated = 0,
): AllocTarget => ({
  id,
  amountDue,
  allocated,
  sortOrder: thuTuRot({ thuTuDong, installmentNo }),
  status: allocated > 0 ? "PARTIAL" : "PENDING",
});

describe("[BTC-01] THỨ TỰ RÓT: hết đợt của con thứ nhất rồi mới sang con thứ hai", () => {
  it("dòng trước LUÔN đứng trước mọi đợt của dòng sau", () => {
    // Đây là lý do `sortOrder` không thể chỉ bằng `installmentNo`: hai phiếu "đợt 1" của
    // hai em sẽ cùng giá trị, và thứ tự rót rơi về so sánh cuid — tức ngẫu nhiên.
    const dotCuoiCuaDongDau = thuTuRot({ thuTuDong: 0, installmentNo: 99 });
    const dotDauCuaDongSau = thuTuRot({ thuTuDong: 1, installmentNo: 0 });
    expect(dotCuoiCuaDongDau).toBeLessThan(dotDauCuaDongSau);
  });

  it("trong cùng một dòng, đợt nhỏ đứng trước", () => {
    expect(thuTuRot({ thuTuDong: 1, installmentNo: 1 })).toBeLessThan(
      thuTuRot({ thuTuDong: 1, installmentNo: 2 }),
    );
  });

  it("ĐƠN ÁNH — đọc ngược ra đúng cặp (dòng, đợt)", () => {
    for (let d = 0; d < TRAN_SO_DONG; d++)
      for (const dot of [0, 1, 5, 12, 99]) {
        expect(docThuTuRot(thuTuRot({ thuTuDong: d, installmentNo: dot }))).toEqual({
          thuTuDong: d,
          installmentNo: dot,
        });
      }
  });

  it("đầu vào RÁC không bao giờ cho ra thứ tự ÂM", () => {
    // Ca này thêm SAU khi cấy lỗi "bỏ kẹp số âm" KHÔNG làm lưới đỏ — không ca nào truyền
    // số âm nên phép kẹp là mã chết trước mắt lưới. Mà `sortOrder` âm KHÔNG vô hại:
    // `planAllocation` sắp tăng dần, nên một dòng hỏng sẽ được rót TRƯỚC mọi dòng lành.
    for (const x of [-1, -100, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(thuTuRot({ thuTuDong: x, installmentNo: 1 }), `dong=${x}`).toBeGreaterThanOrEqual(0);
      expect(thuTuRot({ thuTuDong: 0, installmentNo: x }), `dot=${x}`).toBeGreaterThanOrEqual(0);
    }
    // Và dòng RÁC không được chen lên trước dòng THẬT đầu tiên.
    expect(thuTuRot({ thuTuDong: -5, installmentNo: 1 })).toBeGreaterThanOrEqual(
      thuTuRot({ thuTuDong: 0, installmentNo: 0 }),
    );
  });

  it("BƯỚC phải LỚN HƠN số đợt tối đa — hạ nó xuống là lỗi tiền im lặng", () => {
    // `TRAN_SO_DOT = 12` (+ cọc + phiếu thu toàn đơn). Ca này đỏ ngay khi ai đó hạ BUOC_DONG.
    expect(BUOC_DONG).toBeGreaterThan(12 + 2);
  });
});

describe("[BTC-02] WATERFALL: thiếu lấp dần theo thứ tự dòng", () => {
  /** Bé A: cọc 2tr + 2 đợt. Bé B: 2 đợt. Tổng khớp thành tiền từng dòng. */
  const phieuCuaDon = (): AllocTarget[] => [
    phieu("a-coc", 0, 1, 2_000_000),
    phieu("a-d2", 0, 2, 3_488_000),
    phieu("a-d3", 0, 3, 3_488_000),
    phieu("b-d1", 1, 1, 4_746_000),
    phieu("b-d2", 1, 2, 4_746_000),
  ];

  it("tiền vừa đủ cọc của bé A ⇒ chỉ cọc của bé A được rót", () => {
    const r = planAllocation(2_000_000, phieuCuaDon());
    expect(r.lines.map((l) => l.paymentRequestId)).toEqual(["a-coc"]);
    expect(r.credit).toBe(0);
  });

  it("tiền đủ cả bé A ⇒ lấp HẾT bé A rồi mới chạm bé B", () => {
    const tienBeA = 2_000_000 + 3_488_000 + 3_488_000;
    const r = planAllocation(tienBeA, phieuCuaDon());
    expect(r.lines.map((l) => l.paymentRequestId)).toEqual(["a-coc", "a-d2", "a-d3"]);
    // Bé B KHÔNG được chạm tới — đây là điều `sortOrder = installmentNo` làm sai.
    expect(r.lines.some((l) => l.paymentRequestId.startsWith("b-"))).toBe(false);
  });

  it("tiền lẻ giữa chừng ⇒ phiếu đang dở thành PARTIAL, KHÔNG nhảy cóc", () => {
    const r = planAllocation(2_000_000 + 1_000_000, phieuCuaDon());
    expect(r.lines).toEqual([
      { paymentRequestId: "a-coc", amount: 2_000_000, roundingWaived: 0 },
      { paymentRequestId: "a-d2", amount: 1_000_000, roundingWaived: 0 },
    ]);
  });

  it("THỪA ⇒ ra `credit` (ví gia đình), KHÔNG rót bừa vào đâu", () => {
    const tongDon = 2_000_000 + 3_488_000 + 3_488_000 + 4_746_000 + 4_746_000;
    const r = planAllocation(tongDon + 500_000, phieuCuaDon());
    expect(r.credit).toBe(500_000);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(tongDon);
  });

  it("QR của ĐỢT CỤ THỂ thắng thứ tự — sale xuất QR đợt nào, tiền vào đợt đó", () => {
    // `startId` là phiếu tra được từ `matchKey` trên nội dung CK.
    const r = planAllocation(4_746_000, phieuCuaDon(), "b-d1");
    expect(r.lines[0]?.paymentRequestId).toBe("b-d1");
  });
});

describe("[BTC-03] Σ ĐỢT CỦA MỘT DÒNG === THÀNH TIỀN DÒNG ĐÓ", () => {
  it("khớp ⇒ lệch 0", () => {
    expect(lechTongDotCuaDong(DONG_BE_A.thanhTien, [2_000_000, 3_488_000, 3_488_000])).toBe(0);
    expect(lechTongDotCuaDong(DONG_BE_B.thanhTien, [4_746_000, 4_746_000])).toBe(0);
  });

  it("khai THỪA / THIẾU ⇒ trả đúng con số lệch, để màn in ra được", () => {
    expect(lechTongDotCuaDong(8_976_000, [9_000_000])).toBe(24_000);
    expect(lechTongDotCuaDong(8_976_000, [8_000_000])).toBe(-976_000);
  });

  it("số rác không làm hỏng phép cộng", () => {
    expect(lechTongDotCuaDong(1_000, [Number.NaN, 1_000])).toBe(0);
    expect(lechTongDotCuaDong(Number.NaN, [1_000])).toBe(1_000);
  });
});

// ═══ BẤT BIẾN CỦA PHẦN CHƯA XÂY — `it.fails` là HẸN, không phải quên ══════════
//
// Bốn ca dưới mô tả hành vi ĐÚNG của phần bước B chưa hiện thực. Xây xong, chúng chuyển
// XANH và vitest báo "expected to fail" ⇒ người xây BUỘC phải quay lại gỡ ghim. Đừng đổi
// sang `it.skip` — skip là quên.
describe("[BTC-04] chưa xây: cột `PaymentRequest.orderItemId`", () => {
  const coCot = () => {
    const schema = readFileSync(
      resolve(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    const model = /model PaymentRequest \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";
    return /orderItemId/.test(model);
  };

  it.fails("PaymentRequest phải có cột `orderItemId` (nullable — dòng cũ giữ NULL)", () => {
    expect(coCot()).toBe(true);
  });

  it.fails("unique cũ phải thành PARTIAL để dòng mới không đụng dòng cũ", () => {
    // Chủ dự án chốt: `[orderItemId, installmentNo] WHERE orderItemId IS NOT NULL`, và đổi
    // `[orderId, installmentNo]` thành partial `WHERE orderItemId IS NULL`.
    // ⚠️ Prisma KHÔNG khai được partial unique — phải là SQL tay trong migration, và
    // `@@unique` trong schema phải gỡ đi kẻo `migrate deploy` dựng lại bản đầy đủ.
    const migrations = readdirSync(resolve(process.cwd(), "prisma/migrations"))
      .join(" ");
    expect(/payment_request_order_item/.test(migrations)).toBe(true);
  });
});

describe("[BTC-05] chưa xây: phiếu thu GỘP (một QR cho cả nhà)", () => {
  it.fails("model `PaymentBill` tồn tại", () => {
    const schema = readFileSync(
      resolve(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    expect(/^model PaymentBill /m.test(schema)).toBe(true);
  });

  it.fails("mỗi đơn tối đa MỘT phiếu gộp đang mở", () => {
    // Bất biến này phải do DB gác (partial unique trên `orderId WHERE status='OPEN'`),
    // không phải do mã nhớ kiểm — hai lượt bấm đồng thời sẽ lách mọi phép kiểm trong mã.
    const schema = readFileSync(
      resolve(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    expect(/PaymentBill[\s\S]*?OPEN/.test(schema)).toBe(true);
  });
});

describe("[BTC-06] luồng MỚI không được gọi bộ chia theo TỶ LỆ", () => {
  it("bộ chia waterfall đã có sẵn — KHÔNG viết bộ thứ hai", () => {
    // Chủ dự án: *"Không chia theo tỷ lệ, không gọi allocateByWeight / chia-khoan-theo-don
    // trên luồng mới."* `planAllocation` đã làm đúng việc đó từ 03/08 — ca này ghim rằng
    // nó tồn tại và vẫn là đường dùng, để người sau đừng dựng thêm một bộ chia nữa.
    expect(typeof planAllocation).toBe("function");
    const r = planAllocation(1, [phieu("x", 0, 1, 10)]);
    expect(r.lines).toEqual([{ paymentRequestId: "x", amount: 1, roundingWaived: 0 }]);
  });

  it.fails("đường ghi phiếu theo CON không được import `chia-khoan-theo-don`", () => {
    // Sẽ xanh khi `materializeInstallmentRequests` sinh đợt theo từng dòng; hôm nay chưa
    // có đường đó nên ca này còn là HẸN.
    const src = readFileSync(
      resolve(process.cwd(), "lib/payments/payment-request.ts"),
      "utf8",
    );
    expect(/orderItemId/.test(src)).toBe(true);
  });
});
