/**
 * #03 Pha A — denormalize centerId cho ConversationMessage + ReportCard.
 *
 * Bài học #04 (Attendance): flip model vào SCOPED_MODELS trong khi còn dòng `centerId = NULL`
 * ⇒ scopedDb inject `centerId IN (...)` ⇒ ẩn nhầm, im lặng. Nên pha A chỉ (a) thêm cột,
 * (b) backfill dòng cũ bằng migration, (c) ép MỌI đường tạo set centerId. Pha B mới flip.
 *
 * Spec này khoá (c) và khoá luôn "chưa flip" — nếu ai đó vội thêm vào SCOPED_MODELS,
 * test đỏ và buộc phải đọc runbook trước.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import { postMessage } from "../../../lib/conversation/service";
import { SCOPED_MODELS } from "../../../lib/db-scope";

const CS1 = "CS1";

async function seedEnrollment() {
  await db.center.upsert({
    where: { id: CS1 },
    create: { id: CS1, name: CS1, code: CS1, slug: "cs1", address: "test" },
    update: {},
  });
  const course = await db.course.create({ data: { name: "Khoá A", slug: "khoa-a" } });
  const cls = await db.class.create({
    data: { name: "Lớp A", courseId: course.id, centerId: CS1, status: "ACTIVE" },
    select: { id: true },
  });
  const student = await db.student.create({ data: { name: "HV", centerId: CS1 }, select: { id: true } });
  const enr = await db.enrollment.create({
    data: { studentId: student.id, classId: cls.id, courseId: course.id, centerId: CS1, status: "STUDYING" },
    select: { id: true },
  });
  const user = await db.user.create({
    data: { email: "gv.p03@t.vn", name: "GV", role: "TEACHER", roles: ["TEACHER"] },
    select: { id: true },
  });
  return { enrollmentId: enr.id, userId: user.id };
}

test.describe("[#03 Pha A] centerId denormalize", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[#03-A1] postMessage set centerId từ Enrollment", async () => {
    const { enrollmentId, userId } = await seedEnrollment();

    const msg = await postMessage({
      enrollmentId,
      authorUserId: userId,
      authorSide: "STAFF",
      body: "Chào phụ huynh",
    });

    const row = await db.conversationMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.centerId).toBe(CS1); // null ⇒ sau flip pha B sẽ bị ẩn nhầm
  });

  test("[#03-A2] postMessage trong transaction cũng set centerId", async () => {
    const { enrollmentId, userId } = await seedEnrollment();

    const msg = await db.$transaction((tx) =>
      postMessage({ enrollmentId, authorUserId: userId, authorSide: "PARENT", body: "Cảm ơn cô", tx }),
    );

    const row = await db.conversationMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.centerId).toBe(CS1);
  });

  test("[#03-A3] CHƯA flip: 3 model vẫn ngoài SCOPED_MODELS", () => {
    // Pha B chỉ được chạy sau khi PROD xác nhận 0 null (xem migration + runbook).
    for (const m of ["ConversationMessage", "ReportCard", "EvaluationRound"]) {
      expect({ model: m, scoped: SCOPED_MODELS.has(m) }).toEqual({ model: m, scoped: false });
    }
  });
});
