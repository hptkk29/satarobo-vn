/**
 * HT — HOÀN TIỀN PHẢI ĐI VÀO CÔNG NỢ VÀ CỔNG PHỤ HUYNH.
 *
 * 🔴 DỰNG LẠI 17/09/2026 theo mô hình DELTA (NỢ-2 trong `docs/hop-nhat-main-test-1609.md`).
 *
 * Bản gốc (27/08/2026, 8 ca) bị XOÁ trong lượt hợp nhất `main` → `test` ngày 16/09 vì nó
 * viết theo mô hình cũ `accountantStatus in [… ADJUSTED]`, không biên dịch được sau
 * `20260907090000_payment_type_tach_khoi_status`. Bộ được coi là thay thế
 * (`tests/finance/dieu-chinh.test.ts`) nhắc `refund`/`hoàn tiền`/`REFUNDED` ĐÚNG 0 LẦN —
 * nó phủ cơ chế delta ở TẦNG SỔ, không chạm đường hoàn tiền và không chạm màn phụ huynh.
 *
 * ── HAI MÔ HÌNH, ĐỪNG LẪN ────────────────────────────────────────────────────────────
 *   · ĐIỀU CHỈNH — `adjustPayment({ correctAmount })` sinh dòng `paymentType=ADJUSTMENT`
 *     mang **DELTA**, trạng thái `CONFIRMED`. Dòng GỐC **giữ nguyên số** và **vẫn được
 *     cộng**. Tổng = gốc + Σ delta. (Cũ: dòng mới mang SỐ ĐÚNG, trạng thái `ADJUSTED`,
 *     dòng gốc bị LOẠI — dịch thẳng assertion cũ sang đây là encode sai cơ chế.)
 *   · HOÀN TIỀN — `refundPayment()` sinh dòng số ÂM, trạng thái `REFUNDED`,
 *     `adjustmentOfId` trỏ về gốc. Cơ chế này KHÔNG đổi ở lượt 07/09.
 *
 * ── 🔴 ĐIỀU BỘ NÀY ĐO ĐƯỢC NGAY KHI DỰNG LẠI (17/09/2026) ─────────────────────────────
 * Cổng phụ huynh và công nợ đọc `KHOAN_DA_XAC_NHAN` (`lib/finance/debt.ts`) = CHỈ
 * `accountantStatus: "CONFIRMED"`. Đường doanh thu đọc `WHERE_THUC_THU`
 * (`lib/finance/thuc-thu.ts`) = `CONFIRMED` **+ `REFUNDED`**.
 *
 * ⇒ Dòng hoàn tiền VÔ HÌNH với cổng PH và công nợ, trong khi doanh thu thì thấy. Đo
 *   được: hoàn 2tr trên phiếu 5tr ⇒ doanh thu ra 3tr (đúng), cổng PH vẫn ra 5tr (sai).
 *   Bản `test` TRƯỚC merge đọc `WHERE_THUC_THU` ở chính `lib/portal/billing.ts`
 *   (`9202d782`, chú thích còn nguyên: *"KHÔNG còn lọc cứng CONFIRMED"*); bản `main`
 *   thắng khối xung đột và mang theo `KHOAN_DA_XAC_NHAN`.
 *
 * Các ca phụ thuộc điều đó được GHIM bằng `test.fail` — xem chú thích tại từng ca. Vá
 * là một đợt RIÊNG: `KHOAN_DA_XAC_NHAN` là bộ lọc dùng chung của nhiều đường tiền, đổi
 * nó phải cân từng nơi gọi chứ không sửa một dòng.
 *
 * ⚠️ ĐÃ THỬ BẢN VÁ NGÂY THƠ — ĐỪNG LÀM THẾ. Cho `KHOAN_DA_XAC_NHAN` nhận thêm `REFUNDED`
 * làm **cả 4 ca ghim lật XANH**, nhưng ĐỒNG THỜI làm `[HT-E1b]` **ĐỎ**: công nợ của em
 * đã nghỉ nhảy lên NGUYÊN học phí — một khoản không ai còn nợ. Đo bằng phép cấy I2 ngày
 * 17/09/2026. Bản vá đúng phải tách hai câu hỏi: "PH đã đóng bao nhiêu" (phải trừ dòng
 * hoàn) khác "ghi danh còn nợ bao nhiêu" (không được phồng lên vì tiền đã trả lại).
 *
 * ── VÌ SAO BỘ NÀY PHẢI CHẠM POSTGRES THẬT ────────────────────────────────────────────
 * Thứ nó phủ là những điều hàm thuần không trả lời được: bút toán do CHÍNH
 * `refundPayment()`/`adjustPayment()` sinh ra có khớp thứ mà năm đường đọc mong đợi
 * không; và màn ĐANG ĐÚNG (doanh thu thực thu) có bị lệch đi không.
 *
 * Postgres LOCAL (`.env.test`). Service-level — gọi thẳng hàm, không dựng trình duyệt.
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
import { REFUND_REQUEST_DISABLED } from "../../../lib/finance/cau-dao-hoan-tien";
import { refundPayment, adjustPayment } from "../../../lib/finance/payment";
import { WHERE_THUC_THU } from "../../../lib/finance/thuc-thu";
import { scopedDb } from "../../../lib/db-scope";
import type { EnrollmentStatus } from "@prisma/client";

const HOC_PHI = 9_000_000;
const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };

/** Lý do ghim, viết một lần — mọi ca ghim đều cùng một nguyên nhân. */
const GHIM_HOAN =
  "Nợ: cổng PH + công nợ đọc KHOAN_DA_XAC_NHAN (chỉ CONFIRMED) nên dòng REFUNDED " +
  "không bị trừ. Vá ở lib/finance/debt.ts + lib/portal/billing.ts — đợt riêng.";

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

