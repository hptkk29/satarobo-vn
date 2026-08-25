import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/can";
import { scopedDb } from "@/lib/db-scope";
import { ExamBuilder } from "../_components/exam-builder";

/**
 * EL-14c — DỰNG BỘ CÂU CHO MỘT ĐỀ.
 *
 * ⚠️ Đề đọc QUA `scopedDb` — chính lượt đọc đó là cổng cách ly. Đọc bằng `db` trần
 * rồi tự so `centerId` là dựng bản kiểm phạm vi thứ hai, và bản thứ hai sẽ lệch.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dựng đề thi | Sata Robo",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm">
        Đăng nhập rồi mở lại trang này.
      </div>
    );
  }
  const actor = await resolveActor(session.user.id);
  if (!can(actor, "elearning:content:author")) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Không có quyền dựng đề</h1>
      </div>
    );
  }

  const db = scopedDb(actor);
  const { examId } = await params;

  const de = await db.trnExam.findFirst({
    where: { id: examId, deletedAt: null },
    select: {
      id: true,
      title: true,
      isActive: true,
      passScore: true,
      maxScore: true,
      durationMin: true,
      questions: {
        select: {
          id: true,
          points: true,
          question: { select: { stem: true, type: true } },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
  if (!de) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Không tìm thấy đề</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Đề không tồn tại, hoặc thuộc cơ sở khác.
        </p>
      </div>
    );
  }

  // ⚠️ Cần `questionId`, KHÔNG phải `TrnExamQuestion.id`. Hai id này khác nhau, và
  // so nhầm chúng thì bộ lọc luôn cho qua — cả kho hiện ra như thể chưa câu nào
  // được dùng, và người soạn thêm trùng rồi mới nhận lỗi từ khoá duy nhất.
  const dungTrongDe = new Set(
    (
      await db.trnExamQuestion.findMany({
        where: { examId: de.id },
        select: { questionId: true },
      })
    ).map((x) => x.questionId),
  );

  // Kho câu CÒN LẠI, lọc Ở SERVER: gửi cả kho xuống rồi lọc ở client là gửi kèm đề
  // bài của những câu không liên quan gì tới đề này.
  const khoCon = (
    await db.trnQuestion.findMany({
      where: { deletedAt: null },
      select: { id: true, stem: true, type: true, defaultPoints: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    })
  ).filter((q) => !dungTrongDe.has(q.id));

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <nav className="text-xs text-muted-foreground">
        <Link href="/elearning/de-thi" className="underline">
          Đề thi
        </Link>
      </nav>
      <div>
        <h1 className="text-2xl font-bold">{de.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {de.durationMin} phút · {de.isActive ? "đã kích hoạt" : "nháp"}
        </p>
      </div>

      <ExamBuilder
        examId={de.id}
        isActive={de.isActive}
        passScore={de.passScore}
        maxScore={de.maxScore}
        cacCau={de.questions.map((q) => ({
          examQuestionId: q.id,
          stem: q.question.stem,
          type: q.question.type,
          points: q.points,
        }))}
        khoCon={khoCon}
        duocKichHoat={can(actor, "elearning:content:publish")}
      />
    </div>
  );
}
