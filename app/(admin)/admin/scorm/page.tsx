import { redirect, notFound } from "next/navigation";
import { Package } from "lucide-react";
import { auth } from "@/lib/auth";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { isScormEnabled } from "@/lib/flags";
import { ScormManager, type LessonOption, type PackageRow } from "./_components/scorm-manager";

export const metadata = { title: "SCORM / Học liệu tương tác | Admin" };
export const dynamic = "force-dynamic";

export default async function ScormPage() {
  if (!isScormEnabled()) notFound();
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "training:manage")) redirect("/dashboard");

  // ScormPackage/Lesson không center-scoped → scopedDb pass-through (đúng rule R6-F1).
  const sdb = scopedDb(await resolveActor(session.user.id));
  const [packages, lessons, attempts] = await Promise.all([
    sdb.scormPackage.findMany({
      orderBy: [{ lessonId: "asc" }, { version: "desc" }],
      select: {
        id: true,
        name: true,
        status: true,
        version: true,
        scormVersion: true,
        isActiveForLesson: true,
        sizeBytes: true,
        fileCount: true,
        error: true,
        createdAt: true,
        lessonId: true,
        lesson: { select: { title: true, order: true, curriculum: { select: { name: true } } } },
      },
    }),
    sdb.lesson.findMany({
      where: { archivedAt: null },
      orderBy: [{ curriculumId: "asc" }, { order: "asc" }],
      select: { id: true, title: true, order: true, curriculum: { select: { name: true } } },
    }),
    // Theo dõi GV đã giảng (delivery) — learner = GV, KHÔNG đụng HV. desc để lấy gần nhất.
    sdb.scormAttempt.findMany({
      select: { packageId: true, userId: true, completion: true, lastAccessedAt: true },
      orderBy: { lastAccessedAt: "desc" },
    }),
  ]);

  // Gộp delivery theo gói: số GV đã giảng (distinct) + completion gần nhất.
  const COMPLETION_VI: Record<string, string> = {
    NOT_ATTEMPTED: "Chưa mở",
    INCOMPLETE: "Đang giảng dở",
    COMPLETED: "Đã hoàn tất",
    PASSED: "Đạt",
    FAILED: "Chưa đạt",
    BROWSED: "Đã xem qua",
  };
  const deliveryByPkg = new Map<string, { teachers: Set<string>; latest: string }>();
  for (const a of attempts) {
    const d = deliveryByPkg.get(a.packageId) ?? { teachers: new Set(), latest: a.completion };
    d.teachers.add(a.userId); // attempts đã sort desc → latest là phần tử đầu gặp
    deliveryByPkg.set(a.packageId, d);
  }

  const rows: PackageRow[] = packages.map((p) => {
    const d = deliveryByPkg.get(p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      version: p.version,
      scormVersion: p.scormVersion,
      isActiveForLesson: p.isActiveForLesson,
      sizeBytes: p.sizeBytes,
      fileCount: p.fileCount,
      error: p.error,
      lessonId: p.lessonId,
      lessonLabel: `${p.lesson.curriculum.name} · Buổi ${p.lesson.order}: ${p.lesson.title}`,
      deliveredTeacherCount: d ? d.teachers.size : 0,
      deliveryStatusLabel: d ? COMPLETION_VI[d.latest] ?? d.latest : null,
    };
  });

  const lessonOptions: LessonOption[] = lessons.map((l) => ({
    id: l.id,
    label: `${l.curriculum.name} · Buổi ${l.order}: ${l.title}`,
  }));

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Package className="h-6 w-6 text-orange-500" /> SCORM / Học liệu tương tác
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Tải gói SCORM (.zip) theo buổi học, xem thử, phát hành và đặt bản đang dùng. Bản mới
          không xoá bản cũ — mỗi buổi chỉ 1 bản đang dùng.
        </p>
      </div>

      <ScormManager packages={rows} lessons={lessonOptions} />
    </div>
  );
}
