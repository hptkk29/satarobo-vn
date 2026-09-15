// lib/payments/summary.test.ts — K3 (PAY-DEDUP): tổng "đã nộp" đọc từ 1 nguồn,
// không cộng đôi khi có bút toán điều chỉnh (Payment auto cũ đã soft-delete).
import { describe, it, expect } from "vitest";
import { KHOAN_DA_GHI_NHAN } from "@/lib/finance/ghi-nhan";
import { getLeadPaymentSummary } from "./summary";
import type { scopedDb } from "@/lib/db-scope";

/**
 * Hình dạng ĐÚNG NHƯ Prisma trả về cho câu `select` trong `getLeadPaymentSummary`.
 *
 * ⚠️ Trước 15/09/2026 type này thiếu `id`/`code`/`paymentRequests`, và fixture thiếu
 * theo. Khi `donHang[]` được thêm vào summary thì 4 ca ĐỎ với
 * `TypeError: Cannot read properties of undefined (reading '0')` — không phải vì mã
 * sai mà vì FIXTURE KHÔNG MANG HÌNH DẠNG DỮ LIỆU THẬT (luật fixture, CLAUDE.md).
 *
 * ⚠️ ĐÃ CÂN NHẮC rồi bỏ cách vá `o.paymentRequests ?? []` trong mã sản phẩm: Prisma
 * LUÔN trả quan hệ đã `select`, nên `?? []` chỉ che được đúng một ca — ai đó gỡ mất
 * `select` — mà đó lại chính là ca `tsc` đang bắt giúp. Thêm phòng thủ ở đó là tự bịt
 * mắt mình.
 */
type OrderRow = {
  id: string;
  code: string;
  totalAmount: number;
  payments: { amount: number }[];
  paymentRequests: {
    installmentNo: number;
    amountDue: number;
    allocations: { amount: number }[];
  }[];
};
type Captured = { where?: Record<string, unknown>; select?: Record<string, unknown> };

/** Dựng một dòng đơn với mặc định tối thiểu — ca nào cần đợt thì tự truyền vào. */
function don(o: Partial<OrderRow> & { totalAmount: number }): OrderRow {
  return {
    id: o.id ?? "don1",
    code: o.code ?? "ORD-260915-000001",
    totalAmount: o.totalAmount,
    payments: o.payments ?? [],
    paymentRequests: o.paymentRequests ?? [],
  };
}

/** sdb giả: trả fixture như DB sau khi filter — đồng thời bắt args để assert bộ lọc. */
function fakeSdb(orders: OrderRow[], captured: Captured = {}) {
  return {
    order: {
      findMany: async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
        captured.where = args.where;
        captured.select = args.select;
        return orders;
      },
    },
  } as unknown as ReturnType<typeof scopedDb>;
}

