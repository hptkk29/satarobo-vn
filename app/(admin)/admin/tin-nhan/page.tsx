import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkAnyPermission, checkPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { scopedDb } from "@/lib/db-scope";
import {
  getThreadForStudent,
  listStudentThreadSummaries,
  markStudentThreadRead,
} from "@/lib/conversation/service";
import { ReplyForm } from "./_components/reply-form";

export const dynamic = "force-dynamic";

// (b) 10/07 — inbox đọc THEO HỌC VIÊN (không theo enrollment): HV chuyển lớp/cơ sở
// không mất liền mạch hội thoại. Entitlement = tiền lệ câu 20: Student.centerId là cơ
// sở HIỆN TẠI (transfer update ở lib/transfer/service.ts) → sdb.student quyết ai thấy;
// GV (view-own) chỉ đọc luồng thuộc lớp phân công (câu 19). Trả lời luôn đi vào
// enrollment HIỆN HÀNH trong tầm nhìn actor (tin mới mang centerId mới).

const ACTIVE_STATUSES = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

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
  searchParams: Promise<{ s?: string; e?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const actor = await resolveActor(session.user.id);
  // Gate 10/07 — hội thoại PH là PII: chỉ QL cơ sở / Sale-CSKH / Giáo vụ / GV(lớp mình).
  // Trước đó gác bằng `classes:view-all` ⇒ Đào tạo, HR, Kế toán, Marketing đọc được
  // tin nhắn mọi nhà bằng cách gõ URL (menu vẫn giấu). Xem lib/auth/page-gates.ts.
  if (!(await checkAnyPermission(PAGE_GATES["/tin-nhan"]))) {
    redirect("/dashboard");
  }
  // KHÔNG phải gate — quyết định phạm vi đọc: xem mọi lớp, hay chỉ lớp phân công.
  const canViewAllClasses = await checkPermission("classes:view-all");

  const sdb = scopedDb(actor);
  // GV: giới hạn theo lớp phân công (câu 19 — không đọc lịch sử lớp/cơ sở khác).
  const teacherClassIds = canViewAllClasses ? null : [...actor.assignedClassIds];
  const threadOpts = teacherClassIds ? { classIds: teacherClassIds } : undefined;

  const params = await searchParams;
  // Link cũ ?e=<enrollmentId> (bookmark) → resolve về học viên. sdb.enrollment cách ly
  // cơ sở nên link cơ sở khác tự về null.
  let selectedStudentId = params.s?.trim() || null;
  if (!selectedStudentId && params.e?.trim()) {
    const e = await sdb.enrollment.findUnique({
      where: { id: params.e.trim() },
      select: { studentId: true },
    });
    selectedStudentId = e?.studentId ?? null;
  }

  // Gate HV đang chọn: (1) sdb.student — HV phải thuộc cơ sở actor thấy (câu 20);
  // (2) GV: phải có enrollment trong lớp phân công. Mark-read TRƯỚC khi đọc badge.
  let selectedStudent: { id: string; name: string } | null = null;
  if (selectedStudentId) {
    const s = await sdb.student.findUnique({
      where: { id: selectedStudentId },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        ...(teacherClassIds
          ? {
              enrollments: {
                where: { deletedAt: null, classId: { in: teacherClassIds } },
                take: 1,
                select: { id: true },
              },
            }
          : {}),
      },
    });
    const teacherOk =
      !teacherClassIds ||
      ((s as { enrollments?: { id: string }[] } | null)?.enrollments?.length ?? 0) > 0;
    if (s && !s.deletedAt && teacherOk) {
      selectedStudent = { id: s.id, name: s.name };
      await markStudentThreadRead(s.id, "STAFF", threadOpts);
    }
  }

  // Inbox: HV trong tầm nhìn có ≥1 tin nhắn (GV: tin thuộc lớp phân công).
  const enrollmentFilter = {
    deletedAt: null,
    ...(teacherClassIds ? { classId: { in: teacherClassIds } } : {}),
    messages: { some: {} },
  };
  const students = await sdb.student.findMany({
    where: { deletedAt: null, enrollments: { some: enrollmentFilter } },
    select: {
      id: true,
      name: true,
      // Nhãn lớp hiện hành (GV: lớp phân công) — enrollment mới nhất.
      enrollments: {
        where: {
          deletedAt: null,
          ...(teacherClassIds ? { classId: { in: teacherClassIds } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { class: { select: { name: true } } },
      },
    },
  });

  const summaries = await listStudentThreadSummaries(
    students.map((s) => s.id),
    threadOpts,
  );
  const inbox = students
    .map((s) => ({
      id: s.id,
      name: s.name,
      className: s.enrollments[0]?.class?.name ?? "—",
      lastMessageAt: summaries.get(s.id)?.lastMessageAt ?? null,
      unread: summaries.get(s.id)?.unreadFromParent ?? 0,
    }))
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));

  const selected = selectedStudent
    ? inbox.find((s) => s.id === selectedStudent.id) ?? null
    : null;
  const thread = selected ? await getThreadForStudent(selected.id, threadOpts) : [];
  // Hiện nhãn lớp trên từng tin khi luồng trải qua ≥2 lớp (HV đã chuyển).
  const multiClass = new Set(thread.map((m) => m.className ?? "")).size > 1;

  // Đích trả lời = enrollment HIỆN HÀNH trong tầm nhìn actor (ưu tiên đang học,
  // fallback mới nhất). sdb cách ly cơ sở → manager cơ sở mới trả lời vào luồng mới.
  let replyEnrollmentId: string | null = null;
  if (selected) {
    const enrs = await sdb.enrollment.findMany({
      where: {
        studentId: selected.id,
        deletedAt: null,
        ...(teacherClassIds ? { classId: { in: teacherClassIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    replyEnrollmentId =
      enrs.find((e) => (ACTIVE_STATUSES as readonly string[]).includes(e.status))?.id ??
      enrs[0]?.id ??
      null;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tin nhắn</h1>
        <p className="mt-1 text-sm text-gray-500">
          Trao đổi với phụ huynh theo từng học viên — liền mạch cả khi bé chuyển lớp/cơ sở.
        </p>
      </div>

      {inbox.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
          Chưa có cuộc trao đổi nào.
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Danh sách luồng theo học viên */}
          <aside className="w-full shrink-0 lg:w-80">
            <ul className="space-y-2">
              {inbox.map((s) => {
                const active = s.id === selected?.id;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/tin-nhan?s=${s.id}`}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-sm transition-colors ${
                        active
                          ? "border-[#7C3AED] bg-purple-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">
                          {s.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {s.className}
                        </span>
                      </span>
                      {s.unread > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {s.unread > 9 ? "9+" : s.unread}
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
                  <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                  <p className="text-xs text-gray-500">{selected.className}</p>
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
                            {multiClass && m.className ? ` · ${m.className}` : ""}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {replyEnrollmentId ? (
                  <ReplyForm enrollmentId={replyEnrollmentId} />
                ) : (
                  <p className="rounded-lg bg-gray-50 p-2 text-center text-xs text-gray-400">
                    Học viên chưa có ghi danh trong phạm vi của bạn — chỉ xem.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
