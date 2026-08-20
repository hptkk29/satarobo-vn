/**
 * QR-SESSION — xuất QR THEO TỪNG PHIẾU THU (đợt), không phải mức đơn.
 * Postgres LOCAL (.env.test). Test service-level: gọi thẳng core của màn đơn
 * (`app/(admin)/admin/orders/_qr-core`), không dựng HTTP.
 *
 * Vì sao gọi core chứ không gọi server action: runner Playwright stub `@/lib/auth`
 * → `auth()` trả null nên `_qr-actions.ts` không chạy được happy-path. Core nhận
 * `actor` tường minh (đã resolveActorUncached từ UserOrgRole thật) nên vẫn phủ
 * đúng phần rủi ro: số tiền, chống 2 QR song song, bất biến matchKey, cách ly cơ sở.
 *
 * Phủ:
 *  [QR-01] QR đợt 1 in phần CÒN THIẾU CỦA ĐỢT (không phải tổng đơn).
 *  [QR-02] bấm 2 lần → dùng lại phiên cũ, không đẻ 2 QR ACTIVE.
 *  [QR-03] tạo lại 5 lần → 5 phiên (4 EXPIRED + 1 ACTIVE), matchKey KHÔNG đổi.
 *  [QR-04] phiếu PAID → từ chối.
 *  [QR-05] phiếu cơ sở khác → "không tìm thấy" (không lộ tồn tại), không tạo phiên.
 *  [QR-06] phiên ACTIVE ĐÃ QUÁ HẠN không được tái sử dụng → mở phiên mới.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { testEmail } from "../_helpers/fixtures";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { resolveActorUncached, type Actor } from "../../../lib/auth/actor";
import { paymentMatchKey } from "../../../lib/payments/payment-request";
import {
  issueQrForRequestCore,
  regenerateQrCore,
} from "../../../app/(admin)/admin/orders/_qr-core";

const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };
const AUDIT = { id: null, name: "Sale Test" };

let seq = 0;
const uniq = () => `${Date.now().toString(36)}-${seq++}`;

async function orgId(code: string) {
  return (await db.orgUnit.findUnique({ where: { code }, select: { id: true } }))!.id;
}
async function centerIdOf(code: string) {
  return (await db.orgUnit.findUnique({ where: { code }, select: { centerId: true } }))!
    .centerId!;
}

/** Actor cấp CƠ SỞ (CENTER_MANAGER) — visibleCenterIds = đúng cơ sở đó. */
async function makeCenterActor(orgCode: string): Promise<Actor> {
  const u = await seedUser({ email: testEmail(`qr-${orgCode}-${uniq()}`), role: "CENTER_MANAGER" });
  const roleId = (await db.roleDef.findUnique({
    where: { code: "CENTER_MANAGER" },
    select: { id: true },
  }))!.id;
  await assignUserOrgRole(SA, {
    userId: u.id,
    orgUnitId: await orgId(orgCode),
    roleId,
    reason: "seed qr-session",
  });
  return resolveActorUncached(u.id);
}

async function seedOrder(centerId: string, totalAmount: number) {
  return db.order.create({
    data: {
      code: `ORD-260803-${String(100000 + seq++).slice(-6)}`,
      type: "COURSE",
      customerName: "PH QR",
      customerPhone: "0905123456",
      centerId,
      totalAmount,
      subtotal: totalAmount,
    },
  });
}

async function seedRequest(
  order: { id: string; code: string; centerId: string | null },
  installmentNo: number,
  amountDue: number,
) {
  return db.paymentRequest.create({
    data: {
      orderId: order.id,
      centerId: order.centerId,
      installmentNo,
      amountDue,
      matchKey: paymentMatchKey(order.code, installmentNo),
      sortOrder: installmentNo,
    },
  });
}

/** Rót `amount` vào phiếu (qua BankTransaction thật) để có "đã thu / còn thiếu". */
async function allocate(paymentRequestId: string, centerId: string | null, amount: number) {
  const txn = await db.bankTransaction.create({
    data: {
      provider: "PAYOS",
      providerTxnId: `txn-${uniq()}`,
      amount,
      transferredAt: new Date(),
      centerId,
      status: "MATCHED",
    },
  });
  await db.paymentAllocation.create({
    data: { bankTransactionId: txn.id, paymentRequestId, centerId, amount },
  });
}

