// app/(teacher)/teacher/kho-bai-tap/page.tsx — "Kho bài tập của tôi" (site GV, L6).
//
// Đề trắc nghiệm/tự luận GV TỰ SOẠN — list AssignmentTemplate where createdById = ownerId
// (own-scope, xem _owner.ts). Mỗi đề: hình thức (kind) + số câu + thang điểm + Xem trước
// + Xoá (chỉ đề của mình). Câu 46: đây là SOẠN NỘI DUNG — không chạm dữ liệu HV/PH.
import { NotebookPen } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { KhoList } from "./_components/kho-list";
import { CreateTemplateLauncher } from "./_components/create-template-launcher";
import { resolveTemplateOwnerId } from "./_owner";
import type { KhoTemplate } from "./_types";

export const metadata = { title: "Kho bài tập | Giáo viên Sata Robo" };

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

export default async function KhoBaiTapPage() {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const canAuthor = await checkPermission("assignments:author-own");

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const { ownerId } = await resolveTemplateOwnerId(sdb, session.user.id);

  // AssignmentTemplate ∉ SCOPED_MODELS → pass-through; own-scope qua createdById.
  const templates = await sdb.assignmentTemplate.findMany({
    where: { createdById: ownerId },
    select: {
      id: true,
      title: true,
      description: true,
      instructions: true,
      kind: true,
      totalPoints: true,
      createdAt: true,
      _count: { select: { templateQuestions: true } },
      templateQuestions: {
        orderBy: { order: "asc" },
        select: {
          question: {
            select: {
              id: true,
              type: true,
              text: true,
              points: true,
              correctAnswer: true,
              choices: {
                orderBy: { order: "asc" },
                select: { id: true, text: true, isCorrect: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const rows: KhoTemplate[] = templates.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    instructions: t.instructions,
    kind: t.kind,
    totalPoints: t.totalPoints,
    questionCount: t._count.templateQuestions,
    createdAt: dateFmt.format(t.createdAt),
    questions: t.templateQuestions.map((tq) => ({
      id: tq.question.id,
      type: tq.question.type,
      text: tq.question.text,
      points: tq.question.points,
      correctAnswer: tq.question.correctAnswer,
      choices: tq.question.choices.map((c) => ({
        id: c.id,
        text: c.text,
        isCorrect: c.isCorrect,
      })),
    })),
  }));

  return (
    <div>
      <PageHeader
        title="Kho bài tập của tôi"
        subtitle="Đề trắc nghiệm & tự luận bạn tự soạn. Giao lại cho lớp mình phụ trách ở trang Bài tập."
        actions={canAuthor ? <CreateTemplateLauncher /> : undefined}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Bạn chưa có đề nào trong kho."
          description={
            canAuthor
              ? 'Bấm "Tạo bài tập" để soạn đề trắc nghiệm hoặc tự luận đầu tiên.'
              : "Bạn không có quyền soạn bài."
          }
        />
      ) : (
        <KhoList rows={rows} />
      )}
    </div>
  );
}
