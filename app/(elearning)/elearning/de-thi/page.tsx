import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/can";
import { scopedDb } from "@/lib/db-scope";
import { NewExamForm } from "./_components/new-exam-form";

/**
 * EL-14c — DANH SÁCH ĐỀ THI.
 *
 * ⚠️ Đề dựng được, nhưng người học CHƯA thi được — đường làm bài thuộc EL-14d. Nói
 * thẳng điều đó trên màn hình, vì người soạn bỏ công dựng một đề rồi không thấy nó
 * đâu sẽ đi báo lỗi, và họ báo đúng.
 *
 * Cũng vì thế loại bài `QUIZ` VẪN ĐÓNG ở trình soạn khoá: mở nó bây giờ là dựng
 * lại đúng cái bẫy vừa gỡ — người soạn gắn được đề vào bài, khoá xuất bản trót lọt,
 * và người học mở ra thì kẹt.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Đề thi | Sata Robo",
  robots: { index: false, follow: false },
};

export default async function Page() {
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
        <h1 className="text-xl font-bold">Không có quyền xem đề thi</h1>
      </div>
    );
  }

  const db = scopedDb(actor);
  const [cacDe, cacKhoa] = await Promise.all([
    db.trnExam.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        isActive: true,
        passScore: true,
        maxScore: true,
        durationMin: true,
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: [{ isActive: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.trnCourse.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
      take: 200,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Đề thi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dựng đề từ{" "}
          <Link href="/elearning/kho-cau-hoi" className="underline">
            kho câu hỏi
          </Link>
          .
        </p>
        {/* Nói THẲNG phần chưa xong. Người soạn dựng đề rồi không thấy nó đâu sẽ đi
            báo lỗi — và họ báo đúng. */}
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Đề dựng và kích hoạt được, nhưng <strong>người học chưa thi được</strong> —
          đường làm bài thuộc đợt sau. Loại bài “Bài kiểm tra” cũng vì thế còn khoá ở
          trình soạn khoá.
        </p>
      </div>

      <NewExamForm cacKhoa={cacKhoa} />

      {cacDe.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có đề nào.</p>
      ) : (
        <ul className="space-y-2">
          {cacDe.map((d) => (
            <li key={d.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/elearning/de-thi/${d.id}`} className="font-medium underline">
                  {d.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {d.isActive ? "đã kích hoạt" : "nháp"} · {d._count.questions} câu ·{" "}
                  {d.durationMin} phút · đạt {d.passScore}
                  {d.isActive ? `/${d.maxScore}` : ""}
                  {d._count.attempts > 0 ? ` · ${d._count.attempts} lượt thi` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