describe("getLeadPaymentSummary (K3 PAY-DEDUP)", () => {
  it("[K3-DoD] 1 đơn 10tr trả 2 đợt (6tr + 4tr RECORDED) → đã nộp 10tr, còn thiếu 0, đủ điều kiện chốt", async () => {
    const s = await getLeadPaymentSummary(
      fakeSdb([don({ totalAmount: 10_000_000, payments: [{ amount: 6_000_000 }, { amount: 4_000_000 }] })]),
      "lead1",
    );
    expect(s).toEqual({
      paid: 10_000_000,
      total: 10_000_000,
      remaining: 0,
      recordedCount: 2,
      hasOrder: true,
      scholarshipFull: false,
      eligible: true,
      // `donHang[]` thêm 15/09/2026 — card lead cần đường sang đơn. Giữ `toEqual`
      // (không đổi sang `toMatchObject`): ca này là hợp đồng ĐẦY ĐỦ của hàm, và nới
      // nó thành khớp-một-phần là mất khả năng phát hiện một trường mọc thêm im lặng.
      donHang: [
        {
          id: "don1",
          code: "ORD-260915-000001",
          totalAmount: 10_000_000,
          daThu: 10_000_000,
          conThieu: 0,
          dotKeTiep: null,
        },
      ],
    });
  });

  it("[LEAD-LINK] đợt kế tiếp = đợt CÒN NỢ nhỏ nhất, trừ đúng phần đã rót", async () => {
    // Đây là con số in lên NÚT ở card lead ("Đóng đợt 2 · 3.000.000đ"), nên nó phải
    // đúng: sale đọc nó rồi nói số đó cho khách đang đứng trước mặt.
    //
    // Đợt 2 có `amountDue` 4tr và đã rót 1tr ⇒ còn thiếu 3tr. Lấy `amountDue` trần là
    // đòi khách 4tr lần nữa; quên `installmentNo > 0` là in ra "đợt 0".
    const s = await getLeadPaymentSummary(
      fakeSdb([
        don({
          totalAmount: 10_000_000,
          payments: [{ amount: 6_000_000 }],
          paymentRequests: [
            { installmentNo: 2, amountDue: 4_000_000, allocations: [{ amount: 1_000_000 }] },
          ],
        }),
      ]),
      "lead1",
    );
    expect(s.donHang).toHaveLength(1);
    expect(s.donHang[0]!.dotKeTiep).toEqual({ soDot: 2, conThieu: 3_000_000 });
    expect(s.donHang[0]!.conThieu).toBe(4_000_000);
  });

  it("[LEAD-LINK] câu tra CHỈ lấy đợt còn nợ, KHÔNG lấy phiếu thu toàn đơn", async () => {
    // Lưới ghim bộ lọc: `installmentNo > 0` loại phiếu số 0 (thu toàn đơn — không phải
    // một đợt), và chỉ PENDING/PARTIAL là còn nợ. Bỏ một trong hai thì nút ở card lead
    // in ra "đợt 0" hoặc mời sale thu lại một đợt đã đóng xong.
    const captured: Captured = {};
    await getLeadPaymentSummary(fakeSdb([], captured), "lead1");
    const pr = (captured.select?.paymentRequests ?? {}) as {
      where?: Record<string, unknown>;
      take?: number;
      orderBy?: unknown;
    };
    expect(pr.where).toEqual({
      installmentNo: { gt: 0 },
      status: { in: ["PENDING", "PARTIAL"] },
    });
    expect(pr.take).toBe(1);
    expect(pr.orderBy).toEqual({ installmentNo: "asc" });
  });

  it("[K3-DoD] điều chỉnh đợt 1 (6tr→5tr): Payment auto cũ đã soft-delete, chỉ còn khoản mới → tổng 9tr, KHÔNG cộng đôi", async () => {
    // Sau recordInstallmentPlan lần 2, DB chỉ trả về khoản active: đợt1 mới 5tr + đợt2 4tr.
    const s = await getLeadPaymentSummary(
      fakeSdb([don({ totalAmount: 10_000_000, payments: [{ amount: 5_000_000 }, { amount: 4_000_000 }] })]),
      "lead1",
    );
    expect(s.paid).toBe(9_000_000); // KHÔNG phải 15tr (6+5+4) — khoản cũ không được đếm
    expect(s.remaining).toBe(1_000_000);
    expect(s.recordedCount).toBe(2);
  });

  it("[K3-guard] query nested Payment PHẢI lọc đúng điều kiện TRỤC B (chặn đếm khoản soft-deleted/chưa ghi nhận)", async () => {
    const captured: Captured = {};
    await getLeadPaymentSummary(fakeSdb([], captured), "lead1");
    expect(captured.where).toEqual({ leadId: "lead1", deletedAt: null });
    const paymentsSelect = (captured.select as { payments: { where: unknown } }).payments;
    // So với CHÍNH hằng dùng chung, không chép lại hình dạng bằng tay: 14/09 trục B đổi
    // từ `saleStatus: "RECORDED"` sang `{ in: ["RECORDED", "COLLECT_CONFIRMED"] }` (xem
    // lib/finance/ghi-nhan.ts — `COLLECT_CONFIRMED` là bước ĐI SAU nên lọc bằng dấu `=`
    // làm tiền rụng khỏi sổ). Ca này chép tay nên nó đỏ theo, và mọi lần đổi sau cũng
    // sẽ bắt sửa lại ở đây mà chẳng thêm bảo đảm gì. Chốt của ca vẫn nguyên: truy vấn
    // KHÔNG được bỏ điều kiện lọc.
    expect(paymentsSelect.where).toEqual(KHOAN_DA_GHI_NHAN);
    expect(paymentsSelect.where).toMatchObject({ deletedAt: null });
  });

  it("học bổng toàn phần: có đơn, tổng 0đ, chưa có khoản → vẫn eligible", async () => {
    const s = await getLeadPaymentSummary(fakeSdb([don({ totalAmount: 0, payments: [] })]), "lead1");
    expect(s.scholarshipFull).toBe(true);
    expect(s.eligible).toBe(true);
    expect(s.paid).toBe(0);
  });

  it("chưa có đơn → KHÔNG coi là miễn phí, không eligible", async () => {
    const s = await getLeadPaymentSummary(fakeSdb([]), "lead1");
    expect(s.hasOrder).toBe(false);
    expect(s.scholarshipFull).toBe(false);
    expect(s.eligible).toBe(false);
  });

  it("nộp thừa (paid > total) → remaining kẹp 0, không âm", async () => {
    const s = await getLeadPaymentSummary(
      fakeSdb([don({ totalAmount: 5_000_000, payments: [{ amount: 6_000_000 }] })]),
      "lead1",
    );
    expect(s.remaining).toBe(0);
  });
});
