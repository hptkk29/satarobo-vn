import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { MediaClient } from "./_components/media-client";

export const metadata = { title: "Ảnh lớp học | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "media:view") && !can(session.user, "media:upload")) {
    redirect("/dashboard");
  }
  const canApprove = can(session.user, "media:approve");

  const [rows, classes] = await Promise.all([
    db.classSessionMedia.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { tags: { select: { studentId: true } } },
    }),
    db.class.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, classCode: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

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

  const items = rows.map((m) => ({
    id: m.id,
    fileUrl: m.fileUrl,
    caption: m.caption,
    status: m.status,
    className: classMap.get(m.classId)?.name ?? "(lớp đã xoá)",
    uploadedByName: m.uploadedByName,
    tagNames: m.tags.map((t) => studentMap.get(t.studentId) ?? "?"),
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ảnh lớp học</h1>
        <p className="mt-1 text-sm text-gray-500">
          Giáo viên đăng ảnh → quản lý duyệt → phụ huynh xem ảnh con được gắn thẻ.
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
