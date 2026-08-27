/**
 * HT (27/08/2026) — HOÀN TIỀN PHẢI ĐI VÀO CÔNG NỢ VÀ CỔNG PHỤ HUYNH.
 *
 * Bộ thuần ở `lib/finance/debt.test.ts` + `lib/finance/refund.test.ts` +
 * `lib/finance/hoan-tien-do-lech.test.ts` đã phủ phép tính. Bộ NÀY phủ đúng những thứ
 * chỉ Postgres thật mới trả lời được:
 *   • `WHERE_THUC_THU` lồng trong `include` của Enrollment có lọc đúng trên SQL không
 *     (nhánh `adjustments: { none: … }` là quan hệ — hàm thuần không kiểm được);
 *   • bút toán hoàn do CHÍNH `refundPayment()` sinh ra có khớp thứ 5 hàm đọc mong đợi;
 *   • `createRefundRequest` lần thứ hai có còn đề xuất trên số gộp không (đường hoàn dư);
 *   • màn ĐANG ĐÚNG (doanh thu thực thu) có bị đợt vá làm lệch không — phải KHÔNG đổi.
 *
 * Postgres LOCAL (.env.test). Service-level (R7_SKIP_WEBSERVER) — gọi thẳng hàm.
 *
 * Năm tình huống bắt buộc: hoàn toàn bộ · hoàn một phần · hoàn hai lần liên tiếp ·
 * hoàn sau khi đã điều chỉnh · ghi danh chưa thu đồng nào.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedUser, seedOrg, seedRoles } from "../_helpers/seed";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { resolveActorUncached } from "../../../lib/auth/actor";
import { getParentBilling } from "../../../lib/portal/billing";
import { getStudentBilling } from "../../../lib/portal/billing-student";
import { getParentDashboard } from "../../../lib/portal/dashboard";
import { getDebtRows } from "../../../lib/finance/debt";
import { createRefundRequest } from "../../../lib/finance/refund";
import { refundPayment, adjustPayment } from "../../../lib/finance/payment";
import { WHERE_THUC_THU } from "../../../lib/finance/thuc-thu";
import { scopedDb } from "../../../lib/db-scope";
import type { EnrollmentStatus } from "@prisma/client";

const HOC_PHI = 9_000_000;
const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };

/** Center id thật (OrgUnit "CS1" trỏ tới) — gán ở beforeEach. */
let CENTER = "";

/**
 * scopedDb của một SUPER_ADMIN neo tại HO — thấy mọi cơ sở. Dựng qua ĐÚNG đường RBAC
 * thật (`assignUserOrgRole` + `resolveActorUncached`); actor tự chế bằng object literal
 * sẽ thiếu trường và `db-scope` ném giữa chừng.
 */
async function sdbHoiSo(): Promise<Parameters<typeof getDebtRows>[0]> {
  const u = await seedUser({ email: "sa-ht@test.local", role: "SUPER_ADMIN" });
  const roleId = (await db.roleDef.findUnique({
    where: { code: "SUPER_ADMIN" },
    select: { id: true },
  }))!.id;
  const ho = (await db.orgUnit.findUnique({ where: { code: "HO" }, select: { id: true } }))!.id;
  await assignUserOrgRole(SA, { userId: u.id, orgUnitId: ho, roleId, reason: "seed" });
  const actor = await resolveActorUncached(u.id);
  return scopedDb(actor) as unknown as Parameters<typeof getDebtRows>[0];
}

async function seedCenter(): Promise<void> {
  await db.center.create({
    data: { code: "CS1", name: "CS1", slug: "cs1-ht", address: "test", city: "" },
  });
  await seedOrg(["HO", "CS1"]);
  await seedRoles();
  CENTER = (await db.orgUnit.findUnique({
    where: { code: "CS1" },
    select: { centerId: true },
  }))!.centerId!;
}

type Nen = {
  parentUserId: string;
  studentId: string;
  enrollmentId: string;
  classId: string;
  orderId: string;
};

let seq = 0;

