import { auth } from "@/lib/auth";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";

function formatDate(date: Date): string {
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function ReserveHistorySection({
  studentId,
}: {
  studentId: string;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const reserves = await sdb.studentReserve.findMany({
    where: { studentId },
    include: {
      enrollment: { select: { class: { select: { name: true } } } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  if (reserves.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Lịch sử bảo lưu
        </h3>
        <p className="mt-3 text-sm text-gray-500">
          Chưa có lần bảo lưu nào.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
        Lịch sử bảo lưu ({reserves.length})
      </h3>
      <div className="space-y-2">
        {reserves.map((r) => (
          <div
            key={r.id}
            className="rounded-r-lg border-l-4 border-yellow-300 bg-yellow-50/40 px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              {r.isActive ? (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                  Đang bảo lưu
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  Đã kết thúc
                </span>
              )}
              <span className="text-xs text-gray-700">
                {r.enrollment
                  ? `Lớp ${r.enrollment.class.name}`
                  : "Toàn bộ lớp đang học"}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-700">
              Từ <strong>{formatDate(r.startedAt)}</strong>
              {r.expectedEndAt && (
                <> → dự kiến {formatDate(r.expectedEndAt)}</>
              )}
              {r.endedAt && (
                <> → kết thúc thực tế {formatDate(r.endedAt)}</>
              )}
            </div>
            <div className="mt-1 text-xs italic text-gray-700">
              Lý do: {r.reason}
            </div>
            {r.endReason && (
              <div className="mt-0.5 text-xs italic text-gray-600">
                Ghi chú kết thúc: {r.endReason}
              </div>
            )}
            <div className="mt-1 text-xs text-gray-500">
              Bởi {r.createdByName}
              {r.endedByName && ` · Kết thúc bởi ${r.endedByName}`}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
