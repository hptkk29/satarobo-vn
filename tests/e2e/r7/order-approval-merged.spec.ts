/**
 * DUYỆT CẢ ĐƠN BẰNG MỘT NÚT (chốt 20/08/2026). Postgres LOCAL (.env.test).
 *
 * Việc gộp này KHÔNG đổi schema: hai cột `discountApprovalStatus` và
 * `installmentApprovalStatus` giữ nguyên, chỉ có một lệnh đặt cả hai trong CÙNG
 * transaction. Nên thứ đáng canh nhất không phải "cột có đổi không" mà là
 * **hiệu ứng phụ của nhánh trả góp có còn nguyên không**:
 *   · ghi bù Payment cho đợt 2 đã thu trước khi duyệt, và
 *   · sinh phiếu thu theo đợt (materializeInstallmentRequests).
 * Bỏ sót một trong hai = đơn duyệt xong nhưng không có phiếu để thu tiền.
 *
 * Test ở tầng service như các spec R7 khác (Server Action gọi `auth()` nên không
 * chạy được trong runner này); phần cách ly cơ sở kiểm ngay trên `scopedDb` — đúng
 * thứ mà server action dùng để chặn IDOR chéo cơ sở.
 *
 * Chạy: $env:R7_SKIP_WEBSERVER='1'; pnpm test:e2e:r7 order-approval-merged
 */
import { test, expect } from "@playwright/test";
import type { Role } from "@prisma/client";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { testEmail } from "../_helpers/fixtures";
import { resolveActorUncached } from "../../../lib/auth/actor";
import { scopedDb } from "../../../lib/db-scope";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { approveOrder, rejectOrder, NOTHING_TO_APPROVE } from "../../../lib/orders/approval";
import { recordInstallmentPlan, markInstallmentPaid } from "../../../lib/orders/installments";
import { getOrderPaymentRequests } from "../../../lib/payments/payment-request";

const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };

let seq = 0;
const uniq = () => `${Date.now().toString(36)}-${seq++}`;

async function centerIdOf(code: string): Promise<string> {
  return (await db.orgUnit.findUnique({ where: { code }, select: { centerId: true } }))!.centerId!;
}
async function orgIdOf(code: string): Promise<string> {
  return (await db.orgUnit.findUnique({ where: { code }, select: { id: true } }))!.id;
}
async function roleIdOf(code: string): Promise<string> {
  return (await db.roleDef.findUnique({ where: { code }, select: { id: true } }))!.id;
}

/** Mã đơn thật (ORD-YYMMDD-NNNNNN) — matchKey của phiếu thu suy ra từ đây. */
function orderCode(n: number): string {
  return `ORD-260820-${String(n).padStart(6, "0")}`;
}

/**
 * Đơn như sale vừa lập: `discountApprovalStatus` do luồng tạo đơn đặt khi nhân viên
 * nhập giảm giá tay; kế hoạch 2 đợt (nếu có) đặt bởi `recordInstallmentPlan`.
 */
async function makeOrder(params: {
  n: number;
  centerId: string | null;
  total: number;
  subtotal?: number;
  discountAmount?: number;
  discountPending?: boolean;
}) {
  return db.order.create({
    data: {
      code: orderCode(params.n),
      type: "COURSE",
      customerName: "PH Duyệt gộp",
      customerPhone: "0900000009",
      subtotal: params.subtotal ?? params.total,
      discountAmount: params.discountAmount ?? 0,
      discountPercent: params.discountPending ? 25 : null,
      discountReason: params.discountPending ? "Con thứ hai học cùng cơ sở" : null,
      discountApprovalStatus: params.discountPending ? "PENDING_APPROVAL" : null,
      totalAmount: params.total,
      status: "PENDING_PAYMENT",
      centerId: params.centerId,
    },
    select: { id: true, code: true, centerId: true },
  });
}

async function statusesOf(orderId: string) {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { discountApprovalStatus: true, installmentApprovalStatus: true },
  });
  return o;
}

async function auditActionsOf(orderId: string): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    where: { entityType: "Order", entityId: orderId },
    orderBy: { createdAt: "asc" },
    select: { action: true },
  });
  return rows.map((r) => r.action);
}

