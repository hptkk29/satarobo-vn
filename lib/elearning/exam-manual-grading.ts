import { z } from "zod";
import type { ActionConfig } from "@/lib/actions/factory";
import { ActionError } from "@/lib/actions/factory";
import { tinhDiemLuot, chamMayDuoc } from "@/lib/elearning/exam-grading";
import { ghiXongBaiThi } from "@/lib/elearning/exam-taking";

/**
 * EL-14e — CHẤM TAY phần tự luận.
 *
 * ⚠️ Đây là LỐI RA của trạng thái `PENDING_GRADE`. Không có nó thì mọi lượt thi có
 * câu tự luận treo vĩnh viễn: điểm mãi `null`, bài không bao giờ xong, và người học
 * đứng nguyên tại một bài nghĩa vụ có hạn chót cứng cho tới lúc bị khoá vì quá hạn
 * — không làm gì sai và không có đường nào tự thoát.
 *
 * ⚠️ Chấm TRỌN một lượt trong MỘT lần, không chấm dở dang. Chấm từng câu rồi để đó
 * là đẻ ra một trạng thái thứ ba ("đã chấm một nửa") mà không cột nào mô tả được,
 * và không ai biết lượt đó còn chờ ai.
 */

export const chamLuotThiSchema = z
  .object({
    attemptId: z.string().min(1),
    /** Điểm cho từng câu chấm tay. Phải phủ ĐỦ các câu còn thiếu điểm. */
    diem: z
      .array(
        z.object({
          examQuestionId: z.string().min(1),
          score: z.number().int().min(0).max(1000),
          note: z.union([z.null(), z.string().trim().max(2000)]).optional(),
        }),
      )
      .min(1)
      .max(200),
    /** Nhận xét chung cho cả lượt. */
    feedback: z.union([z.null(), z.string().trim().max(4000)]).optional(),
  })
  .strict();

export type ChamLuotThiInput = z.infer<typeof chamLuotThiSchema>;

export type KetQuaCham = { totalScore: number; passed: boolean };

