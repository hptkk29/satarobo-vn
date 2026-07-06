import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { resolveMediaUrl } from "@/lib/storage/signed-url";
import { MediaClient } from "./_components/media-client";

export const metadata = { title: "Ảnh lớp học | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    !(await checkPermission("media:view")) &&
    !(await checkPermission("media:upload"))
  ) {
    redirect("/dashboard");
  }
  const canApprove = await checkPermission("media:approve");

  // Cách ly cơ sở: chỉ thấy lớp + ảnh thuộc cơ sở trong scope (SUPER_ADMIN/HO bypass).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const classes = await sdb.class.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, classCode: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const classIds = classes.map((c) => c.id);

  const rows = classIds.length
    ? await db.classSessionMedia.findMany({
        where: { classId: { in: classIds } },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { tags: { select: { studentId: true } } },
      })
    : [];

  // Resolve class + tagged student names.
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const studentIds = [...new Set(rows.flatMap((r) => r.tags.map((t) => t.studentId)))];
  const students = studentIds.length
    ? await db.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true },
      })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s.name]));

  // Signed URL khi bật flag MEDIA_SIGNED_URL (OFF → fileUrl trần).
  const displayUrls = await Promise.all(rows.map((m) => resolveMediaUrl(m.fileUrl)));

  const items = rows.map((m, i) => ({
    id: m.id,
    fileUrl: displayUrls[i] ?? m.fileUrl,
    caption: m.caption,
    status: m.status,
    className: classMap.get(m.classId)?.name ?? "(lớp đã xoá)",
    uploadedByName: m.uploadedByName,
    tagNames: m.tags.map((t) => studentMap.get(t.studentId) ?? "?"),
    takenAt: m.takenAt?.toISOString() ?? null,
    hasSession: m.classSessionId != null,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ảnh lớp học</h1>
        <p className="mt-1 text-sm text-gray-500">
          Giáo viên / Sale phụ trách đăng ảnh theo buổi → quản lý duyệt → phụ huynh
          xem ảnh con được gắn thẻ.
        </p>
      </div>
      <MediaClient
        items={items}
        classes={classes.map((c) => ({
          id: c.id,
          label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
        }))}
        canApprove={canApprove}
      />
    </div>
  );
}