/** Ghi 1 phiếu thu đã được kế toán xác nhận (`paymentType` mặc định = PAYMENT). */
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

/** Σ tiền PH nhìn thấy là "đã đóng", đọc qua ĐÚNG đường cổng phụ huynh. */
async function paidCuaPH(parentUserId: string): Promise<number> {
  return (await getParentBilling(parentUserId)).totals.paid;
}

/** Thu 5tr rồi điều chỉnh xuống 3tr. Trả id phiếu gốc + kế toán. */
async function thuRoiDieuChinh(slug: string): Promise<{ nen: Nen; goc: string; acc: string }> {
  const nen = await seedNen(slug);
  const acc = await seedKeToan(slug);
  const goc = await thu(nen, 5_000_000);
  const adj = await adjustPayment({
    paymentId: goc,
    actorId: acc,
    reason: "ghi nhầm số tiền",
    correctAmount: 3_000_000,
  });
  expect(adj.ok, adj.ok ? "" : `adjustPayment hỏng: ${JSON.stringify(adj)}`).toBe(true);
  if (adj.ok) expect(adj.delta, "delta phải là HIỆU, không phải số đúng").toBe(-2_000_000);
  return { nen, goc, acc };
}

test.describe("HT — hoàn tiền vào công nợ & cổng phụ huynh", () => {
  test.beforeEach(async () => {
    await resetDb();
    await seedCenter();
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // ƯU TIÊN 1 — ĐIỀU CHỈNH và GIAO ĐIỂM của nó với hoàn tiền. Đây là chỗ lượt hợp nhất
  // 16/09 vừa thay cơ chế, và là phần duy nhất phủ giao điểm ấy.
  // ───────────────────────────────────────────────────────────────────────────────────

  test("[HT-E4] ĐIỀU CHỈNH ở cổng PH — gốc GIỮ NGUYÊN, dòng delta hiện ra và được cộng", async () => {
    const { nen, goc } = await thuRoiDieuChinh("e4");

    // Bất biến của mô hình delta: dòng gốc KHÔNG bị đụng tới.
    const gocSau = await db.payment.findUnique({ where: { id: goc }, select: { amount: true } });
    expect(gocSau?.amount, "dòng gốc phải giữ nguyên số").toBe(5_000_000);

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid, "5tr + (−2tr) = 3tr").toBe(3_000_000);
    expect(billing.receipts.reduce((s, r) => s + r.amount, 0)).toBe(3_000_000);

    // ⚠️ ĐẢO SO VỚI BẢN CŨ, có chủ đích: mô hình cũ LOẠI dòng gốc khỏi danh sách PH
    // ("bản đã bị thay thế không được xuất hiện"). Mô hình delta thì GIỮ nó — sổ phải
    // đọc được là "đã thu 5tr, rồi sửa −2tr", chứ không phải "đã thu 3tr" từ trên trời.
    // Mất dòng gốc là mất dấu vết kiểm toán.
    const dongGoc = billing.receipts.find((r) => r.id === goc);
    expect(dongGoc, "dòng gốc PHẢI còn trong danh sách của PH").toBeTruthy();
    expect(dongGoc?.amount, "và giữ nguyên số của nó").toBe(5_000_000);
    expect(dongGoc?.daBiDieuChinh, "phải gắn nhãn đã bị điều chỉnh").toBe(true);

    const dongDelta = billing.receipts.find((r) => r.paymentType === "ADJUSTMENT");
    expect(dongDelta?.amount, "dòng điều chỉnh mang DELTA âm").toBe(-2_000_000);
    expect(dongDelta?.adjustmentOfId, "và trỏ về phiếu thu gốc").toBe(goc);
    expect(dongDelta?.lyDoDieuChinh, "lý do phải in được cho PH đọc").toBe("ghi nhầm số tiền");

    // Công nợ đọc cùng một con số — hai đường lệch nhau là một trong hai đang sai.
    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI - 3_000_000);
  });

  test("[HT-E4b] GIAO ĐIỂM hoàn tiền × điều chỉnh — delta VÀ dòng hoàn cùng phải được trừ", async () => {
    // ⚠️ GHIM nằm TRONG thân ca (đặt ở cấp file thì nó đánh dấu mọi ca phía sau).
    // Ca này ĐANG ĐỎ: đo được 3.000.000 (chỉ trừ delta) thay vì 2.000.000.
    // Vá xong nó chuyển XANH và Playwright báo "expected to fail" ⇒ buộc gỡ ghim.
    test.fail(true, GHIM_HOAN);

    const { nen, goc, acc } = await thuRoiDieuChinh("e4b");

    // Hoàn luôn trỏ vào PHIẾU THU gốc — dòng ADJUSTMENT là một hiệu số, không phải một
    // khoản tiền để mà trả lại.
    const ref = await refundPayment({
      paymentId: goc,
      confirmedById: acc,
      reason: "hoàn một phần",
      amount: 1_000_000,
    });
    expect(ref.ok, ref.ok ? "" : `refundPayment hỏng: ${JSON.stringify(ref)}`).toBe(true);

    // 5.000.000 − 2.000.000 (delta) − 1.000.000 (hoàn) = 2.000.000.
    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid, "PH phải thấy 2tr: gốc trừ delta trừ hoàn").toBe(2_000_000);
    expect(billing.receipts.reduce((s, r) => s + r.amount, 0)).toBe(2_000_000);

    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI - 2_000_000);
  });

  test("[HT-E1] hoàn TOÀN BỘ — PH thấy đã thu về 0, biên lai có dòng hoàn", async () => {
    test.fail(true, GHIM_HOAN); // đo được 5.000.000 thay vì 0

    const nen = await seedNen("e1");
    const acc = await seedKeToan("e1");
    const goc = await thu(nen, 5_000_000);

    const res = await refundPayment({ paymentId: goc, confirmedById: acc, reason: "PH xin rút" });
    expect(res.ok).toBe(true);
    // Học viên nghỉ hẳn — đúng bối cảnh sinh ra bút toán hoàn.
    await doiTrangThaiGhiDanh(nen.enrollmentId, "WITHDREW");

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid, "đã trả lại hết thì PH không còn 'đã đóng' đồng nào").toBe(0);
    expect(billing.totals.tuition).toBe(HOC_PHI);

    // Danh sách biên lai phải KHỚP với tổng — nếu không PH gọi lên hỏi ngay.
    expect(billing.receipts.reduce((s, r) => s + r.amount, 0)).toBe(billing.totals.paid);
    // Dòng hoàn phải HIỆN RA, mang số âm: PH cần đọc được "đã nhận lại 5tr".
    expect(billing.receipts.some((r) => r.amount === -5_000_000)).toBe(true);
  });

  test("[HT-E1b] hoàn TOÀN BỘ cho em ĐÃ NGHỈ — công nợ KHÔNG đẻ nợ ma", async () => {
    // Vế này KHÔNG ghim: nó đang đúng, và phải giữ đúng cả sau khi vá ghim ở trên.
    // Vá kiểu "cộng dòng REFUNDED vào mọi phép trừ" mà không nghĩ sẽ đẩy công nợ của em
    // đã nghỉ lên NGUYÊN học phí — một khoản nợ không ai còn nợ. Ca này canh điều đó.
    const nen = await seedNen("e1b");
    const acc = await seedKeToan("e1b");
    const goc = await thu(nen, 5_000_000);
    await refundPayment({ paymentId: goc, confirmedById: acc, reason: "PH xin rút" });
    await doiTrangThaiGhiDanh(nen.enrollmentId, "WITHDREW");

    const billing = await getParentBilling(nen.parentUserId);
    expect(
      billing.enrollments[0]?.outstanding,
      "em đã nghỉ: công nợ không được nhảy lên nguyên học phí",
    ).toBe(HOC_PHI - 5_000_000);

    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI - 5_000_000);
  });

  test("[HT-E2] hoàn MỘT PHẦN — trừ đúng phần đã trả lại trên cả 3 màn PH", async () => {
    test.fail(true, GHIM_HOAN); // đo được 5.000.000 thay vì 3.000.000

    const nen = await seedNen("e2");
    const acc = await seedKeToan("e2");
    const goc = await thu(nen, 5_000_000);
    await refundPayment({ paymentId: goc, confirmedById: acc, reason: "thu nhầm", amount: 2_000_000 });

    // Ba màn PH phải nói CÙNG một con số. Ba đường đọc khác nhau, nên đây không phải
    // phép lặp: lệch nhau là một trong ba đang dùng bộ lọc khác.
    expect(await paidCuaPH(nen.parentUserId), "màn Học phí").toBe(3_000_000);

    const perChild = await getStudentBilling(nen.studentId);
    expect(perChild.paid, "màn theo từng con").toBe(3_000_000);
    expect(perChild.outstanding).toBe(HOC_PHI - 3_000_000);

    const dash = await getParentDashboard(nen.parentUserId);
    expect(dash.totalDebt, "màn tổng quan").toBe(HOC_PHI - 3_000_000);

    // Ghi danh CÒN HỌC → công nợ tăng lại đúng phần đã trả cho PH.
    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI - 3_000_000);
  });

  // ───────────────────────────────────────────────────────────────────────────────────
  // E3 / E3b — CẦU DAO. Bản gốc đo "đề xuất hoàn lần hai không phồng trên số gộp". Đường
  // ấy nay ĐANG TẮT có chủ đích (`REFUND_REQUEST_DISABLED`, 08/09/2026): trên prod
  // `ClassSession.status` không phản ánh thực tế đã dạy (2 COMPLETED / 287 SCHEDULED),
  // nên `sessionsLearned` đọc ra 0 và hệ thống đề xuất hoàn 100% học phí.
  //
  // ⇒ Viết lại cho đúng thứ đang chạy: đo CẦU DAO CÓ THẬT SỰ CHẶN KHÔNG. Ghim `test.fail`
  //   cho hai ca cũ ở đây sẽ là GHIM GIẢ — chúng "đỏ" vì hàm trả `null` rồi deref, không
  //   phải vì phép tính sai.
  // ───────────────────────────────────────────────────────────────────────────────────

  test("[HT-E3] cầu dao hoàn tiền ĐANG TẮT — không đẻ yêu cầu nào, kể cả khi đã thu đủ", async () => {
    const nen = await seedNen("e3", { soBuoi: 24, daHoc: 8 });
    await thu(nen, HOC_PHI);

    const rr = await createRefundRequest({
      enrollmentId: nen.enrollmentId,
      trigger: "WITHDRAW",
      reason: "nghỉ học",
    });
    expect(rr, "cầu dao tắt ⇒ trả null").toBeNull();

    // `null` phải đi kèm KHÔNG GHI GÌ — cầu dao trả null chứ không ném, nên nếu nó lỡ
    // ghi nửa chừng thì không ai thấy.
    expect(await db.refundRequest.count(), "không được đẻ dòng nào").toBe(0);
  });

  test("[HT-E3b] DÂY BẪY — gỡ cầu dao thì PHẢI dựng lại hai ca chống phồng đề xuất", async () => {
    // Ca này không đo nghiệp vụ; nó là DÂY BẪY. Bản gốc 27/08 có hai ca mà không bộ nào
    // khác phủ, và cả hai chỉ chạy được khi cầu dao mở:
    //
    //   [HT-E3]  hoàn 6tr trên 9tr đã thu ⇒ đề xuất LẦN HAI phải thấy paidConfirmed=3tr
    //            và proposedAmount=0. Nếu vẫn đọc 9tr thì đề xuất lại ra 6tr ⇒ tổng chi
    //            12tr trên 9tr đã thu. ĐÂY LÀ ĐƯỜNG TIỀN RA — sai ở đây là mất tiền thật.
    //   [HT-E3b] đã DUYỆT 6tr nhưng kế toán CHƯA ghi bút toán âm ⇒ đề xuất kế tiếp vẫn
    //            phải thấy 3tr. Khoảng hở "đã duyệt / chưa chi" là có thật, kéo dài ngày.
    //
    // Khi ai đó đủ 4 điều kiện gỡ (`lib/finance/cau-dao-hoan-tien.ts`) và xoá cầu dao,
    // ca này ĐỎ — buộc họ đọc đoạn trên và dựng lại hai ca ấy, thay vì để phần phủ biến
    // mất lần thứ hai. Lần thứ nhất nó biến mất trong lượt hợp nhất 16/09.
    expect(
      REFUND_REQUEST_DISABLED,
      "Cầu dao hoàn tiền đã được gỡ ⇒ DỰNG LẠI hai ca [HT-E3]/[HT-E3b] chống phồng đề xuất (đọc chú thích trong ca này), rồi mới xoá dây bẫy.",
    ).toBe(true);
  });

  test("[HT-E5] ghi danh CHƯA THU ĐỒNG NÀO — mọi màn giữ nguyên, không tạo yêu cầu hoàn rỗng", async () => {
    const nen = await seedNen("e5", { soBuoi: 24, daHoc: 0 });

    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(0);
    expect(billing.totals.outstanding).toBe(HOC_PHI);
    expect(billing.receipts).toHaveLength(0);

    const rows = await getDebtRows(await sdbHoiSo());
    expect(rows.find((r) => r.enrollmentId === nen.enrollmentId)?.debt).toBe(HOC_PHI);

    // ⚠️ NÓI THẲNG ĐIỂM YẾU: khẳng định dưới đây HIỆN KHÔNG ĐO ĐƯỢC GÌ. Cầu dao
    // (`REFUND_REQUEST_DISABLED`) trả `null` trước khi hàm kịp chạm tới cổng
    // "chưa thu đồng nào", nên nó xanh vì lý do KHÁC với lý do nó được viết ra. Đã kiểm:
    // không phép cấy nào trong năm phép ngày 17/09 làm ca này đổi trạng thái.
    // Giữ lại vì khi cầu dao được gỡ, nó lập tức đo thật trở lại — và `[HT-E3b]` là dây
    // bẫy buộc người gỡ cầu dao phải quay lại đọc chỗ này.
    const rr = await createRefundRequest({
      enrollmentId: nen.enrollmentId,
      trigger: "WITHDRAW",
      reason: "nghỉ học",
    });
    expect(rr, "chưa thu đồng nào thì không đẻ yêu cầu hoàn rỗng").toBeNull();
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

    // Cổng này đi NGƯỢC hướng với các ca ghim ở trên: chúng đòi NỚI ra cho dòng REFUNDED
    // được trừ, ca này canh không nới nhầm sang khoản CHƯA đối soát. Tiền chưa xác nhận
    // mà hiện cho PH là hứa với họ một thứ kế toán chưa công nhận.
    const billing = await getParentBilling(nen.parentUserId);
    expect(billing.totals.paid).toBe(4_000_000);
    expect(billing.flags.pendingCount).toBe(1);
    expect(billing.receipts.some((r) => r.amount === 6_000_000)).toBe(false);
  });

  test("[HT-E7] MÀN ĐANG ĐÚNG KHÔNG ĐƯỢC ĐỔI SỐ — doanh thu thực thu vẫn trừ dòng hoàn", async () => {
    // Đường doanh thu (`WHERE_THUC_THU`) vốn ĐÃ đúng: nó tính cả `REFUNDED`. Ca này canh
    // nó KHÔNG bị đợt vá cổng PH làm lệch đi. Không ghim — nó đang xanh và phải giữ xanh.
    const nen = await seedNen("e7");
    const acc = await seedKeToan("e7");
    const goc = await thu(nen, 5_000_000);
    await refundPayment({ paymentId: goc, confirmedById: acc, reason: "hoàn", amount: 2_000_000 });

    const doanhThu = await db.payment.aggregate({ where: WHERE_THUC_THU, _sum: { amount: true } });
    expect(doanhThu._sum.amount, "đường doanh thu không được đổi số").toBe(3_000_000);
  });

  test("[HT-E7b] HAI ĐƯỜNG PHẢI GẶP NHAU — cổng PH khớp đúng doanh thu thực thu", async () => {
    // ⚠️ Đây là ca chỉ thẳng vào chỗ hỏng: cùng một dữ liệu, hai đường đọc ra hai số.
    // Đo được: doanh thu 3.000.000 (đúng) · cổng PH 5.000.000 (sai).
    test.fail(true, GHIM_HOAN);

    const nen = await seedNen("e7b");
    const acc = await seedKeToan("e7b");
    const goc = await thu(nen, 5_000_000);
    await refundPayment({ paymentId: goc, confirmedById: acc, reason: "hoàn", amount: 2_000_000 });

    const doanhThu = await db.payment.aggregate({ where: WHERE_THUC_THU, _sum: { amount: true } });
    expect(await paidCuaPH(nen.parentUserId), "cổng PH phải khớp đường doanh thu").toBe(
      doanhThu._sum.amount,
    );
  });
});