export const cauHinhChamLuotThi: ActionConfig<ChamLuotThiInput, KetQuaCham> = {
  name: "chamLuotThi",
  permission: "elearning:exam:grade",
  module: "elearning",
  entityType: "TrnExamAttempt",
  auditAction: "UPDATE",
  schema: chamLuotThiSchema,
  handler: async ({ db, actor, input }) => {
    // Lượt thi đọc QUA `scopedDb` — chính lượt đọc đó là cổng cách ly. Chấm bài của
    // cơ sở khác là can thiệp vào hồ sơ nhân sự của họ, và không ai ở đó biết.
    const luot = await db.trnExamAttempt.findFirst({
      where: { id: input.attemptId },
      select: {
        id: true,
        examId: true,
        userId: true,
        enrollmentId: true,
        status: true,
        attemptNo: true,
        exam: { select: { passScore: true } },
      },
    });
    if (!luot) throw new ActionError("NOT_FOUND", "Không tìm thấy lượt thi");

    // ⚠️ CHỈ chấm lượt đang chờ. Chấm lại một lượt đã đóng là đổi một con số đã nằm
    // trong hồ sơ nhân sự — việc đó cần một đường riêng có lý do và có dấu vết,
    // không phải cùng nút với lần chấm đầu.
    if (luot.status !== "PENDING_GRADE") {
      throw new ActionError(
        "LUOT_KHONG_CHO_CHAM",
        luot.status === "GRADED"
          ? "Lượt này đã chấm rồi — sửa điểm đã chấm cần một đường riêng"
          : "Lượt này chưa nộp",
      );
    }

    const cacCau = await db.trnExamQuestion.findMany({
      where: { examId: luot.examId },
      select: { id: true, points: true, question: { select: { type: true } } },
    });
    const diemToiDa = new Map(cacCau.map((c) => [c.id, c.points]));
    const loaiCua = new Map(cacCau.map((c) => [c.id, c.question.type]));

    const traLoi = await db.trnExamAnswer.findMany({
      where: { attemptId: luot.id },
      select: { examQuestionId: true, score: true },
    });
    const diemHienCo = new Map(traLoi.map((a) => [a.examQuestionId, a.score]));

    // ── Kiểm đầu vào TRƯỚC khi ghi ──────────────────────────────────────────
    for (const d of input.diem) {
      const toiDa = diemToiDa.get(d.examQuestionId);
      if (toiDa == null) {
        throw new ActionError(
          "CAU_NGOAI_DE",
          "Có câu không thuộc đề của lượt thi này",
          "diem",
        );
      }
      // ⚠️ Chặn điểm VƯỢT thang của câu. Không chặn thì một lỗi gõ phím đẩy tổng
      // điểm vượt `maxScore`, và người trượt thật bỗng "đạt" — trên một con số đi
      // vào hồ sơ nhân sự.
      if (d.score > toiDa) {
        throw new ActionError(
          "DIEM_VUOT_THANG",
          `Câu này tối đa ${toiDa} điểm`,
          "diem",
        );
      }
      const loai = loaiCua.get(d.examQuestionId)!;
      // Câu chấm MÁY đã có điểm; cho người chấm sửa là mở một đường ghi đè im lặng
      // lên kết quả máy, và hai lượt cùng đề sẽ được chấm bằng hai thang.
      if (chamMayDuoc(loai)) {
        throw new ActionError(
          "CAU_DA_CHAM_MAY",
          "Câu trắc nghiệm do hệ thống chấm — không sửa điểm ở đây",
          "diem",
        );
      }
    }

    // ── Phải phủ ĐỦ câu còn thiếu điểm ──────────────────────────────────────
    const dangCho = cacCau
      .filter((c) => !chamMayDuoc(c.question.type))
      .filter((c) => diemHienCo.get(c.id) == null)
      .map((c) => c.id);
    const daNhap = new Set(input.diem.map((d) => d.examQuestionId));
    const conThieu = dangCho.filter((id) => !daNhap.has(id));
    if (conThieu.length > 0) {
      // Chấm dở dang là đẻ một trạng thái thứ ba mà không cột nào mô tả được, và
      // không ai biết lượt đó còn chờ ai.
      throw new ActionError(
        "CHUA_CHAM_DU",
        `Còn ${conThieu.length} câu chưa cho điểm — chấm đủ rồi mới chốt được`,
        "diem",
      );
    }

    const tong = await db.$transaction(async (t) => {
      for (const d of input.diem) {
        await t.trnExamAnswer.upsert({
          where: {
            attemptId_examQuestionId: {
              attemptId: luot.id,
              examQuestionId: d.examQuestionId,
            },
          },
          update: {
            score: d.score,
            // `isCorrect` cho câu tự luận nghĩa là "đạt điểm tối đa" — không phải
            // một khái niệm đúng/sai thật. Ghi để báo cáo đọc được cùng một cột.
            isCorrect: d.score >= (diemToiDa.get(d.examQuestionId) ?? 0),
            graderNote: d.note ?? null,
          },
          create: {
            attemptId: luot.id,
            examQuestionId: d.examQuestionId,
            score: d.score,
            isCorrect: d.score >= (diemToiDa.get(d.examQuestionId) ?? 0),
            graderNote: d.note ?? null,
          },
        });
      }

      // Tính lại TRÊN TOÀN BỘ câu của đề, không chỉ phần vừa chấm.
      const sau = await t.trnExamAnswer.findMany({
        where: { attemptId: luot.id },
        select: { examQuestionId: true, score: true },
      });
      const diemSau = new Map(sau.map((a) => [a.examQuestionId, a.score]));
      const ket = tinhDiemLuot({
        // Câu KHÔNG có dòng trả lời nào (người học bỏ trống) tính 0, không tính là
        // chưa chấm — nếu không thì một câu bỏ trống giữ lượt ở `PENDING_GRADE`
        // mãi mãi.
        cacCau: cacCau.map((c) => ({ diem: diemSau.get(c.id) ?? 0 })),
        passScore: luot.exam.passScore,
      });

      await t.trnExamAttempt.update({
        where: { id: luot.id },
        data: {
          status: "GRADED",
          gradedAt: new Date(),
          gradedByUserId: actor.userId,
          totalScore: ket.totalScore,
          passed: ket.passed,
          feedback: input.feedback ?? null,
        },
      });
      return ket;
    });

    // Đạt thì bài học lên DONE — cùng đường với lượt chấm máy, không chép lại.
    if (tong.passed === true && luot.enrollmentId) {
      const gd = await db.trnEnrollment.findFirst({
        where: { id: luot.enrollmentId },
        select: { courseId: true },
      });
      if (gd) {
        await ghiXongBaiThi(db, {
          enrollmentId: luot.enrollmentId,
          userId: luot.userId,
          examId: luot.examId,
          courseId: gd.courseId,
          now: new Date(),
        });
      }
    }

    return {
      entityId: luot.id,
      data: { totalScore: tong.totalScore ?? 0, passed: tong.passed ?? false },
      oldValues: { status: "PENDING_GRADE", totalScore: null },
      newValues: {
        status: "GRADED",
        attemptNo: luot.attemptNo,
        totalScore: tong.totalScore,
        passed: tong.passed,
        // KHÔNG ghi `feedback` hay `note` vào audit: chúng là nhận xét về bài làm
        // của một người, và nhật ký audit đọc được rộng hơn màn chấm.
      },
    };
  },
};
