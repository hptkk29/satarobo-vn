import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/can";
import { scopedDb } from "@/lib/db-scope";
import { LessonEditor } from "../_components/lesson-editor";
import { VideoUploader } from "../_components/video-uploader";

/**
 * EL-04 — TRANG SOẠN MỘT BÀI ĐỌC.
 *
 * Gate ở đây là `elearning:content:author` — KHÁC `elearning:lesson:learn`. Người
 * học không được mở trình soạn, và người soạn không cần lượt ghi danh nào.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Soạn bài | Sata Robo",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm">
        Đăng nhập rồi mở lại trang này.
      </div>
    );
  }
  const actor = await resolveActor(session.user.id);

  // Gate ở TRANG, không chỉ ở action: để trang mở được rồi mới báo lỗi lúc bấm
  // Lưu là bắt người ta soạn xong mới biết mình không có quyền.
  if (!can(actor, "elearning:content:author")) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Không có quyền soạn bài</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Việc soạn nội dung thuộc phòng Đào tạo.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-border px-4 py-2 text-sm"
        >
          Về trang chủ khu đào tạo
        </Link>
      </div>
    );
  }

  const db = scopedDb(actor);
  const lesson = await db.trnLesson.findFirst({
    where: { id: lessonId, deletedAt: null },
    select: {
      id: true,
      title: true,
      kind: true,
      contentMd: true,
      videoKey: true,
      durationSec: true,
      module: { select: { title: true, course: { select: { title: true } } } },
    },
  });

  if (!lesson) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm">
        Không tìm thấy bài học.
      </div>
    );
  }
  // EL-10 — bài VIDEO có màn riêng: tải tệp, không có trình soạn Markdown.
  //
  // ⚠️ Mở màn SOẠN cho video KHÔNG có nghĩa là mở màn HỌC — hai chặn RỜI NHAU.
  // (EL-11 đã mở nhánh VIDEO ở trang học, nên nay cả hai đều mở.)
  if (lesson.kind === "VIDEO") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <nav className="mb-3 text-xs text-muted-foreground">
          {lesson.module.course.title} · {lesson.module.title}
        </nav>
        <h1 className="text-xl font-bold">{lesson.title}</h1>
        <div className="mt-4">
          <VideoUploader
            lessonId={lesson.id}
            title={lesson.title}
            videoKeyHienCo={lesson.videoKey}
            durationSecHienCo={lesson.durationSec}
          />
        </div>
      </div>
    );
  }

  if (lesson.kind !== "READ") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm">
        Trình soạn này chỉ dùng cho bài dạng đọc. Bài hiện tại là {lesson.kind}.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav className="mb-3 text-xs text-muted-foreground">
        {lesson.module.course.title} · {lesson.module.title}
      </nav>
      <LessonEditor
        lessonId={lesson.id}
        titleBanDau={lesson.title}
        contentBanDau={lesson.contentMd ?? ""}
      />
    </div>
  );
}