/** Dựng PH + con + lớp + ghi danh đã chốt giá + 1 đơn hàng để treo bút toán. */
async function seedNen(slug: string, opts: { soBuoi?: number; daHoc?: number } = {}): Promise<Nen> {
  seq += 1;
  const parent = await seedUser({ email: `${slug}@test.local`, role: "PARENT" });
  const course = await db.course.create({
    data: { name: `Khoá ${slug}`, slug: `${slug}-${seq}` },
    select: { id: true },
  });
  const cls = await db.class.create({
    data: { name: `Lớp ${slug}`, courseId: course.id, centerId: CENTER, status: "ACTIVE" },
    select: { id: true },
  });
  const student = await db.student.create({
    data: { name: `HV ${slug}`, centerId: CENTER, parentUserId: parent.id },
    select: { id: true },
  });
  const enr = await db.enrollment.create({
    data: {
      studentId: student.id,
      classId: cls.id,
      courseId: course.id,
      status: "STUDYING",
      finalPrice: HOC_PHI,
      centerId: CENTER,
    },
    select: { id: true },
  });
  const order = await db.order.create({
    data: {
      code: `ORD-HT-${seq}`,
      type: "COURSE",
      customerName: `PH ${slug}`,
      customerPhone: "0900000000",
      centerId: CENTER,
      studentId: student.id,
    },
    select: { id: true },
  });

  // Buổi học (cho computeRefund): tổng + đã học.
  const soBuoi = opts.soBuoi ?? 0;
  const daHoc = opts.daHoc ?? 0;
  for (let i = 0; i < soBuoi; i++) {
    await db.classSession.create({
      data: {
        classId: cls.id,
        date: new Date(Date.UTC(2026, 5, i + 1)),
        status: i < daHoc ? "COMPLETED" : "SCHEDULED",
        centerId: CENTER,
      },
    });
  }

  return {
    parentUserId: parent.id,
    studentId: student.id,
    enrollmentId: enr.id,
    classId: cls.id,
    orderId: order.id,
  };
}

/** Ghi 1 khoản đã được kế toán xác nhận. */
async function thu(nen: Nen, amount: number): Promise<string> {
  seq += 1;
  const p = await db.payment.create({
    data: {
      orderId: nen.orderId,
      enrollmentId: nen.enrollmentId,
      amount,
      method: "CASH",
      paidDate: new Date("2026-06-01T00:00:00.000Z"),
      accountantStatus: "CONFIRMED",
      confirmedAt: new Date("2026-06-01T00:00:00.000Z"),
      centerId: CENTER,
    },
    select: { id: true },
  });
  await db.receipt.create({
    data: { code: `RCP-HT-${seq}`, enrollmentId: nen.enrollmentId, paymentId: p.id, status: "ACTIVE" },
  });
  return p.id;
}

async function doiTrangThaiGhiDanh(id: string, status: EnrollmentStatus): Promise<void> {
  await db.enrollment.update({ where: { id }, data: { status } });
}

/** Kế toán dùng để đứng tên bút toán hoàn / điều chỉnh. */
async function seedKeToan(slug: string): Promise<string> {
  const u = await seedUser({ email: `ketoan-${slug}@test.local`, role: "ACCOUNTANT", centerId: CENTER });
  return u.id;
}

