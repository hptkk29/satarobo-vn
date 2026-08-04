/**
 * VÒNG ĐỜI PHIẾU THU (PaymentRequest) — 03/08. Postgres LOCAL (.env.test).
 *
 * Hai quyết định của chủ dự án được kiểm ở đây:
 *  QĐ-1 — ⚠️ ĐÃ ĐẢO 03/08 (chủ dự án chốt trong chat). Luật CŨ: "phiếu đợt chỉ ra
 *         đời khi QLCS bấm DUYỆT". Luật MỚI: **bấm Lưu kế hoạch là có phiếu thu +
 *         QR theo đợt NGAY**, vì khách đứng ở quầy không thể chờ người duyệt mới
 *         quét được mã. "Duyệt" nay chỉ còn nghĩa **KHOÁ** kế hoạch lại.
 *  QĐ-2 — phiếu đợt 1 sinh ra ở PENDING, dù sổ CŨ (`OrderInstallment`) vẫn đánh
 *         đợt 1 = PAID. Chỉ tiền THẬT (PaymentAllocation) mới đẩy phiếu sang PAID.
 *
 * Test ở tầng service (mẫu bulk-convert / attendance-edit): Server Action gọi
 * `auth()` nên không chạy được trong runner này ⇒ ca "tạo đơn" gọi thẳng
 * `ensureFullOrderRequest` — đúng thứ `createOrderManualAction` gọi trong tx của nó.
 *
 * Chạy: $env:R7_SKIP_WEBSERVER='1'; pnpm test:e2e:r7 payment-request-lifecycle
 */
import { test, expect } from "@playwright/test";
import type { Prisma, Role } from "@prisma/client";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { testEmail } from "../_helpers/fixtures";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { resolveActorUncached } from "../../../lib/auth/actor";
import { scopedDb } from "../../../lib/db-scope";
import {
  ensureFullOrderRequest,
  materializeInstallmentRequests,
  recomputeRequestStatuses,
  getOrderPaymentRequests,
  paymentMatchKey,
  FULL_ORDER_INSTALLMENT_NO,
} from "../../../lib/payments/payment-request";
import {
  recordInstallmentPlan,
  approveInstallmentPlan,
  rejectInstallmentPlan,
  getOrderInstallments,
} from "../../../lib/orders/installments";

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

/** Mã đơn thật (ORD-YYMMDD-NNNNNN) — matchKey suy ra từ đây nên phải đúng dạng. */
function orderCode(n: number): string {
  return `ORD-260803-${String(n).padStart(6, "0")}`;
}

async function makeOrder(total: number, centerId: string | null, n: number) {
  return db.order.create({
    data: {
      code: orderCode(n),
      type: "COURSE",
      customerName: "PH Phiếu thu",
      customerPhone: "0900000001",
      totalAmount: total,
      status: "PENDING_PAYMENT",
      centerId,
    },
    select: { id: true, code: true, totalAmount: true, centerId: true },
  });
}

/** Đúng thứ createOrderManualAction làm trong transaction tạo đơn. */
async function createOrderWithRequest(total: number, centerId: string | null, n: number) {
  const order = await makeOrder(total, centerId, n);
  await db.$transaction(async (tx) => {
    await ensureFullOrderRequest(tx as unknown as Prisma.TransactionClient, order);
  });
  return order;
}

async function requestsOf(orderId: string) {
  return db.paymentRequest.findMany({
    where: { orderId },
    orderBy: { installmentNo: "asc" },
  });
}

/** Tiền THẬT về: 1 giao dịch ngân hàng + 1 dòng phân bổ vào phiếu chỉ định. */
async function allocate(paymentRequestId: string, amount: number, centerId: string | null) {
  const txn = await db.bankTransaction.create({
    data: {
      provider: "PAYOS",
      providerTxnId: `TXN-${uniq()}`,
      amount,
      transferredAt: new Date(),
      status: "MATCHED",
      centerId,
    },
    select: { id: true },
  });
  await db.paymentAllocation.create({
    data: { bankTransactionId: txn.id, paymentRequestId, amount, centerId },
  });
}

async function recompute(orderId: string) {
  await db.$transaction(async (tx) => {
    await recomputeRequestStatuses(tx as unknown as Prisma.TransactionClient, orderId);
  });
}

async function makeUser(slug: string, orgCode: string, roleCode: string, primaryRole: Role) {
  const u = await seedUser({ email: testEmail(slug, uniq()), role: primaryRole });
  await assignUserOrgRole(SA, {
    userId: u.id,
    orgUnitId: await orgIdOf(orgCode),
    roleId: await roleIdOf(roleCode),
    reason: "seed phiếu thu",
  });
  return u;
}

