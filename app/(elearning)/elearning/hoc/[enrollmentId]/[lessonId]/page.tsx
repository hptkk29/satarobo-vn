import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { checkContentAccess } from "@/lib/elearning/content-gate";
import { getPolicyAcceptance } from "@/lib/elearning/policy-acceptance";
import { demoteH1 } from "@/lib/elearning/reading";
import { ReadingTracker } from "../../_components/reading-tracker";

/**
 * EL-04 — TRANG ĐỌC MỘT BÀI.
 *
 * ⚠️ Trang này KHÔNG trả một byte nội dung nào trước khi qua đủ chuỗi cổng ở
 * server. Lọc ở client là trang trí: nội dung đã nằm trong HTML thì mở DevTools
 * là đọc được, không cần lý do, không để lại dòng audit nào.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Học bài | Sata Robo",
  robots: { index: false, follow: false },
};

/** Màn từ chối dùng chung — cùng một hình dạng cho mọi lý do. */
function TuChoi({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg border border-border px-4 py-2 text-sm"
      >
        Về trang chủ khu đào tạo
      </Link>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ enrollmentId: string; lessonId: string }>;
}) {
  const { enrollmentId, lessonId } = await params;
  const session = await auth();
  // Layout của khu đã gác đăng nhập; đây là lớp thứ hai, cố ý không tin lớp trên.
  if (!session?.user?.id) {
    return <TuChoi title="Chưa đăng nhập" detail="Đăng nhập rồi mở lại trang này." />;
  }
  const actor = await resolveActor(session.user.id);
  // Đi qua `scopedDb`, không `@/lib/db` trần — ESLint chặn ở route group này, và
  // chặn đúng: `TrnEnrollment` và `TrnCourse` đều ∈ SCOPED_MODELS nên đọc trần là
  // bỏ qua cách ly cơ sở. `TrnLessonProgress` không có cột đơn vị nên đi qua
  // nguyên vẹn — cách ly của nó đến từ `enrollmentId` đã lọc ở trên.
  const db = scopedDb(actor);

  // ── Sở hữu: khoá theo CHÍNH userId, không tin id trên URL ──────────────────
  const enrollment = await db.trnEnrollment.findFirst({
    where: { id: enrollmentId, userId: session.user.id },
    select: { id: true, courseId: true, status: true },
  });
  // "Không tồn tại" và "không phải của mình" trả CÙNG một màn: phân biệt là nói
  // cho người dò biết id nào có thật.
  if (!enrollment || enrollment.status === "REVOKED") {
    return (
      <TuChoi
        title="Không tìm thấy bài học"
        detail="Lượt học này không tồn tại hoặc không thuộc về bạn."
      />
    );
  }

  // ── Bài phải thuộc khoá của lượt này ──────────────────────────────────────
  const lesson = await db.trnLesson.findFirst({
    where: {
      id: lessonId,
      deletedAt: null,
      module: { courseId: enrollment.courseId },
    },
    select: {
      id: true,
      title: true,
      kind: true,
      contentMd: true,
      minReadSeconds: true,
      module: { select: { title: true, course: { select: { title: true } } } },
    },
  });
  if (!lesson) {
    return (
      <TuChoi
        title="Không tìm thấy bài học"
        detail="Lượt học này không tồn tại hoặc không thuộc về bạn."
      />
    );
  }

  // ── Cổng nội dung ─────────────────────────────────────────────────────────
  const course = await db.trnCourse.findUnique({
    where: { id: enrollment.courseId },
    select: {
      id: true,
      visibility: true,
      selfEnrollEnabled: true,
      securityLevel: true,
      versions: { where: { status: "PUBLISHED" }, select: { id: true }, take: 1 },
    },
  });
  const tuChoi =
    course == null
      ? { code: "NOT_FOUND", message: "Không tìm thấy khoá học" }
      : checkContentAccess({
          actor,
          course: {
            id: course.id,
            visibility: course.visibility,
            selfEnrollEnabled: course.selfEnrollEnabled,
            securityLevel: course.securityLevel,
            hasPublishedVersion: course.versions.length > 0,
          },
          hasEnrollment: true,
        });
  if (tuChoi) {
    return <TuChoi title="Chưa mở được bài này" detail={tuChoi.message} />;
  }

  // ── Chính sách: chưa xác nhận thì KHÔNG hiện nội dung ─────────────────────
  // Cổng đường GHI đã có ở service, nhưng nếu vẫn hiện nội dung ở đây thì người
  // chưa đồng ý vẫn đọc được — chỉ là không được ghi nhận. Đó là thu nửa vời:
  // họ mất công đọc mà hệ thống coi như chưa học.
  const policy = await getPolicyAcceptance(session.user.id);
  if (!policy.accepted) {
    return (
      <TuChoi
        title="Cần xác nhận trước khi bắt đầu"
        detail="Vào mục Dữ liệu của tôi để xem hệ thống ghi nhận những gì trong lúc bạn học, rồi xác nhận."
      />
    );
  }

  if (lesson.kind !== "READ") {
    // Các loại bài khác thuộc ticket sau. Nói thẳng thay vì hiện trang trống.
    return (
      <TuChoi
        title="Loại bài này chưa mở"
        detail="Hiện mới hỗ trợ bài dạng đọc. Các loại khác sẽ mở ở đợt sau."
      />
    );
  }

  const progress = await db.trnLessonProgress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
    select: { readSeconds: true, scrollMaxPct: true, verifiedAt: true },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-2 text-xs text-muted-foreground">
        {lesson.module.course.title} · {lesson.module.title}
      </nav>
      {/* `<h1>` của trang là TÊN BÀI. Vì thế nội dung bên dưới hạ `#` xuống `##`
          — vừa giữ đúng thứ bậc tiêu đề cho trình đọc màn hình, vừa tránh bị
          `h1: () => null` của renderer chung nuốt mất. */}
      <h1 className="text-2xl font-bold">{lesson.title}</h1>

      <div className="mt-6">
        <MarkdownRenderer content={demoteH1(lesson.contentMd ?? "")} />
      </div>

      <ReadingTracker
        enrollmentId={enrollment.id}
        lessonId={lesson.id}
        readSecondsBanDau={progress?.readSeconds ?? 0}
        scrollMaxPctBanDau={progress?.scrollMaxPct ?? 0}
        minReadSeconds={lesson.minReadSeconds}
        daXong={progress?.verifiedAt != null}
      />
    </div>
  );
}