test.describe("HT — hoàn tiền vào công nợ & cổng phụ huynh", () => {
  test.beforeEach(async () => {
    await resetDb();
    await seedCenter();
  });

  test("[HT-E1] hoàn TOÀN BỘ — PH thấy đã thu về 0, biên lai có dòng hoàn, công nợ không đẻ nợ ma", async () => {
    const nen = await seedNen("e1");
    const acc = await seedKeToan("e1");
    const goc = await thu(nen, 5_000_000);

    const res = await refundPayment({ paymentId: goc, confirmedById: acc, reason: "PH xin rút" });
    expect(res.ok).toBe(true);
    // Học viên nghỉ hẳn — đúng bối cảnh sinh ra bút toán hoàn.
    await doiTrangThaiGhiDanh(nen.enrollmentId, "WITHDREW");

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(0); // TRƯỚC KHI VÁ: 5.000.000
    expect(billing.totals.tuition).toBe(HOC_PHI);

    // Danh sách biên lai phải KHỚP với tổng — nếu không PH gọi lên hỏi ngay.
    expect(billing.receipts.reduce((s, r) => s + r.amount, 0)).toBe(billing.totals.paid);
    expect(billing.receipts.some((r) => r.loai === "HOAN" && r.amount === -5_000_000)).toBe(true);

    // Công nợ của em đã nghỉ KHÔNG được nhảy lên nguyên học phí.
    expect(billing.enrollments[0]?.outstanding).toBe(HOC_PHI - 5_000_000);
    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI - 5_000_000);
  });

  test("[HT-E2] hoàn MỘT PHẦN — trừ đúng phần đã trả lại trên cả 3 màn PH", async () => {
    const nen = await seedNen("e2");
    const acc = await seedKeToan("e2");
    const goc = await thu(nen, 5_000_000);
    await refundPayment({ paymentId: goc, confirmedById: acc, reason: "thu nhầm", amount: 2_000_000 });

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(3_000_000); // TRƯỚC KHI VÁ: 5.000.000

    const perChild = await getStudentBilling(nen.studentId);
    expect(perChild.paid).toBe(3_000_000);
    expect(perChild.outstanding).toBe(HOC_PHI - 3_000_000);

    const dash = await getParentDashboard(nen.parentUserId);
    expect(dash.totalDebt).toBe(HOC_PHI - 3_000_000);

    // Ghi danh CÒN HỌC → công nợ tăng lại đúng phần đã trả cho PH.
    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI - 3_000_000);
  });

  test("[HT-E3] hoàn HAI LẦN liên tiếp — đề xuất lần hai KHÔNG tính lại trên số gộp", async () => {
    // 9tr / 24 buổi (đơn giá 375k), đã đóng đủ 9tr, đã học 8 buổi.
    const nen = await seedNen("e3", { soBuoi: 24, daHoc: 8 });
    const acc = await seedKeToan("e3");
    const goc = await thu(nen, HOC_PHI);

    const lan1 = await createRefundRequest({
      enrollmentId: nen.enrollmentId,
      trigger: "WITHDRAW",
      reason: "nghỉ học",
    });
    expect(lan1?.paidConfirmed).toBe(HOC_PHI);
    expect(lan1?.proposedAmount).toBe(6_000_000); // 9tr − 8×375k

    // Kế toán chi và ghi sổ đúng 6tr.
    await refundPayment({ paymentId: goc, confirmedById: acc, reason: "chi hoàn", amount: 6_000_000 });

    // Trigger KHÁC ⇒ không dính chốt idempotent theo (enrollment, trigger).
    const lan2 = await createRefundRequest({
      enrollmentId: nen.enrollmentId,
      trigger: "MANUAL",
      reason: "xin hoàn thêm",
    });
    // TRƯỚC KHI VÁ: paidConfirmed = 9tr, proposedAmount = 6tr ⇒ hoàn tổng 12tr trên 9tr đã thu.
    expect(lan2?.paidConfirmed).toBe(3_000_000);
    expect(lan2?.proposedAmount).toBe(0);

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(3_000_000);
  });

  test("[HT-E3b] đã DUYỆT hoàn nhưng kế toán chưa ghi bút toán âm → đề xuất kế tiếp vẫn không phồng", async () => {
    const nen = await seedNen("e3b", { soBuoi: 24, daHoc: 8 });
    await thu(nen, HOC_PHI);

    const lan1 = await createRefundRequest({
      enrollmentId: nen.enrollmentId,
      trigger: "WITHDRAW",
      reason: "nghỉ học",
    });
    // approveRefund() CHỈ đổi trạng thái yêu cầu — nó KHÔNG ghi Payment âm.
    await db.refundRequest.update({
      where: { id: lan1!.id },
      data: { status: "APPROVED", approvedAmount: 6_000_000 },
    });

    const lan2 = await createRefundRequest({
      enrollmentId: nen.enrollmentId,
      trigger: "MANUAL",
      reason: "xin hoàn thêm",
    });
    expect(lan2?.paidConfirmed).toBe(3_000_000);
    expect(lan2?.proposedAmount).toBe(0);
  });

  test("[HT-E4] hoàn SAU KHI ĐÃ ĐIỀU CHỈNH — bản gốc bị loại, bút toán âm bị trừ", async () => {
    const nen = await seedNen("e4");
    const acc = await seedKeToan("e4");
    const goc = await thu(nen, 5_000_000);

    // Kế toán sửa số: 5tr → 3tr (bản MỚI ADJUSTED, bản gốc giữ nguyên).
    const adj = await adjustPayment({
      paymentId: goc,
      confirmedById: acc,
      reason: "ghi nhầm số tiền",
      amount: 3_000_000,
    });
    expect(adj.ok).toBe(true);
    const adjId = adj.ok ? adj.adjustmentId : "";

    // Rồi hoàn 1tr trên bản đã điều chỉnh.
    await refundPayment({ paymentId: adjId, confirmedById: acc, reason: "hoàn một phần", amount: 1_000_000 });

    const billing = await getParentBilling(nen.parentUserId);
    // TRƯỚC KHI VÁ: 5tr + 0 = 5tr (giữ số cũ, bỏ qua cả điều chỉnh lẫn hoàn).
    expect(billing.totals.paid).toBe(2_000_000);
    expect(billing.receipts.reduce((s, r) => s + r.amount, 0)).toBe(2_000_000);
    // Bản gốc đã bị thay thế KHÔNG được xuất hiện trong danh sách PH.
    expect(billing.receipts.some((r) => r.id === goc)).toBe(false);

    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI - 2_000_000);
  });

  test("[HT-E5] ghi danh CHƯA THU ĐỒNG NÀO — mọi màn giữ nguyên, không tạo yêu cầu hoàn rỗng", async () => {
    const nen = await seedNen("e5", { soBuoi: 24, daHoc: 0 });

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(0);
    expect(billing.totals.outstanding).toBe(HOC_PHI);
    expect(billing.receipts).toHaveLength(0);

    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI);

    const rr = await createRefundRequest({
      enrollmentId: nen.enrollmentId,
      trigger: "WITHDRAW",
      reason: "nghỉ học",
    });
    expect(rr).toBeNull();
  });

  test("[HT-E6] khoản PENDING vẫn KHÔNG hiện tiền cho PH (AC1 không bị đợt vá nới ra)", async () => {
    const nen = await seedNen("e6");
    await thu(nen, 4_000_000);
    await db.payment.create({
      data: {
        orderId: nen.orderId,
        enrollmentId: nen.enrollmentId,
        amount: 6_000_000,
        method: "CASH",
        paidDate: new Date("2026-06-02T00:00:00.000Z"),
        accountantStatus: "PENDING",
        centerId: CENTER,
      },
    });

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(4_000_000);
    expect(billing.flags.pendingCount).toBe(1);
    expect(billing.receipts.some((r) => r.amount === 6_000_000)).toBe(false);
  });

  test("[HT-E7] MÀN ĐANG ĐÚNG KHÔNG ĐƯỢC ĐỔI SỐ — doanh thu thực thu khớp đúng tổng PH thấy", async () => {
    // Đợt vá này chỉ nối công nợ + cổng PH + đề xuất hoàn vào công thức thực thu đã có.
    // Nếu số của đường doanh thu đổi thì đã vá sai chỗ.
    const nen = await seedNen("e7");
    const acc = await seedKeToan("e7");
    const goc = await thu(nen, 5_000_000);
    await refundPayment({ paymentId: goc, confirmedById: acc, reason: "hoàn", amount: 2_000_000 });

    const doanhThu = await db.payment.aggregate({ where: WHERE_THUC_THU, _sum: { amount: true } });
    expect(doanhThu._sum.amount).toBe(3_000_000);

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(doanhThu._sum.amount);
  });
});
