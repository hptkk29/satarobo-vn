/**
 * BUG 21/08/2026 — "BẤM NGHỈ HỌC RỒI MÀ LỚP VẪN CÒN TÊN EM ĐÓ". Postgres LOCAL (.env.test).
 *
 * Chủ dự án báo: vào hồ sơ học viên bấm cho nghỉ học, nhưng mở trang Học sinh của lớp
 * thì em đó vẫn nằm nguyên trong danh sách.
 *
 * Nguyên nhân (đã vá): `withdrawStudentAction` TỰ CHÉP TAY danh sách trạng thái ghi danh
 * cần dọn — `["PENDING","CONFIRMED","STUDYING","PAUSED"]` — và BỎ SÓT `ACTIVE`. Mà:
 *   • `Enrollment.status` mặc định của schema LÀ `ACTIVE` (prisma/schema.prisma:1822);
 *   • cả hai đường convert lead (`lib/crm/convert-lead.ts:136`,
 *     `lib/crm/convert-lead-v2.ts:286`, kể cả bulk-convert) tạo ghi danh KHÔNG truyền
 *     `status` ⇒ phần lớn học viên THẬT mang ghi danh `ACTIVE`;
 *   • roster lớp lại lọc `[...CAPACITY_COUNT_STATUSES, "PAUSED"]` — CÓ `ACTIVE`.
 * Chênh đúng một phần tử, nên admin bấm đúng nút vẫn dính, và cũng KHÔNG có yêu cầu
 * hoàn tiền nào được tạo.
 *
 * Bản vá: cả hai luồng (nghỉ học + xoá học viên) dùng chung
 * `removeStudentFromClasses` / `REMOVABLE_ENROLLMENT_STATUSES`.
 *
 * Test service-level: Server Action cần auth() nên gọi thẳng lib — đúng thứ mà
 * withdrawStudentAction chạy trong transaction, cộng roster THẬT của điểm danh.
 *
 * Phủ:
 *  W1 — ghi danh legacy ACTIVE PHẢI bị gỡ (đây chính là ca hỏng).
 *  W2 — sau khi gỡ, roster buổi học không còn em đó.
 *  W3 — bộ trạng thái dọn được PHỦ ĐÚNG bộ mà roster lớp coi là "đang trong lớp".
 *  W4 — convert lead sinh ra ghi danh ACTIVE (khoá lại giả định nền của bug này).
 *  W5 — ghi danh ACTIVE ĐÃ THU TIỀN vẫn sinh yêu cầu hoàn tiền (hệ quả bị mất lúc hỏng).
 *  W6 — cùng gốc bệnh: BẢO LƯU cũng phải nhận ghi danh ACTIVE (trước đây báo
 *       "Chỉ có thể bảo lưu lớp đang STUDYING" nên đa số học viên thật không bảo lưu được).
 */
import { test, expect } from "@playwright/test";
import type { Prisma } from "@prisma/client";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import { buildActor } from "../../../lib/auth/actor";
import { buildSessionAttendanceRows } from "../../../lib/attendance/roster";
import { REMOVABLE_ENROLLMENT_STATUSES } from "../../../lib/students/remove-from-classes";
import { withdrawStudentFromAllClasses } from "../../../lib/students/withdraw";
import { CAPACITY_COUNT_STATUSES } from "../../../lib/lms/assign";
import { STUDYING_ENROLLMENT_STATUSES } from "../../../lib/enrollment-status";
import { canTransition } from "../../../lib/enrollments/status";

let seq = 0;
const uniq = () => `${Date.now().toString(36)}-${seq++}`;

const plainActor = () =>
  buildActor({ userId: `u-${uniq()}`, rows: [], orgNodes: [], assignedClassIds: [] });

/** Dựng lớp + 1 học viên, ghi danh KHÔNG truyền status → nhận default của schema. */
async function seedConvertedStudent() {
  const code = `CS-${uniq()}`;
  const center = await db.center.create({
    data: { code, name: `Cơ sở ${code}`, slug: `cs-${code.toLowerCase()}`, address: "x" },
  });
  const course = await db.course.create({
    data: { name: `Sata ${uniq()}`, slug: `sata-${uniq()}`, price: 4_000_000 },
  });
  const cls = await db.class.create({
    data: { name: `Lớp ${uniq()}`, courseId: course.id, centerId: center.id },
  });
  const student = await db.student.create({
    data: { name: `HV ${uniq()}`, centerId: center.id, status: "ACTIVE" },
  });
  // ⚠️ CỐ Ý không truyền `status` — mô phỏng ĐÚNG lib/crm/convert-lead*.ts.
  const enr = await db.enrollment.create({
    data: {
      studentId: student.id,
      classId: cls.id,
      courseId: course.id,
      centerId: center.id,
      finalPrice: 4_000_000,
    },
  });
  const session = await db.classSession.create({
    data: { classId: cls.id, date: new Date("2026-08-01"), centerId: center.id },
  });
  return { center, course, cls, student, enr, session };
}

/**
 * Chạy ĐÚNG hàm mà `withdrawStudentAction` gọi trong transaction — không dựng lại logic,
 * nếu không test sẽ xanh trong khi đường thật vẫn hỏng (chính là cái bẫy của bug này:
 * `removeStudentFromClasses` vốn ĐÃ đúng, hỏng nằm ở chỗ action không gọi nó).
 */
