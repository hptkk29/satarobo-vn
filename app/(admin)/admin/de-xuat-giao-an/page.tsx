import Link from "next/link";
import { redirect } from "next/navigation";
import { FileEdit } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { formatDateVN } from "@/lib/format/date";
import {
  LessonChangeRequests,
  type ChangeRequestRow,
} from "../curriculums/_components/lesson-change-requests";

export const metadata = { title: "Đề xuất sửa giáo án | Admin" };
export const dynamic = "force-dynamic";

// BGĐ 31/07 — HỘP THƯ TOÀN CỤC cho đề xuất sửa giáo án của GV.
// Trước đây đề xuất chỉ hiện trong trang sửa GIÁO TRÌNH tương ứng ⇒ Đào tạo phải
// đoán đúng giáo trình mới thấy; GV gửi xong không ai biết. Nay gom 1 chỗ.
export default async function LessonChangeInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Xem hộp thư = người có quyền duyệt đề xuất (SUPER_ADMIN/TRAINING/CENTER_MANAGER).
  const canApproveChange = await checkPermission("lesson-change:approve");
  if (!canApproveChange) redirect("/dashboard?error=unauthorized");

  const { status } = await searchParams;
  const statusFilter =
    status === "ACCEPTED" || status === "REJECTED" ? status : "OPEN";

  // LessonChangeRequest ∉ SCOPED_MODELS (giáo trình dùng chung toàn hệ thống).
  const sdb = scopedDb(await resolveActor(session.user.id));
  const requests = await sdb.lessonChangeRequest.findMany({
    where: { status: statusFilter },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      lesson: {
        select: {
          order: true,
          title: true,
          curriculumId: true,
          curriculum: { select: { id: true, name: true } },
        },
      },
    },
  });

  const requesterIds = [...new Set(requests.map((r) => r.requestedById))];
  const requesters = requesterIds.length
    ? await sdb.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const requesterName = new Map(
    requesters.map((u) => [u.id, u.name ?? u.email ?? "Người dùng"]),
  );

  // Gom theo giáo trình để Đào tạo mở đúng nơi sửa.
  const byCurriculum = new Map<
    string,
    { curriculumId: string; curriculumName: string; rows: ChangeRequestRow[] }
  >();
  for (const r of requests) {
    const cid = r.lesson.curriculumId ?? "—";
    const entry = byCurriculum.get(cid) ?? {
      curriculumId: cid,
      curriculumName: r.lesson.curriculum?.name ?? "Giáo trình",
      rows: [],
    };
    entry.rows.push({
      id: r.id,
      lessonOrder: r.lesson.order,
      lessonTitle: r.lesson.title,
      requestedByName: requesterName.get(r.requestedById) ?? "Giáo viên",
      content: r.content,
      status: r.status,
      response: r.response,
      createdAt: formatDateVN(r.createdAt),
    });
    byCurriculum.set(cid, entry);
  }

  const tabs = [
    { key: "OPEN", label: "Chờ xử lý" },
    { key: "ACCEPTED", label: "Đã chấp nhận" },
    { key: "REJECTED", label: "Đã từ chối" },
  ];

  return (
    <div className="max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <FileEdit className="h-6 w-6 text-primary" /> Đề xuất sửa giáo án
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Đề xuất giáo viên gửi từ trang Lịch dạy — gom theo giáo trình.
        </p>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/de-xuat-giao-an?status=${t.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${ statusFilter === t.key ? "bg-primary text-white" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50" }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có đề xuất nào.
        </p>
      ) : (
        <div className="space-y-4">
          {[...byCurriculum.values()].map((group) => (
            <div key={group.curriculumId} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-700">
                  {group.curriculumName}
                </h2>
                {group.curriculumId !== "—" && (
                  <Link
                    href={`/curriculums/${group.curriculumId}/edit`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Mở giáo trình →
                  </Link>
                )}
              </div>
              <LessonChangeRequests requests={group.rows} canHandle={canApproveChange} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
