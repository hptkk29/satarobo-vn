/**
 * R7-16 — Form builder Eval* + Đánh giá GV (HV) + Khảo sát cơ sở (PH).
 * Postgres LOCAL (.env.test). SKELETON — chưa chạy trong CI (chờ seed helper Eval*).
 *
 * Bao phủ RTM:
 *  C2 — enum 4 loại đóng (schema reject loại thứ 5)
 *  C3 — edit-lock: form có response → formHasResponses true → chặn replaceQuestions
 *  C5 — dedupe: UNIQUE (roundId, enrollmentId, teacherId) + (roundId, parentUserId)
 *  C6 — aggregate ẩn danh dùng lại cho báo cáo R7-17
 *  C8 — validate required / checkbox-min / textbox max (đã có ở lib/eval/eval-logic.test.ts)
 *
 * C1/C4/C7 (UI portal/admin) → Playwright UI, đánh dấu fixme đến khi seed Eval* sẵn sàng.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import { evalQuestionInputSchema } from "../../../lib/eval/forms";
import { formHasResponses, replaceQuestions } from "../../../lib/eval/forms";
import { aggregateRound } from "../../../lib/eval/aggregate";

test.describe("[R7-16] Evaluation & Survey", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[R7-16-C2] enum 4 loại đóng — reject loại thứ 5", () => {
    expect(evalQuestionInputSchema.safeParse({ type: "DROPDOWN", label: "x", required: false }).success).toBe(false);
    expect(evalQuestionInputSchema.safeParse({ type: "STAR_RATING", label: "x", required: true }).success).toBe(true);
  });

  test("[R7-16-C3] edit-lock — form có response thì chặn sửa câu hỏi", async () => {
    const form = await db.evalForm.create({
      data: {
        title: "F1",
        scope: "TEACHER_EVAL",
        status: "ACTIVE",
        questions: { create: [{ type: "STAR_RATING", label: "Sao", required: true, order: 0 }] },
      },
      include: { questions: true },
    });
    const round = await db.evaluationRound.create({
      data: { formId: form.id, name: "Đợt 1", scope: "TEACHER_EVAL", status: "OPEN" },
    });
    expect(await formHasResponses(form.id)).toBe(false);

    await db.evalResponse.create({
      data: {
        roundId: round.id,
        enrollmentId: "enr-1",
        teacherId: "tch-1",
        answers: { create: [{ questionId: form.questions[0]!.id, valueNumber: 5 }] },
      },
    });
    expect(await formHasResponses(form.id)).toBe(true);

    const res = await replaceQuestions(form.id, [{ type: "TEXTBOX", label: "Mới", required: false }]);
    expect(res.ok).toBe(false); // bị chặn (AC2)
  });

  test("[R7-16-C5] dedupe — gửi lần 2 cùng (đợt×enrollment×GV) bị UNIQUE chặn", async () => {
    const form = await db.evalForm.create({
      data: { title: "F", scope: "TEACHER_EVAL", status: "ACTIVE" },
    });
    const round = await db.evaluationRound.create({
      data: { formId: form.id, name: "R", scope: "TEACHER_EVAL", status: "OPEN" },
    });
    await db.evalResponse.create({ data: { roundId: round.id, enrollmentId: "e1", teacherId: "t1" } });
    await expect(
      db.evalResponse.create({ data: { roundId: round.id, enrollmentId: "e1", teacherId: "t1" } }),
    ).rejects.toThrow();
  });

  test("[R7-16-C5b] dedupe CENTER_SURVEY — cùng (đợt×PH) bị chặn", async () => {
    const form = await db.evalForm.create({ data: { title: "S", scope: "CENTER_SURVEY", status: "ACTIVE" } });
    const round = await db.evaluationRound.create({
      data: { formId: form.id, name: "R", scope: "CENTER_SURVEY", centerId: "cs1", status: "OPEN" },
    });
    await db.evalResponse.create({ data: { roundId: round.id, parentUserId: "p1" } });
    await expect(
      db.evalResponse.create({ data: { roundId: round.id, parentUserId: "p1" } }),
    ).rejects.toThrow();
  });

  test("[R7-16-C6] aggregateRound — tổng hợp ẩn danh (avg sao) cho báo cáo R7-17", async () => {
    const form = await db.evalForm.create({
      data: {
        title: "F",
        scope: "TEACHER_EVAL",
        status: "ACTIVE",
        questions: { create: [{ type: "STAR_RATING", label: "Sao", required: true, order: 0 }] },
      },
      include: { questions: true },
    });
    const round = await db.evaluationRound.create({
      data: { formId: form.id, name: "R", scope: "TEACHER_EVAL", status: "OPEN" },
    });
    const qid = form.questions[0]!.id;
    await db.evalResponse.create({
      data: { roundId: round.id, enrollmentId: "e1", teacherId: "t1", answers: { create: [{ questionId: qid, valueNumber: 5 }] } },
    });
    await db.evalResponse.create({
      data: { roundId: round.id, enrollmentId: "e2", teacherId: "t1", answers: { create: [{ questionId: qid, valueNumber: 3 }] } },
    });

    const agg = await aggregateRound(round.id, { teacherId: "t1" });
    expect(agg.responseCount).toBe(2);
    const star = agg.questions[0];
    expect(star?.type).toBe("STAR_RATING");
    if (star?.type === "STAR_RATING") expect(star.avg).toBe(4);
  });

  // UI flows — bật khi seed Eval* + parent/student fixtures sẵn sàng.
  test.fixme("[R7-16-C1] dựng form 4 loại → render đúng portal (sao=emoji cho HV)", async () => {});
  test.fixme("[R7-16-C4] profile HV chỉ thấy GV đã/đang dạy; GV lạ không có", async () => {});
  test.fixme("[R7-16-C6-ui] GV không quyền không thấy; GV aggregate ẩn danh; QL chi tiết", async () => {});
  test.fixme("[R7-16-C7] PH cơ sở khác mở khảo sát round CS1 → không thấy", async () => {});
});
