/**
 * FL4-02 — PORTAL đọc phiếu đánh giá BUỔI HỌC (SESSION_EVAL) cho phụ huynh.
 * Postgres LOCAL (.env.test). SKELETON — KHÔNG chạy trong CI (chờ chốt seed Eval* FL).
 *
 * Bao phủ (tầng helper DB — page cần auth/cookie, test riêng ở manual):
 *  C1 — getStudentSessionEvals trả phiếu của ĐÚNG con (đợt SESSION_EVAL × buổi × HS),
 *       render đúng loại câu hỏi; con khác KHÔNG lẫn (không lộ studentId / cách ly con).
 *  C2 — ẢNH buổi gate theo StudentConsent CLASS_MEDIA: chưa GRANTED → map rỗng;
 *       GRANTED → trả ảnh APPROVED gắn thẻ con hoặc isClassWide; ảnh HS khác ẩn (C6.2).
 *  C3 — thu hồi consent → ảnh ẩn ngay.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import {
  getStudentSessionEvals,
  getSessionMediaForStudent,
} from "../../../lib/eval/session-eval-portal";
import { grantMediaConsent, revokeMediaConsent } from "../../../lib/lms/media-consent";

async function seedCenter(id: string) {
  await db.center.upsert({
    where: { id },
    create: { id, name: id, code: id, slug: id.toLowerCase(), address: "test" },
    update: {},
  });
}

async function seedFormRound() {
  const form = await db.evalForm.create({
    data: {
      title: "Phiếu đánh giá buổi học",
      scope: "SESSION_EVAL",
      status: "ACTIVE",
      questions: {
        create: [
          { type: "STAR_RATING", label: "Mức độ tập trung", required: true, order: 0 },
          {
            type: "RADIO",
            label: "Thái độ",
            options: ["Tích cực", "Bình thường"],
            required: false,
            order: 1,
          },
          { type: "TEXTBOX", label: "Nhận xét", required: false, order: 2 },
        ],
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  const round = await db.evaluationRound.create({
    data: { formId: form.id, name: "Đợt buổi học", scope: "SESSION_EVAL", status: "OPEN" },
  });
  return { form, round };
}

async function seedClassSession(centerId: string) {
  const course = await db.course.create({ data: { name: "Khoá Sata 3", slug: `sata3-${Date.now()}` } });
  const cls = await db.class.create({
    data: { name: "Lớp Sata 3 A", classCode: "S3A", courseId: course.id, centerId, status: "ACTIVE" },
    select: { id: true },
  });
  const sess = await db.classSession.create({
    data: { classId: cls.id, date: new Date(), status: "SCHEDULED" },
    select: { id: true },
  });
  const con = await db.student.create({ data: { name: "Con A", centerId }, select: { id: true } });
  const other = await db.student.create({ data: { name: "HS khác", centerId }, select: { id: true } });
  return { cls, sess, con, other };
}

test.describe("[FL4-02] Portal SESSION_EVAL", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[FL4-02-C1] getStudentSessionEvals chỉ trả phiếu của con + render đúng loại", async () => {
    await seedCenter("CS1");
    const { form, round } = await seedFormRound();
    const { sess, con, other } = await seedClassSession("CS1");
    const [qStar, qRadio, qText] = form.questions;

    await db.evalResponse.create({
      data: {
        roundId: round.id,
        classSessionId: sess.id,
        studentId: con.id,
        answers: {
          create: [
            { questionId: qStar!.id, valueNumber: 4 },
            { questionId: qRadio!.id, valueOptions: ["Tích cực"] },
            { questionId: qText!.id, valueText: "Tiến bộ rõ" },
          ],
        },
      },
    });
    // Phiếu của HS khác — KHÔNG được lẫn vào kết quả của con.
    await db.evalResponse.create({
      data: {
        roundId: round.id,
        classSessionId: sess.id,
        studentId: other.id,
        answers: { create: [{ questionId: qStar!.id, valueNumber: 2 }] },
      },
    });

    const cards = await getStudentSessionEvals(con.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.classSessionId).toBe(sess.id);
    expect(cards[0]!.answers.map((a) => a.type)).toEqual(["STAR_RATING", "RADIO", "TEXTBOX"]);
    expect(cards[0]!.answers[0]!.stars).toBe(4);
    expect(cards[0]!.classCode).toBe("S3A");
  });

  test("[FL4-02-C2] ảnh buổi gate theo consent: chưa GRANTED → rỗng; GRANTED → hiện", async () => {
    await seedCenter("CS1");
    const { sess, con } = await seedClassSession("CS1");
    await db.classSessionMedia.create({
      data: {
        classId: (await db.classSession.findUniqueOrThrow({ where: { id: sess.id }, select: { classId: true } })).classId,
        classSessionId: sess.id,
        fileUrl: "https://example/img.jpg",
        status: "APPROVED",
        isClassWide: true,
      },
    });

    // Chưa consent → không ảnh.
    expect((await getSessionMediaForStudent(con.id, [sess.id])).size).toBe(0);

    // GRANTED → có ảnh class-wide.
    await grantMediaConsent(con.id);
    const granted = await getSessionMediaForStudent(con.id, [sess.id]);
    expect(granted.get(sess.id)?.length).toBe(1);

    // Thu hồi → ẩn ngay (C3).
    await revokeMediaConsent(con.id);
    expect((await getSessionMediaForStudent(con.id, [sess.id])).size).toBe(0);
  });
});