test.describe("[QR] Xuất QR theo từng phiếu thu", () => {
  let cs1 = "";
  let cs2 = "";
  let actorCs1: Actor;

  test.beforeEach(async () => {
    await resetDb();
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: `cs1-qr-${uniq()}`, address: "a" } });
    await db.center.create({ data: { code: "CS2", name: "CS2", slug: `cs2-qr-${uniq()}`, address: "b" } });
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    cs1 = await centerIdOf("CS1");
    cs2 = await centerIdOf("CS2");
    // Tài khoản nhận tiền (QR ảnh tĩnh VietQR) — payOS không cấu hình trong .env.test
    // nên core rơi về nhánh này; đây đúng là nhánh cần chắc chắn chạy được ở go-live.
    await db.integrationConfig.create({
      data: {
        provider: "VIETQR",
        isEnabled: true,
        settings: { bankBin: "970415", accountNumber: "0123456789", accountName: "SATA ROBO" },
      },
    });
    actorCs1 = await makeCenterActor("CS1");
  });

  test("[QR-01] QR đợt 1 in PHẦN CÒN THIẾU CỦA ĐỢT ĐÓ, không phải tổng đơn", async () => {
    const order = await seedOrder(cs1, 10_000_000);
    const dot1 = await seedRequest(order, 1, 4_000_000);
    await seedRequest(order, 2, 6_000_000);
    await allocate(dot1.id, cs1, 1_000_000); // đã thu 1tr của đợt 1

    const res = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: dot1.id });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 3tr = 4tr (đợt 1) − 1tr đã thu. KHÔNG phải 10tr (tổng đơn), không phải 4tr.
    expect(res.session.amountShown).toBe(3_000_000);
    expect(res.reused).toBe(false);

    const rows = await db.qrSession.findMany({ where: { paymentRequestId: dot1.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("ACTIVE");
    expect(rows[0]!.amountShown).toBe(3_000_000);
    expect(rows[0]!.centerId).toBe(cs1);
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // 20/08 — nội dung in lên QR là dạng NGƯỜI ĐỌC `HoTenCon_SdtPH_TenKhoa`, KHÔNG
    // còn là matchKey (sale phải đọc được chuỗi này cho phụ huynh qua điện thoại).
    // Đơn seed không gắn học viên/dòng hàng nên rút về "tên người mua_SĐT".
    expect(rows[0]!.qrContent).toContain("PHQR_84905123456");
    expect(rows[0]!.qrContent).not.toContain(paymentMatchKey(order.code, 1));
    // Phiếu đợt 2 không bị đụng tới.
    expect(await db.qrSession.count()).toBe(1);
  });

  test("[QR-01b] đợt 1 và đợt 2 dùng CHUNG một nội dung CK — có chủ đích, không phải lỗi", async () => {
    // Định dạng chủ dự án chốt 20/08 không mang thông tin "đợt nào". Cái phân biệt
    // là SỐ TIỀN trên QR; tiền về thì nhánh (d) của webhook neo vào đợt chưa đóng
    // đủ sớm nhất rồi để waterfall rót tiếp. Khoá hành vi này lại để người sau
    // đừng "sửa" nó thành mỗi đợt một chuỗi (sẽ vỡ đường đối khớp theo SĐT).
    const order = await seedOrder(cs1, 10_000_000);
    const dot1 = await seedRequest(order, 1, 4_000_000);
    const dot2 = await seedRequest(order, 2, 6_000_000);

    const a = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: dot1.id });
    const b = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: dot2.id });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.session.transferContent).toBe("PHQR_84905123456");
    expect(b.session.transferContent).toBe(a.session.transferContent);
    // …nhưng SỐ TIỀN thì khác nhau, đó mới là thứ phân biệt hai mã.
    expect(a.session.amountShown).toBe(4_000_000);
    expect(b.session.amountShown).toBe(6_000_000);
    // matchKey vẫn nguyên trong DB — đường khớp của mọi QR phát trước 20/08.
    expect((await db.paymentRequest.findUniqueOrThrow({ where: { id: dot1.id } })).matchKey).toBe(
      paymentMatchKey(order.code, 1),
    );
  });

  test("[QR-02] bấm Xuất QR 2 lần liên tiếp → KHÔNG có 2 phiên ACTIVE (dùng lại phiên cũ)", async () => {
    const order = await seedOrder(cs1, 5_000_000);
    const req = await seedRequest(order, 1, 5_000_000);

    const first = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: req.id });
    const second = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: req.id });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.session.id).toBe(first.session.id);

    expect(await db.qrSession.count({ where: { paymentRequestId: req.id } })).toBe(1);
    expect(
      await db.qrSession.count({ where: { paymentRequestId: req.id, status: "ACTIVE" } }),
    ).toBe(1);
  });

  test("[QR-03] tạo lại QR 5 lần → 5 phiên (4 EXPIRED + 1 ACTIVE) nhưng matchKey của phiếu KHÔNG ĐỔI", async () => {
    const order = await seedOrder(cs1, 3_000_000);
    const req = await seedRequest(order, 1, 3_000_000);
    const matchKeyBefore = req.matchKey;
    expect(matchKeyBefore).toBe(paymentMatchKey(order.code, 1));

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await regenerateQrCore(actorCs1, AUDIT, { paymentRequestId: req.id });
      expect(res.ok).toBe(true);
      if (res.ok) ids.push(res.session.id);
    }
    expect(new Set(ids).size).toBe(5); // 5 phiên KHÁC NHAU

    const all = await db.qrSession.findMany({ where: { paymentRequestId: req.id } });
    expect(all).toHaveLength(5);
    expect(all.filter((s) => s.status === "EXPIRED")).toHaveLength(4);
    expect(all.filter((s) => s.status === "ACTIVE")).toHaveLength(1);

    // BẤT BIẾN #3 — định danh đối khớp bền theo ĐỜI PHIẾU: tạo lại lần thứ 5 thì
    // tiền của mọi QR cũ vẫn rơi đúng đợt này.
    const after = await db.paymentRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.matchKey).toBe(matchKeyBefore);
    // Mọi phiên (kể cả đã EXPIRED) vẫn trỏ về CÙNG một phiếu thu.
    expect(new Set(all.map((s) => s.paymentRequestId))).toEqual(new Set([req.id]));
  });

  test("[QR-04] phiếu đã PAID → từ chối xuất QR, không tạo phiên", async () => {
    const order = await seedOrder(cs1, 2_000_000);
    const req = await seedRequest(order, 1, 2_000_000);
    await allocate(req.id, cs1, 2_000_000);
    await db.paymentRequest.update({ where: { id: req.id }, data: { status: "PAID" } });

    const res = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: req.id });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("đã đóng đủ");
    expect(await db.qrSession.count()).toBe(0);

    // Tạo lại QR cũng phải bị chặn (không có cửa sau qua nút "Tạo lại").
    const again = await regenerateQrCore(actorCs1, AUDIT, { paymentRequestId: req.id });
    expect(again.ok).toBe(false);
    expect(await db.qrSession.count()).toBe(0);
  });

  test("[QR-05] phiếu của cơ sở khác → không xuất được, báo 'không tìm thấy' (không lộ tồn tại)", async () => {
    const orderCs2 = await seedOrder(cs2, 7_000_000);
    const reqCs2 = await seedRequest(orderCs2, 1, 7_000_000);

    const res = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: reqCs2.id });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Không tìm thấy phiếu thu");
    expect(await db.qrSession.count()).toBe(0);

    const regen = await regenerateQrCore(actorCs1, AUDIT, { paymentRequestId: reqCs2.id });
    expect(regen.ok).toBe(false);
    expect(await db.qrSession.count()).toBe(0);

    // Actor CS2 thì vẫn xuất được — chứng minh chặn là do CÁCH LY, không phải phiếu hỏng.
    const actorCs2 = await makeCenterActor("CS2");
    const ok = await issueQrForRequestCore(actorCs2, AUDIT, { paymentRequestId: reqCs2.id });
    expect(ok.ok).toBe(true);
  });

  test("[QR-06] phiên ACTIVE đã quá hạn KHÔNG được tái sử dụng → mở phiên mới", async () => {
    const order = await seedOrder(cs1, 1_500_000);
    const req = await seedRequest(order, 1, 1_500_000);

    const first = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: req.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Đẩy phiên hiện tại về quá khứ (giữ status ACTIVE — mô phỏng hết hạn tự nhiên).
    await db.qrSession.update({
      where: { id: first.session.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const second = await issueQrForRequestCore(actorCs1, AUDIT, { paymentRequestId: req.id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reused).toBe(false);
    expect(second.session.id).not.toBe(first.session.id);
    expect(await db.qrSession.count({ where: { paymentRequestId: req.id } })).toBe(2);
  });
});
