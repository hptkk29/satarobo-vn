import Link from "next/link";
import { getPortalContext } from "@/lib/portal/session";
import { db } from "@/lib/db";
import { getThread, markThreadRead } from "@/lib/conversation/service";
import { MessageForm } from "./_components/message-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn | Sata Robo", robots: { index: false } };

const ACTIVE_ENROLLMENT = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

function fmt(d: Date): string {
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PortalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const ctx = await getPortalContext();
  if (!ctx) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
        Vui lòng đăng nhập để xem tin nhắn.
      </p>
    );
  }
  const parentUserId = ctx.parentUserId;
  const params = await searchParams;
  const selectedId = params.e?.trim() || null;

  // Ownership + mark-read PHẢI làm TRƯỚC khi đọc danh sách (để badge phản ánh đúng).
  let selectedOwned = false;
  if (selectedId) {
    const owned = await db.enrollment.findFirst({
      where: { id: selectedId, student: { parentUserId, deletedAt: null } },
      select: { id: true },
    });
    selectedOwned = !!owned;
    if (selectedOwned) await markThreadRead(selectedId, "PARENT");
  }

  // Các enrollment ĐANG HỌC của tất cả các con (mỗi enrollment = 1 luồng).
  const enrollments = await db.enrollment.findMany({
    where: {
      deletedAt: null,
      status: { in: [...ACTIVE_ENROLLMENT] },
      student: { parentUserId, deletedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      student: { select: { name: true } },
      class: { select: { name: true, course: { select: { name: true } } } },
      _count: {
        select: {
          messages: { where: { authorSide: "STAFF", readByParentAt: null } },
        },
      },
    },
  });

  const selected = selectedOwned
    ? enrollments.find((e) => e.id === selectedId) ?? null
    : null;
  const thread = selected ? await getThread(selected.id) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Tin nhắn</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Trao đổi trực tiếp với giáo viên phụ trách lớp của con.
        </p>
      </div>

      {enrollments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
          Hiện chưa có lớp đang học nào để trao đổi.
        </p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Danh sách luồng */}
          <aside className="w-full shrink-0 lg:w-72">
            <ul className="space-y-2">
              {enrollments.map((e) => {
                const active = e.id === selected?.id;
                const unread = e._count.messages;
                return (
                  <li key={e.id}>
                    <Link
                      href={`/portal/tin-nhan?e=${e.id}`}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-sm transition-colors ${
                        active
                          ? "border-orange-400 bg-orange-50"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-neutral-900">
                          {e.student.name}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {e.class.name} · {e.class.course.name}
                        </span>
                      </span>
                      {unread > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Luồng đang chọn */}
          <section className="min-w-0 flex-1">
            {!selected ? (
              <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
                Chọn một lớp bên trái để xem và gửi tin nhắn.
              </p>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
                <div className="border-b border-neutral-100 pb-2">
                  <h2 className="font-semibold text-neutral-900">
                    {selected.student.name}
                  </h2>
                  <p className="text-xs text-neutral-500">{selected.class.name}</p>
                </div>

                <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto py-1">
                  {thread.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-400">
                      Chưa có tin nhắn. Hãy gửi lời nhắn đầu tiên cho giáo viên.
                    </p>
                  ) : (
                    thread.map((m) => {
                      const mine = m.authorSide === "PARENT";
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                              mine
                                ? "bg-orange-500 text-white"
                                : "bg-neutral-100 text-neutral-800"
                            }`}
                          >
                            {m.body}
                          </div>
                          <span className="mt-0.5 text-[10px] text-neutral-400">
                            {mine ? "Bạn" : "Giáo viên"} · {fmt(m.createdAt)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <MessageForm enrollmentId={selected.id} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
