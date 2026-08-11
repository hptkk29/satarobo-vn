import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  checkAnyPermission,
  checkPermission,
} from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { resolveMediaUrl } from "@/lib/storage/signed-url";
import { MediaClient } from "./_components/media-client";
import { PageHelp } from "@/components/admin/ui/page-help";

export const metadata = { title: "Ảnh lớp học | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkAnyPermission(PAGE_GATES["/media"]))) {
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

  // ClassSessionMedia ∉ SCOPED_MODELS → cách ly qua classIds đã scope ở trên (sdb.class).
  // DRAFT (kho GV) fetch RIÊNG — vài lô upload 40 ảnh là DRAFT chiếm trọn cửa sổ
  // 100 row, đẩy PENDING cũ khỏi hàng duyệt mà không ai hay (review 02/08).
  const [mainRows, draftRows] = classIds.length
    ? await Promise.all([
        sdb.classSessionMedia.findMany({
          where: { classId: { in: classIds }, status: { not: "DRAFT" } },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { tags: { select: { studentId: true } } },
        }),
        sdb.classSessionMedia.findMany({
          where: { classId: { in: classIds }, status: "DRAFT" },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { tags: { select: { studentId: true } } },
        }),
      ])
    : [[], []];
  const rows = [...mainRows, ...draftRows];

  // Resolve class + tagged student names.
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const studentIds = [
    ...new Set(rows.flatMap((r) => r.tags.map((t) => t.studentId))),
  ];
  const students = studentIds.length
    ? await sdb.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true },
      })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s.name]));

  // Signed URL khi bật flag MEDIA_SIGNED_URL (OFF → fileUrl trần).
  const displayUrls = await Promise.all(
    rows.map((m) => resolveMediaUrl(m.fileUrl)),
  );

  const items = rows.map((m, i) => ({
    id: m.id,
    fileUrl: displayUrls[i] ?? m.fileUrl,
    caption: m.caption,
    status: m.status,
    className: classMap.get(m.classId)?.name ?? "(lớp đã xoá)",
    uploadedByName: m.uploadedByName,
    uploadedById: m.uploadedById,
    tagNames: m.tags.map((t) => studentMap.get(t.studentId) ?? "?"),
    takenAt: m.takenAt?.toISOString() ?? null,
    hasSession: m.classSessionId != null,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Ảnh lớp học</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Duyệt ảnh lớp học trước khi phụ huynh xem
        </p>
      </div>

      <PageHelp>
        <p>
          Giáo viên / Sale phụ trách đăng ảnh theo buổi → quản lý duyệt → phụ
          huynh xem ảnh con được gắn thẻ. Marketing / Giáo vụ góp ảnh vào{" "}
          <strong>kho</strong> của lớp; giáo viên chọn ảnh trong kho rồi gửi phụ
          huynh.
        </p>
      </PageHelp>
      <MediaClient
        items={items}
        classes={classes.map((c) => ({
          id: c.id,
          label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
        }))}
        canApprove={canApprove}
        currentUserId={session.user.id}
      />
    </div>
  );
}