test.describe("[PR] Vòng đời phiếu thu — duyệt trả góp mới sinh phiếu đợt", () => {
  let cs1 = "";
  let cs2 = "";
  /** Người duyệt: v1 matrix cho CENTER_MANAGER quyền installments:approve. */
  let approver: { id: string; name: string; role: Role };

  test.beforeEach(async () => {
    await resetDb();
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: `cs1-${uniq()}`, address: "a", city: "" } });
    await db.center.create({ data: { code: "CS2", name: "CS2", slug: `cs2-${uniq()}`, address: "b", city: "" } });
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    cs1 = await centerIdOf("CS1");
    cs2 = await centerIdOf("CS2");
    const u = await seedUser({ email: testEmail("qlcs", uniq()), role: "CENTER_MANAGER", name: "QL Cơ sở" });
    approver = { id: u.id, name: "QL Cơ sở", role: "CENTER_MANAGER" };
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-01] tạo đơn → đúng 1 phiếu thu toàn đơn (installmentNo=0) = tổng đơn", async () => {
    const order = await createOrderWithRequest(10_000_000, cs1, 1);

    const rows = await requestsOf(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].installmentNo).toBe(FULL_ORDER_INSTALLMENT_NO);
    expect(rows[0].amountDue).toBe(10_000_000);
    expect(rows[0].sortOrder).toBe(0);
    expect(rows[0].status).toBe("PENDING");
    expect(rows[0].centerId).toBe(cs1);
    expect(rows[0].matchKey).toBe("ORD260803000001D0");

    // Idempotent: gọi lại KHÔNG nhân đôi.
    await db.$transaction(async (tx) => {
      await ensureFullOrderRequest(tx as unknown as Prisma.TransactionClient, order);
    });
    expect(await requestsOf(order.id)).toHaveLength(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-02] lưu kế hoạch 2 đợt (CHƯA duyệt) → CÓ NGAY 2 phiếu đợt + phiếu toàn đơn VOID", async () => {
    // Luật MỚI 03/08 (đảo QĐ-1): không bắt khách chờ duyệt mới quét được QR.
    const order = await createOrderWithRequest(10_000_000, cs1, 20);
    const res = await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: approver.id,
    });
    expect(res.ok).toBe(true);

    // Đơn vẫn CHỜ DUYỆT…
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.installmentApprovalStatus).toBe("PENDING_APPROVAL");

    // …nhưng phiếu thu theo đợt đã có, đúng số tiền, và phiếu toàn đơn đã VOID.
    const rows = await requestsOf(order.id);
    const dots = rows.filter((r) => r.installmentNo > 0);
    expect(dots).toHaveLength(2);
    expect(dots.map((d) => d.amountDue)).toEqual([6_000_000, 4_000_000]);
    expect(dots.every((d) => d.status === "PENDING")).toBe(true);
    expect(rows.find((r) => r.installmentNo === 0)!.status).toBe("VOID");
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-02b] sửa kế hoạch trước khi duyệt → phiếu đổi số tiền VÀ mã QR đang sống bị hết hạn", async () => {
    // Lỗi chủ dự án báo 03/08: "sửa giá / sửa 2 đợt nhưng QR không nhảy theo".
    // QrSession.amountShown là ảnh chụp số tiền lúc xuất mã ⇒ không hết hạn phiên cũ
    // thì khách quét mã in số CŨ.
    const order = await createOrderWithRequest(10_000_000, cs1, 21);
    await recordInstallmentPlan({
      orderId: order.id, dot1Amount: 6_000_000, dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"), actorId: approver.id,
    });
    const dot1 = (await requestsOf(order.id)).find((r) => r.installmentNo === 1)!;

    // Sale đã xuất QR cho đợt 1 với số tiền 6tr.
    await db.qrSession.create({
      data: {
        paymentRequestId: dot1.id,
        centerId: cs1,
        amountShown: 6_000_000,
        qrContent: "https://img.vietqr.io/x.png",
        expiresAt: new Date(Date.now() + 30 * 60_000),
        status: "ACTIVE",
      },
    });

    // Đổi kế hoạch: 6tr/4tr → 3tr/7tr.
    const again = await recordInstallmentPlan({
      orderId: order.id, dot1Amount: 3_000_000, dot2Amount: 7_000_000,
      dot2DueDate: new Date("2026-10-01"), actorId: approver.id,
    });
    expect(again.ok).toBe(true);

    const after = (await requestsOf(order.id)).filter((r) => r.installmentNo > 0);
    expect(after.map((d) => d.amountDue)).toEqual([3_000_000, 7_000_000]);

    // Mã cũ KHÔNG được còn sống.
    const live = await db.qrSession.count({
      where: { paymentRequestId: dot1.id, status: "ACTIVE" },
    });
    expect(live).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-02c] DUYỆT = KHOÁ: kế hoạch đã duyệt thì không sửa được nữa", async () => {
    const order = await createOrderWithRequest(10_000_000, cs1, 22);
    await recordInstallmentPlan({
      orderId: order.id, dot1Amount: 6_000_000, dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"), actorId: approver.id,
    });
    expect((await approveInstallmentPlan({ orderId: order.id, actor: approver })).ok).toBe(true);

    const locked = await recordInstallmentPlan({
      orderId: order.id, dot1Amount: 1_000_000, dot2Amount: 9_000_000,
      dot2DueDate: new Date("2026-11-01"), actorId: approver.id,
    });
    expect(locked.ok).toBe(false);
    expect(locked.error).toMatch(/đã được duyệt/i);

    // Số tiền phiếu KHÔNG đổi theo lần sửa bị chặn.
    const dots = (await requestsOf(order.id)).filter((r) => r.installmentNo > 0);
    expect(dots.map((d) => d.amountDue)).toEqual([6_000_000, 4_000_000]);
  });

  test("[PR-03] duyệt kế hoạch → sinh đúng 2 phiếu đợt, phiếu toàn đơn VOID, matchKey ORD…D1/D2", async () => {
    const order = await createOrderWithRequest(10_000_000, cs1, 3);
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: approver.id,
    });

    const appr = await approveInstallmentPlan({ orderId: order.id, actor: approver });
    expect(appr.ok).toBe(true);

    const rows = await requestsOf(order.id);
    expect(rows).toHaveLength(3);

    const full = rows.find((r) => r.installmentNo === 0)!;
    expect(full.status).toBe("VOID");

    const dot1 = rows.find((r) => r.installmentNo === 1)!;
    const dot2 = rows.find((r) => r.installmentNo === 2)!;
    expect(dot1.amountDue).toBe(6_000_000);
    expect(dot2.amountDue).toBe(4_000_000);
    expect(dot1.sortOrder).toBe(1);
    expect(dot2.sortOrder).toBe(2);
    expect(dot2.dueDate?.toISOString()).toBe(new Date("2026-09-01").toISOString());
    expect(dot1.matchKey).toBe("ORD260803000003D1");
    expect(dot2.matchKey).toBe("ORD260803000003D2");
    expect(dot1.matchKey).toBe(paymentMatchKey(order.code, 1));
    expect(dot1.centerId).toBe(cs1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-04] duyệt lại lần 2 → idempotent, vẫn đúng 2 phiếu đợt (không nhân đôi)", async () => {
    const order = await createOrderWithRequest(10_000_000, cs1, 4);
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: approver.id,
    });
    await approveInstallmentPlan({ orderId: order.id, actor: approver });
    const idsAfterFirst = (await requestsOf(order.id)).map((r) => r.id).sort();

    const again = await approveInstallmentPlan({ orderId: order.id, actor: approver });
    expect(again.ok).toBe(true);

    const rows = await requestsOf(order.id);
    expect(rows.filter((r) => r.installmentNo > 0)).toHaveLength(2);
    expect(rows).toHaveLength(3);
    // Cùng phiếu, không phải phiếu mới → matchKey (định danh đối khớp) giữ nguyên.
    expect(rows.map((r) => r.id).sort()).toEqual(idsAfterFirst);
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-05] QĐ-2: phiếu đợt 1 sinh ra ở PENDING dù OrderInstallment đợt 1 = PAID", async () => {
    const order = await createOrderWithRequest(10_000_000, cs1, 5);
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: approver.id,
    });
    await approveInstallmentPlan({ orderId: order.id, actor: approver });

    // Sổ CŨ giữ nguyên hành vi (không phá công nợ đang chạy)…
    const old = await getOrderInstallments(order.id);
    expect(old.find((i) => i.soDot === 1)!.status).toBe("PAID");

    // …sổ MỚI theo luật mới: chưa có đồng nào về ⇒ PENDING.
    const views = await getOrderPaymentRequests(order.id);
    const dot1 = views.find((v) => v.installmentNo === 1)!;
    expect(dot1.status).toBe("PENDING");
    expect(dot1.allocated).toBe(0);
    expect(dot1.outstanding).toBe(6_000_000);
    expect(views.find((v) => v.installmentNo === 2)!.status).toBe("PENDING");
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-06] từ chối kế hoạch sau khi đã duyệt → phiếu đợt VOID, phiếu toàn đơn sống lại", async () => {
    const order = await createOrderWithRequest(10_000_000, cs1, 6);
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: approver.id,
    });
    await approveInstallmentPlan({ orderId: order.id, actor: approver });

    const rej = await rejectInstallmentPlan({
      orderId: order.id,
      actor: approver,
      reason: "Khách đổi ý, đóng 1 lần",
    });
    expect(rej.ok).toBe(true);

    const rows = await requestsOf(order.id);
    expect(rows.filter((r) => r.installmentNo > 0).every((r) => r.status === "VOID")).toBe(true);
    const full = rows.find((r) => r.installmentNo === 0)!;
    expect(full.status).toBe("PENDING");
    expect(full.amountDue).toBe(10_000_000);
    // Vẫn đúng 3 dòng — hồi sinh chứ không đẻ phiếu toàn đơn thứ hai.
    expect(rows).toHaveLength(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-07] recomputeRequestStatuses: PENDING → PARTIAL → PAID theo sổ phân bổ; đủ hết → đơn CONFIRMED", async () => {
    const order = await createOrderWithRequest(10_000_000, cs1, 7);
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-09-01"),
      actorId: approver.id,
    });
    await approveInstallmentPlan({ orderId: order.id, actor: approver });
    const rows = await requestsOf(order.id);
    const dot1 = rows.find((r) => r.installmentNo === 1)!;
    const dot2 = rows.find((r) => r.installmentNo === 2)!;

    // Rót thiếu → PARTIAL (KHÔNG từ chối vì lệch tiền).
    await allocate(dot1.id, 2_000_000, cs1);
    await recompute(order.id);
    let views = await getOrderPaymentRequests(order.id);
    expect(views.find((v) => v.installmentNo === 1)!.status).toBe("PARTIAL");
    expect(views.find((v) => v.installmentNo === 1)!.outstanding).toBe(4_000_000);

    // Rót nốt → PAID. Đơn chưa đủ (còn đợt 2) nên chưa CONFIRMED.
    await allocate(dot1.id, 4_000_000, cs1);
    await recompute(order.id);
    views = await getOrderPaymentRequests(order.id);
    expect(views.find((v) => v.installmentNo === 1)!.status).toBe("PAID");
    expect(views.find((v) => v.installmentNo === 1)!.outstanding).toBe(0);
    expect(views.find((v) => v.installmentNo === 2)!.status).toBe("PENDING");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "PENDING_PAYMENT",
    );

    // Đóng nốt đợt 2 → mọi phiếu còn sống đều PAID ⇒ rollup lên Order.
    await allocate(dot2.id, 4_000_000, cs1);
    await recompute(order.id);
    views = await getOrderPaymentRequests(order.id);
    expect(views.find((v) => v.installmentNo === 2)!.status).toBe("PAID");
    // Phiếu toàn đơn đã VOID thì đứng ngoài phép tính "đơn đã đủ chưa".
    expect(views.find((v) => v.installmentNo === 0)!.status).toBe("VOID");
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.paidAt).not.toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  test("[PR-08] cách ly cơ sở: phiếu thu mang centerId của đơn — actor CS1 không đọc được phiếu CS2", async () => {
    const o1 = await createOrderWithRequest(5_000_000, cs1, 8);
    const o2 = await createOrderWithRequest(7_000_000, cs2, 9);
    const r1 = (await requestsOf(o1.id))[0];
    const r2 = (await requestsOf(o2.id))[0];
    expect(r1.centerId).toBe(cs1);
    expect(r2.centerId).toBe(cs2);

    const u = await makeUser("qllop-cs1", "CS1", "CENTER_CLASS_MANAGER", "SALES_CSM");
    const actor = await resolveActorUncached(u.id);
    const sdb = scopedDb(actor);

    expect(await sdb.paymentRequest.findUnique({ where: { id: r1.id } })).not.toBeNull();
    expect(await sdb.paymentRequest.findUnique({ where: { id: r2.id } })).toBeNull();

    const visible = await sdb.paymentRequest.findMany({ select: { id: true, centerId: true } });
    expect(visible.map((v) => v.id)).toContain(r1.id);
    expect(visible.map((v) => v.id)).not.toContain(r2.id);
  });
});