async function withdrawLikeAction(studentId: string, centerId: string | null) {
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    await tx.student.update({ where: { id: studentId }, data: { status: "INACTIVE" } });
    return withdrawStudentFromAllClasses({
      tx,
      studentId,
      actorId: null,
      actorName: "test",
      reason: "Học viên nghỉ học: test",
      orgUnitId: centerId,
    });
  });
}

test.describe("[BUG-2108] Nghỉ học phải gỡ khỏi lớp — kể cả ghi danh legacy ACTIVE", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[W4] convert lead sinh ghi danh status ACTIVE — giả định nền của bug", async () => {
    const { enr } = await seedConvertedStudent();
    const row = await db.enrollment.findUnique({
      where: { id: enr.id },
      select: { status: true },
    });
    expect(row?.status).toBe("ACTIVE");
  });

  test("[W1] ghi danh ACTIVE bị gỡ khi cho nghỉ học (trước bản vá thì KHÔNG)", async () => {
    const { student, enr, center } = await seedConvertedStudent();

    const removed = await withdrawLikeAction(student.id, center.id);

    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ fromStatus: "ACTIVE", toStatus: "WITHDREW" });

    const after = await db.enrollment.findUnique({
      where: { id: enr.id },
      select: { status: true, deletedAt: true, finalPrice: true },
    });
    expect(after?.status).toBe("WITHDREW");
    // Sổ sách không đổi: deletedAt là soft-delete TÀI CHÍNH, cascade không được đụng.
    expect(after?.deletedAt).toBeNull();
    expect(after?.finalPrice).toBe(4_000_000);

    const audit = await db.enrollmentAuditLog.findMany({ where: { enrollmentId: enr.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ fromStatus: "ACTIVE", toStatus: "WITHDREW" });
  });

  test("[W2] sau khi nghỉ học, roster buổi học không còn em đó", async () => {
    const { student, session, center } = await seedConvertedStudent();

    const before = await buildSessionAttendanceRows(plainActor(), session.id);
    expect(before.rows.map((r) => r.studentId)).toContain(student.id);

    await withdrawLikeAction(student.id, center.id);

    const after = await buildSessionAttendanceRows(plainActor(), session.id);
    expect(after.rows.map((r) => r.studentId)).not.toContain(student.id);
  });

  test("[W5] ghi danh ACTIVE đã thu tiền vẫn sinh yêu cầu hoàn tiền", async () => {
    const { student, enr, cls, center } = await seedConvertedStudent();
    // Có buổi CHƯA học + khoản đã thu xác nhận → computeRefund ra số dương.
    const order = await db.order.create({
      data: {
        code: `ORD-${uniq()}`,
        type: "COURSE",
        customerName: "PH test",
        customerPhone: "0900000000",
        centerId: center.id,
        studentId: student.id,
        subtotal: 4_000_000,
        totalAmount: 4_000_000,
        status: "CONFIRMED",
      },
    });
    await db.payment.create({
      data: {
        orderId: order.id,
        enrollmentId: enr.id,
        amount: 4_000_000,
        method: "CASH",
        paidDate: new Date("2026-08-01"),
        accountantStatus: "CONFIRMED",
        centerId: center.id,
      },
    });
    await db.classSession.createMany({
      data: [
        { classId: cls.id, date: new Date("2026-09-01"), centerId: center.id },
        { classId: cls.id, date: new Date("2026-09-08"), centerId: center.id },
      ],
    });

    await withdrawLikeAction(student.id, center.id);

    const refunds = await db.refundRequest.findMany({ where: { enrollmentId: enr.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ trigger: "WITHDRAW", status: "PENDING" });
    expect(refunds[0].proposedAmount).toBeGreaterThan(0);
  });

  test("[W6] bảo lưu nhận ghi danh ACTIVE, và state machine cho phép ACTIVE→PAUSED", async () => {
    // Hai khẳng định nền của bản vá reserveStudentAction — hằng số và state machine.
    expect(STUDYING_ENROLLMENT_STATUSES).toContain("ACTIVE");
    expect(STUDYING_ENROLLMENT_STATUSES).toContain("STUDYING");
    for (const from of STUDYING_ENROLLMENT_STATUSES) {
      expect(canTransition(from, "PAUSED"), `${from} → PAUSED phải hợp lệ`).toBe(true);
    }

    // Và ghi danh mặc định (ACTIVE) thật sự lọt bộ lọc "đang học".
    const { enr } = await seedConvertedStudent();
    const found = await db.enrollment.findFirst({
      where: { id: enr.id, status: { in: STUDYING_ENROLLMENT_STATUSES } },
      select: { id: true },
    });
    expect(found, "ghi danh mặc định ACTIVE phải nằm trong bộ đang-học").not.toBeNull();
  });

  test("[W3] bộ trạng thái dọn phủ đúng bộ roster lớp coi là đang trong lớp", async () => {
    // Roster /classes/[id]/students lọc [...CAPACITY_COUNT_STATUSES, "PAUSED"].
    for (const s of [...CAPACITY_COUNT_STATUSES, "PAUSED"] as const) {
      expect(
        REMOVABLE_ENROLLMENT_STATUSES,
        `roster hiện status ${s} nhưng luồng nghỉ học không dọn nó`,
      ).toContain(s);
    }
  });
});
