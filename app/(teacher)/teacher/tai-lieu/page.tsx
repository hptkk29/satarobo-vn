// app/(teacher)/teacher/tai-lieu/page.tsx — #06 (L6): "Tài liệu giảng dạy" site GV.
//
// MIRROR trang admin app/(admin)/admin/teaching-materials/page.tsx nhưng thu hẹp cho
// site GV: CHỈ lớp được phân công (assignedClassIds) — KHÔNG có nhánh manager/cơ sở.
// Visual port từ mock satarobo-ui-giaovien/src/app/(admin)/materials/page.tsx
// (card bài học + thanh gradient trái + số buổi tròn); data layer viết lại toàn bộ.
//
// 2 mức điều hướng qua searchParams (không cần route động):
//   (a) không tham số → grid lớp GV được phân.
//   (b) ?classId=…   → bài giảng theo khung chương trình (Curriculum) của khoá lớp đó:
//                      tên buổi + tài liệu đính kèm (Document, mở tab mới) + SCORM.
//
// Tôn trọng watermark #14: KHÔNG tạo đường tải / expose fileUrl SCORM thô nào mới —
// SCORM chỉ hiện badge + nút mở trỏ sang viewer site GV /teacher/scorm/play/[id]
// (mirror viewer admin: player tự gate canOpenScorm + blur/watermark). Document thường
// (PDF/ảnh/link) mở trực tiếp fileUrl tab mới — đúng cách admin documents/page.tsx đang mở.
// ⚠️ Câu 46: màn này KHÔNG có dữ liệu HV/PH — select chỉ kéo giáo trình/tài liệu.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, ExternalLink, FileText, Play } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import { isScormEnabled } from "@/lib/flags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";

export const metadata = { title: "Tài liệu giảng dạy | Giáo viên Sata Robo" };

/** Nhãn tiếng Việt cho DocumentType (enum Prisma) — badge loại tài liệu đính kèm. */
const DOC_TYPE_LABEL: Record<string, string> = {
  PDF: "PDF",
  IMAGE: "Ảnh",
  VIDEO: "Video",
  SLIDE: "Slide",
  WORKSHEET: "Phiếu bài tập",
  AUDIO: "Âm thanh",
  OTHER: "Khác",
};

// Select khung CT dùng chung cho 2 nhánh (bản ghim R7-06 / bản ACTIVE của khoá).
const CURRICULUM_SELECT = {
  name: true,
  lessons: {
    where: { archivedAt: null },
    orderBy: { order: "asc" },
    select: { id: true, order: true, title: true, objectives: true },
  },
} as const;

type LessonView = {
  id: string;
  order: number;
  title: string;
  objectives: string[];
  /** Gói bài giảng active của buổi — CHỈ id/name (không fileUrl thô, #14). */
  scorm: { id: string; name: string; sessionId: string | null } | null;
  documents: { id: string; title: string; fileUrl: string; typeLabel: string }[];
};

