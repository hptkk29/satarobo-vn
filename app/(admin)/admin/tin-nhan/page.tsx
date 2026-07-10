import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { getThread, markThreadRead } from "@/lib/conversation/service";
import { ReplyForm } from "./_components/reply-form";

export const dynamic = "force-dynamic";

function fmt(d: Date): string {
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actor = await resolveActor(session.user.id);
  const canViewAllClasses = await checkPermission("classes:view-all");
  if (!canViewAllClasses && !(await checkPermission("classes:view-own"))) {
    redirect("/dashboard");
  }

  // Lớp actor phụ trách: Manager/Super → scopedDb (cách ly cơ sở); GV → lớp phân công.
  // Enrollment + ConversationMessage ∈ SCOPED_MODELS (#03 Pha B) → sdb cách ly luôn ở
  // tầng query. assignedClassIds lấy từ lớp GV đứng tên (actor.ts:185) nên cùng cơ sở.
  const sdb = scopedDb(actor);
  let allowedClassIds: string[];
  if (canViewAllClasses) {
    const classes = await sdb
      .class.findMany({ where: { deletedAt: null }, select: { id: true } })
      .catch(() => [] as { id: string }[]);
    allowedClassIds = classes.map((c) => c.id);
  } else {
    allowedClassIds = [...actor.assignedClassIds];
  }
  const allowed = new Set(allowedClassIds);

  const params = await searchParams;
  const selectedId = params.e?.trim() || null;

  // Ownership + mark-read TRƯỚC khi đọc danh sách (badge phản ánh đúng).
  if (selectedId) {
    const e = await sdb.enrollment.findUnique({
      where: { id: selectedId },
      select: { classId: true },
    });
    if (e && allowed.has(e.classId)) await markThreadRead(selectedId, "STAFF");
  }

  // Inbox: các enrollment trong phạm vi phụ trách CÓ ≥1 tin nhắn.
  const enrollments = await sdb.enrollment.findMany({
    where: {
      deletedAt: null,
      classId: { in: allowedClassIds },
      messages: { some: {} },
    },
    select: {
      id: true,
      student: { select: { name: true } },
      class: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
      _count: {
        select: {
          messages: { where: { authorSide: "PARENT", readByStaffAt: null } },
        },
      },
    },
  });
  // Sắp xếp theo tin nhắn mới nhất giảm dần.
  enrollments.sort(
    (a, b) =>
      (b.messages[0]?.createdAt?.getTime() ?? 0) -
      (a.messages[0]?.createdAt?.getTime() ?? 0),
  );

  // Danh sách đã lọc theo allowedClassIds → enrollment tìm thấy trong đó là hợp lệ (owner/scope).
  const selected = selectedId
    ? enrollments.find((e) => e.id === selectedId) ?? null
    : null;
  const thread = selected ? await getThread(selected.id) : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tin nhắn</h1>
        <p className="mt-1 text-sm text-gray-500">
          Trao đổi với phụ huynh theo từng học viên / lớp bạn phụ trách.
        </p>
      </div>

      {enrollments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
          Chưa có cuộc trao đổi nào.
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Danh sách luồng */}
          <aside className="w-full shrink-0 lg:w-80">
            <ul className="space-y-2">
              {enrollments.map((e) => {
                const active = e.id === selected?.id;
                const unread = e._count.messages;
                return (
                  <li key={e.id}>
                    <Link
                      href={`/tin-nhan?e=${e.id}`}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-sm transition-colors ${
                        active
                          ? "border-[#7C3AED] bg-purple-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">
                          {e.student.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {e.class.name}
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
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
                Chọn một học viên bên trái để xem và trả lời.
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="border-b border-gray-100 pb-2">
                  <h2 className="font-semibold text-gray-900">
                    {selected.student.name}
                  </h2>
                  <p className="text-xs text-gray-500">{selected.class.name}</p>
                </div>

                <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto py-1">
                  {thread.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">
                      Chưa có tin nhắn.
                    </p>
                  ) : (
                    thread.map((m) => {
                      const mine = m.authorSide === "STAFF";
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                              mine
                                ? "bg-[#7C3AED] text-white"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {m.body}
                          </div>
                          <span className="mt-0.5 text-[10px] text-gray-400">
                            {mine ? "Giáo viên" : "Phụ huynh"} · {fmt(m.createdAt)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <ReplyForm enrollmentId={selected.id} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