test.describe("[OA] Duyệt cả đơn bằng một lệnh", () => {
  let cs1 = "";
  let cs2 = "";
  /** Quản lý cơ sở: v1 matrix cho CENTER_MANAGER cả discounts + installments:approve. */
  let qlcs: { id: string; name: string; role: Role };
  /** Sale: KHÔNG có quyền duyệt nào. */
  let sale: { id: string; name: string; role: Role };

  test.beforeEach(async () => {
    await resetDb();
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: `cs1-${uniq()}`, address: "a", city: "" } });
    await db.center.create({ data: { code: "CS2", name: "CS2", slug: `cs2-${uniq()}`, address: "b", city: "" } });
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    cs1 = await centerIdOf("CS1");
    cs2 = await centerIdOf("CS2");

    const u = await seedUser({ email: testEmail("qlcs", uniq()), role: "CENTER_MANAGER", name: "QL Cơ sở" });
    qlcs = { id: u.id, name: "QL Cơ sở", role: "CENTER_MANAGER" };
    const s = await seedUser({ email: testEmail("sale", uniq()), role: "SALES_CSM", name: "Sale" });
    sale = { id: s.id, name: "Sale", role: "SALES_CSM" };
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[OA-01] đơn cần CẢ HAI → một lệnh đặt cả hai cột + ghi bù Payment đợt 2 + phiếu thu theo đợt", async () => {
    const order = await makeOrder({
      n: 1,
      centerId: cs1,
      subtotal: 12_000_000,
      discountAmount: 2_000_000,
      total: 10_000_000,
      discountPending: true,
    });
    const plan = await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: sale.id,
    });
    expect(plan.ok).toBe(true);

    // Đợt 2 được thu TRƯỚC khi duyệt: Ledger-B ghi PAID nhưng Payment bị gate lại
    // (kế hoạch còn PENDING_APPROVAL) — đây chính là khoản phải ghi bù lúc duyệt.
    const dot2 = await db.orderInstallment.findFirstOrThrow({
      where: { orderId: order.id, soDot: 2 },
      select: { id: true },
    });
    await markInstallmentPaid(dot2.id, sale.id, order.id);
    expect(
      await db.payment.count({
        where: { orderId: order.id, deletedAt: null, note: { contains: "[auto:order-installment:dot2]" } },
      }),
    ).toBe(0);

    const res = await approveOrder({ orderId: order.id, actor: qlcs });
    expect(res.ok).toBe(true);
    expect(res.parts).toEqual(["discount", "installment"]);

    const st = await statusesOf(order.id);
    expect(st.discountApprovalStatus).toBe("APPROVED");
    expect(st.installmentApprovalStatus).toBe("APPROVED");

    // Hiệu ứng phụ của nhánh trả góp phải còn nguyên sau khi gộp.
    expect(
      await db.payment.count({
        where: { orderId: order.id, deletedAt: null, note: { contains: "[auto:order-installment:dot2]" } },
      }),
      "duyệt xong phải ghi bù Payment cho đợt 2 đã thu",
    ).toBe(1);

    const requests = await getOrderPaymentRequests(order.id);
    const dots = requests.filter((r) => r.installmentNo > 0);
    expect(dots.map((d) => d.amountDue), "phiếu thu theo đợt phải còn đủ").toEqual([
      6_000_000, 4_000_000,
    ]);

    // Tên hành động nhật ký GIỮ NGUYÊN — báo cáo và lịch sử đơn đang đọc theo tên đó.
    const actions = await auditActionsOf(order.id);
    expect(actions).toContain("DISCOUNT_APPROVED");
    expect(actions).toContain("INSTALLMENT_APPROVED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[OA-02] đơn CHỈ có giảm giá → duyệt được, cột kế hoạch vẫn null", async () => {
    const order = await makeOrder({
      n: 2,
      centerId: cs1,
      subtotal: 8_000_000,
      discountAmount: 1_000_000,
      total: 7_000_000,
      discountPending: true,
    });

    const res = await approveOrder({ orderId: order.id, actor: qlcs });
    expect(res.ok).toBe(true);
    expect(res.parts).toEqual(["discount"]);

    const st = await statusesOf(order.id);
    expect(st.discountApprovalStatus).toBe("APPROVED");
    expect(st.installmentApprovalStatus).toBeNull();
    expect(await auditActionsOf(order.id)).toEqual(["DISCOUNT_APPROVED"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[OA-03] đơn CHỈ có kế hoạch trả góp → duyệt được, cột giảm giá vẫn null", async () => {
    const order = await makeOrder({ n: 3, centerId: cs1, total: 10_000_000 });
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 5_000_000,
      dot2Amount: 5_000_000,
      dot2DueDate: new Date("2026-09-15"),
      actorId: sale.id,
    });

    const res = await approveOrder({ orderId: order.id, actor: qlcs });
    expect(res.ok).toBe(true);
    expect(res.parts).toEqual(["installment"]);

    const st = await statusesOf(order.id);
    expect(st.discountApprovalStatus).toBeNull();
    expect(st.installmentApprovalStatus).toBe("APPROVED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[OA-04] thiếu quyền → TỪ CHỐI CẢ LỆNH, không cột nào đổi (không duyệt nửa vời)", async () => {
    const order = await makeOrder({
      n: 4,
      centerId: cs1,
      subtotal: 12_000_000,
      discountAmount: 2_000_000,
      total: 10_000_000,
      discountPending: true,
    });
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: sale.id,
    });

    const res = await approveOrder({ orderId: order.id, actor: sale });
    expect(res.ok).toBe(false);
    // Câu lỗi phải nói RÕ thiếu quyền gì, không phải "không có quyền".
    expect(res.error).toContain("giảm giá");
    expect(res.error).toContain("kế hoạch thanh toán");

    const st = await statusesOf(order.id);
    expect(st.discountApprovalStatus).toBe("PENDING_APPROVAL");
    expect(st.installmentApprovalStatus).toBe("PENDING_APPROVAL");
    expect(await auditActionsOf(order.id)).not.toContain("DISCOUNT_APPROVED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[OA-05] đơn không có gì chờ duyệt → báo lỗi rõ ràng, không im lặng", async () => {
    const order = await makeOrder({ n: 5, centerId: cs1, total: 5_000_000 });

    const res = await approveOrder({ orderId: order.id, actor: qlcs });
    expect(res.ok).toBe(false);
    expect(res.error).toBe(NOTHING_TO_APPROVE);
    expect(await auditActionsOf(order.id)).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[OA-06] từ chối cả đơn: lý do bắt buộc, hai cột REJECTED, phiếu theo đợt bị thu hồi", async () => {
    const order = await makeOrder({
      n: 6,
      centerId: cs1,
      subtotal: 12_000_000,
      discountAmount: 2_000_000,
      total: 10_000_000,
      discountPending: true,
    });
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: sale.id,
    });

    const thieuLyDo = await rejectOrder({ orderId: order.id, actor: qlcs, reason: "  " });
    expect(thieuLyDo.ok).toBe(false);
    expect((await statusesOf(order.id)).discountApprovalStatus).toBe("PENDING_APPROVAL");

    const res = await rejectOrder({
      orderId: order.id,
      actor: qlcs,
      reason: "Giảm vượt khung, kế hoạch đợt 2 quá xa",
    });
    expect(res.ok).toBe(true);
    expect(res.parts).toEqual(["discount", "installment"]);

    const st = await statusesOf(order.id);
    expect(st.discountApprovalStatus).toBe("REJECTED");
    expect(st.installmentApprovalStatus).toBe("REJECTED");

    // Hiệu ứng phụ của việc bác kế hoạch: phiếu theo đợt thu hồi, phiếu toàn đơn
    // sống lại để đơn vẫn thu được tiền trong lúc lập lại kế hoạch.
    const requests = await getOrderPaymentRequests(order.id);
    expect(requests.filter((r) => r.installmentNo > 0 && r.status !== "VOID")).toHaveLength(0);
    expect(requests.find((r) => r.installmentNo === 0)?.status).toBe("PENDING");

    const actions = await auditActionsOf(order.id);
    expect(actions).toContain("DISCOUNT_REJECTED");
    expect(actions).toContain("INSTALLMENT_REJECTED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[OA-07] cách ly cơ sở: quản lý CS1 không TRA THẤY đơn chờ duyệt của CS2", async () => {
    // Đây là lớp chặn mà server action dựa vào: đơn ngoài tầm nhìn → null → không
    // có id nào để gọi approveOrder. Không có nó thì đoán đúng id là duyệt được.
    const donCs2 = await makeOrder({
      n: 7,
      centerId: cs2,
      subtotal: 12_000_000,
      discountAmount: 2_000_000,
      total: 10_000_000,
      discountPending: true,
    });
    const donCs1 = await makeOrder({
      n: 8,
      centerId: cs1,
      subtotal: 12_000_000,
      discountAmount: 2_000_000,
      total: 10_000_000,
      discountPending: true,
    });

    await assignUserOrgRole(SA, {
      userId: qlcs.id,
      orgUnitId: await orgIdOf("CS1"),
      roleId: await roleIdOf("CENTER_MANAGER"),
      reason: "seed duyệt đơn",
    });
    const actor = await resolveActorUncached(qlcs.id);
    const sdb = scopedDb(actor);

    expect(await sdb.order.findUnique({ where: { id: donCs2.id }, select: { id: true } })).toBeNull();
    expect(
      (await sdb.order.findUnique({ where: { id: donCs1.id }, select: { id: true } }))?.id,
    ).toBe(donCs1.id);

    // Hàng chờ của trang duyệt cũng chỉ thấy đơn cơ sở mình.
    const hangCho = await sdb.order.findMany({
      where: {
        deletedAt: null,
        OR: [
          { discountApprovalStatus: "PENDING_APPROVAL" },
          { installmentApprovalStatus: "PENDING_APPROVAL" },
        ],
      },
      select: { id: true },
    });
    expect(hangCho.map((o) => o.id)).toEqual([donCs1.id]);
  });
});