export default async function TeacherMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate login + role TEACHER

  // Gate CÙNG permission với trang admin teaching-materials (checkPermission chạy
  // v1/v2 shadow). Fail → về home GV ("/" trên host giaovien rewrite thành /teacher).
  if (!(await checkPermission("teaching-materials:view-own-class"))) redirect("/");

  const sp = await searchParams;
  const classId = sp.classId?.trim() || null;

  const actor = await resolveActor(session.user.id);
  // scopedDb ép cách ly cơ sở (Class là SCOPED_MODEL); quyền sở hữu thật do
  // assignedClassIds gác bên dưới.
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (b) Bài giảng + tài liệu của 1 lớp ──────────────────────────────────────
  if (classId) {
    // Guard sở hữu TRƯỚC (chống IDOR — GV truyền classId lạ) rồi mới chạm DB;
    // re-fetch qua scopedDb là lớp double-guard theo cơ sở.
    if (!actor.assignedClassIds.has(classId)) return <NotYours />;

    const cls = await sdb.class.findFirst({
      where: { id: classId, deletedAt: null },
      select: {
        id: true,
        name: true,
        classCode: true,
        courseId: true,
        curriculumId: true,
      },
    });
    if (!cls) return <NotYours />;

    // Khung CT của lớp: ưu tiên bản đã ghim (R7-06); lớp cũ chưa ghim → bản ACTIVE
    // mới nhất của khoá (mirror logic trang admin teaching-materials).
    const curriculum =
      (cls.curriculumId
        ? await sdb.curriculum.findUnique({
            where: { id: cls.curriculumId },
            select: CURRICULUM_SELECT,
          })
        : null) ??
      (await sdb.curriculum.findFirst({
        where: { courseId: cls.courseId, status: "ACTIVE" },
        orderBy: { version: "desc" },
        select: CURRICULUM_SELECT,
      }));

    const curriculumName = curriculum?.name ?? null;
    const lessons = curriculum?.lessons ?? [];
    const lessonIds = lessons.map((l) => l.id);
    const scormOn = isScormEnabled();

    let lessonViews: LessonView[] = [];
    if (lessonIds.length > 0) {
      const [docs, scormPkgs, sessions] = await Promise.all([
        // Tài liệu đính kèm theo buổi — select tối thiểu (không HV/PH, câu 46).
        sdb.document.findMany({
          where: { lessonId: { in: lessonIds } },
          orderBy: { title: "asc" },
          select: { id: true, title: true, fileUrl: true, type: true, lessonId: true },
        }),
        // Gói SCORM đang dùng (PUBLISHED + active) — chỉ khi bật cờ; KHÔNG kéo
        // storagePrefix/launchUrl (không expose đường asset thô, #14).
        scormOn
          ? sdb.scormPackage.findMany({
              where: {
                lessonId: { in: lessonIds },
                isActiveForLesson: true,
                status: "PUBLISHED",
              },
              select: { id: true, name: true, lessonId: true },
            })
          : Promise.resolve([] as { id: string; name: string; lessonId: string }[]),
        // Buổi lớp gắn lesson → cấp sessionId cho player (mirror admin: player gate
        // canOpenScorm theo GV lớp; thiếu session vẫn mở được vì GV được phân lớp).
        scormOn
          ? sdb.classSession.findMany({
              where: { classId: cls.id, lessonId: { in: lessonIds } },
              orderBy: { date: "desc" },
              select: { id: true, lessonId: true },
            })
          : Promise.resolve([] as { id: string; lessonId: string | null }[]),
      ]);

      const docsByLesson = new Map<string, LessonView["documents"]>();
      for (const d of docs) {
        if (!d.lessonId) continue;
        const arr = docsByLesson.get(d.lessonId) ?? [];
        arr.push({
          id: d.id,
          title: d.title,
          fileUrl: d.fileUrl,
          typeLabel: DOC_TYPE_LABEL[d.type] ?? d.type,
        });
        docsByLesson.set(d.lessonId, arr);
      }
      const scormByLesson = new Map(scormPkgs.map((p) => [p.lessonId, p]));
      const sessionByLesson = new Map<string, string>();
      for (const s of sessions) {
        // date desc → giữ buổi mới nhất của mỗi lesson.
        if (s.lessonId && !sessionByLesson.has(s.lessonId)) {
          sessionByLesson.set(s.lessonId, s.id);
        }
      }

      lessonViews = lessons.map((l) => {
        const pkg = scormByLesson.get(l.id) ?? null;
        return {
          id: l.id,
          order: l.order,
          title: l.title,
          objectives: l.objectives,
          scorm: pkg
            ? { id: pkg.id, name: pkg.name, sessionId: sessionByLesson.get(l.id) ?? null }
            : null,
          documents: docsByLesson.get(l.id) ?? [],
        };
      });
    }

    return (
      <div className="space-y-4">
        <BackLink href="?" label="Tài liệu giảng dạy" />
        <PageHeader
          title={`Tài liệu — ${cls.name}`}
          subtitle="Bài giảng theo khung chương trình của khoá — chỉ xem & trình chiếu, không chỉnh sửa."
        />

        <div className="rounded-xl border border-border bg-orange-50 p-4 dark:bg-orange-500/10">
          <div className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            Khung chương trình
          </div>
          <div className="mt-1 flex items-center gap-2 text-lg font-bold text-foreground">
            <BookOpen className="h-5 w-5 text-orange-500 dark:text-orange-400" aria-hidden />
            {curriculumName ?? "Chưa gán khung chương trình"}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {cls.name}
            {cls.classCode ? ` · ${cls.classCode}` : ""} · {lessonViews.length} buổi
          </div>
        </div>

        {!scormOn && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Bài giảng tương tác (SCORM) đang tắt trên hệ thống — phần trình chiếu tạm ẩn.
            Tài liệu đính kèm vẫn xem được.
          </p>
        )}

        {lessonViews.length === 0 ? (
          <EmptyBox
            text={
              curriculumName
                ? "Khung chương trình chưa có buổi học nào."
                : "Lớp chưa gán khung chương trình — liên hệ Đào tạo."
            }
          />
        ) : (
          <ul className="space-y-3">
            {lessonViews.map((l) => (
              <li key={l.id} className="t-card relative overflow-hidden p-4">
                {/* Thanh gradient trái — port visual từ mock materials/page.tsx */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-orange-400 to-orange-600" />
                <div className="space-y-3 pl-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                          {l.order}
                        </span>
                        <h2 className="text-base font-semibold text-foreground">{l.title}</h2>
                      </div>
                      {l.objectives.length > 0 && (
                        <p className="mt-0.5 line-clamp-2 pl-8 text-xs text-muted-foreground">
                          {l.objectives.join(" · ")}
                        </p>
                      )}
                    </div>

                    {/* SCORM: badge + nút mở — trỏ viewer SITE GV /teacher/scorm/play/[id]
                        (mirror viewer admin, player tự gate + watermark #14). Prefix
                        /teacher như nav: chạy đúng cả trên host giaovien (pass-through)
                        lẫn localhost/preview. */}
                    {scormOn && l.scorm && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300"
                        >
                          Bài giảng SCORM
                        </Badge>
                        <a
                          href={
                            l.scorm.sessionId
                              ? `/teacher/scorm/play/${l.scorm.id}?sessionId=${l.scorm.sessionId}`
                              : `/teacher/scorm/play/${l.scorm.id}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          title={l.scorm.name}
                          className="inline-flex items-center gap-1 rounded-md border border-orange-200 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-500/10"
                        >
                          <Play className="h-3.5 w-3.5" aria-hidden /> Mở trình chiếu
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Tài liệu đính kèm (Document) — mở tab mới trực tiếp fileUrl, đúng
                      cách admin documents/page.tsx đang mở (không tạo đường tải mới). */}
                  {l.documents.length > 0 ? (
                    <ul className="space-y-1.5 pl-8">
                      {l.documents.map((d) => (
                        <li key={d.id}>
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex max-w-full items-center gap-2 text-sm text-foreground hover:text-orange-700 dark:hover:text-orange-300"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-orange-500" aria-hidden />
                            <span className="truncate font-medium">{d.title}</span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {d.typeLabel}
                            </Badge>
                            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pl-8 text-xs text-muted-foreground">
                      {scormOn && l.scorm
                        ? "Không có tài liệu đính kèm khác."
                        : "Buổi này chưa có tài liệu."}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── (a) Grid lớp được phân ───────────────────────────────────────────────────
  const classes = classIds.length
    ? await sdb.class.findMany({
        where: { id: { in: classIds }, deletedAt: null },
        select: {
          id: true,
          name: true,
          classCode: true,
          schedule: true,
          course: { select: { name: true } }, // Course là catalog toàn cục (không scoped)
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tài liệu giảng dạy"
        subtitle="Chọn lớp bạn dạy để xem bài giảng theo khung chương trình: slide bài học (SCORM) và tài liệu đính kèm."
      />
      {classes.length === 0 ? (
        <EmptyBox text="Bạn chưa được phân công lớp nào." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host giaovien
            // (clean URL /tai-lieu) LẪN localhost/preview (path thật /teacher/tai-lieu).
            <Link key={c.id} href={`?classId=${c.id}`} className="block">
              <Card className="h-full t-card-hover">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <Badge variant="outline" className="shrink-0">
                      {c.course.name}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">
                    {c.classCode ?? "—"}
                    {c.schedule ? ` · ${c.schedule}` : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <EmptyState icon={FileText} title={text} />;
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="Tài liệu giảng dạy" />
      <EmptyBox text="Lớp không thuộc danh sách lớp bạn phụ trách." />
    </div>
  );
}
