import type { ScopedDb } from "@/lib/actions/factory";
import { chamMayDuoc } from "@/lib/elearning/exam-grading";

/**
 * EL-14e — HÀNG CHỜ CHẤM TAY.
 *
 * ⚠️ Xếp NGƯỜI CHỜ LÂU NHẤT lên trước, không phải người nộp gần nhất. Đây là bài
 * nghĩa vụ có hạn chót cứng: người nộp sớm mà bị đọc sau cùng là người chịu rủi ro
 * quá hạn cao nhất, dù họ đã làm đúng phần của mình.
 *
 * ⚠️ Đọc QUA `scopedDb` — chính lượt đọc đó là cổng cách ly cơ sở. Đọc bằng `db`
 * trần rồi tự so `centerId` là dựng bản kiểm phạm vi thứ hai, và bản thứ hai sẽ lệch.
 */

export type DongHangCho = {
  attemptId: string;
  tenDe: string;
  tenNguoiHoc: string;
  attemptNo: number;
  nopLuc: Date | null;
  /** Số ngày đã chờ, làm tròn xuống. `null` khi thiếu mốc nộp. */
  soNgayCho: number | null;
};

export async function napHangCho(
  db: ScopedDb,
  opt: { bayGio: Date; take?: number },
): Promise<DongHangCho[]> {
  const luot = await db.trnExamAttempt.findMany({
    where: { status: "PENDING_GRADE" },
    select: {
      id: true,
      userId: true,
      attemptNo: true,
      submittedAt: true,
      exam: { select: { title: true } },
    },
    // Chờ lâu nhất lên đầu. `submittedAt` null (không nên có, nhưng có thể) rơi về
    // cuối chứ không biến mất — một dòng không xếp được vẫn phải nhìn thấy.
    orderBy: { submittedAt: "asc" },
    take: opt.take ?? 200,
  });
  if (luot.length === 0) return [];

  const nguoi = await db.user.findMany({
    where: { id: { in: [...new Set(luot.map((l) => l.userId))] } },
    select: { id: true, name: true, email: true },
  });
  const tenCua = new Map(nguoi.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  return luot.map((l) => ({
    attemptId: l.id,
    tenDe: l.exam.title,
    tenNguoiHoc: tenCua.get(l.userId) ?? l.userId,
    attemptNo: l.attemptNo,
    nopLuc: l.submittedAt,
    soNgayCho:
      l.submittedAt == null
        ? null
        : Math.max(
            0,
            Math.floor(
              (opt.bayGio.getTime() - l.submittedAt.getTime()) / 86_400_000,
            ),
          ),
  }));
}

export type CauDeCham = {
  examQuestionId: string;
  stem: string;
  type: string;
  points: number;
  /** `true` = máy đã chấm, người chấm chỉ đọc. */
  mayCham: boolean;
  baiLam: string;
  score: number | null;
  graderNote: string | null;
};

export type LuotDeCham = {
  attemptId: string;
  tenDe: string;
  tenNguoiHoc: string;
  attemptNo: number;
  nopLuc: Date | null;
  passScore: number;
  maxScore: number;
  cacCau: CauDeCham[];
};

export async function napLuotDeCham(
  db: ScopedDb,
  attemptId: string,
): Promise<LuotDeCham | null> {
  const luot = await db.trnExamAttempt.findFirst({
    where: { id: attemptId, status: "PENDING_GRADE" },
    select: {
      id: true,
      examId: true,
      userId: true,
      attemptNo: true,
      submittedAt: true,
      exam: { select: { title: true, passScore: true, maxScore: true } },
    },
  });
  if (!luot) return null;

  const [cacCau, traLoi, nguoi] = await Promise.all([
    db.trnExamQuestion.findMany({
      where: { examId: luot.examId },
      select: {
        id: true,
        points: true,
        orderIndex: true,
        question: { select: { stem: true, type: true } },
      },
      orderBy: { orderIndex: "asc" },
    }),
    db.trnExamAnswer.findMany({
      where: { attemptId: luot.id },
      select: {
        examQuestionId: true,
        textAnswer: true,
        selectedChoiceIds: true,
        score: true,
        graderNote: true,
      },
    }),
    db.user.findFirst({
      where: { id: luot.userId },
      select: { name: true, email: true },
    }),
  ]);
  const traLoiCua = new Map(traLoi.map((a) => [a.examQuestionId, a]));

  return {
    attemptId: luot.id,
    tenDe: luot.exam.title,
    tenNguoiHoc: nguoi?.name ?? nguoi?.email ?? luot.userId,
    attemptNo: luot.attemptNo,
    nopLuc: luot.submittedAt,
    passScore: luot.exam.passScore,
    maxScore: luot.exam.maxScore,
    cacCau: cacCau.map((c) => {
      const a = traLoiCua.get(c.id);
      const mayCham = chamMayDuoc(c.question.type);
      return {
        examQuestionId: c.id,
        stem: c.question.stem,
        type: c.question.type,
        points: c.points,
        mayCham,
        // Câu KHÔNG có dòng trả lời = người học BỎ TRỐNG. Nói thẳng chữ đó, vì
        // một ô trắng trông y hệt lỗi tải dữ liệu, và người chấm sẽ đi hỏi.
        baiLam: mayCham
          ? (a?.selectedChoiceIds ?? []).join(", ") || "(bỏ trống)"
          : (a?.textAnswer?.trim() ?? "") || "(bỏ trống)",
        score: a?.score ?? null,
        graderNote: a?.graderNote ?? null,
      };
    }),
  };
}
