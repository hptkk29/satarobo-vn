import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, getModelVisibleCenterIds, withMakeupException } from "@/lib/db-scope";
import { AttendanceGrid } from "./_components/attendance-grid";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

export const dynamic = "force-dynamic";

interface SearchParams {
  searchParams: Promise<{ sessionId?: string; classId?: string }>;
}

function formatDateTime(d: Date): string {
  const date = new Date(d);
  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${day} · ${time}`;
}

export default async function AttendanceAdminPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const sessionId = sp.sessionId?.trim();
  const classFilter = sp.classId?.trim();

  // Cách ly cơ sở: ClassSession/Attendance KHÔNG ∈ SCOPED_MODELS (không có centerId
  // trực tiếp) → scope THỦ CÔNG qua quan hệ class.centerId, dùng tầm nhìn cơ sở của
  // model Class. Class ∈ SCOPED_MODELS → đọc qua sdb.class (auto-scope).
  const session = await auth();
  if (!session?.user) redirect("/login");
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const visibleClassCenters = getModelVisibleCenterIds("Class", actor);
  const classScopeWhere =
    visibleClassCenters === "ALL"
      ? {}
      : { class: { centerId: { in: visibleClassCenters } } };

  // Load list of sessions for selector (upcoming or recent past)
  const sessions = await db.classSession.findMany({
    where: {
      ...(classFilter ? { classId: classFilter } : {}),
      ...classScopeWhere,
    },
    orderBy: { date: "desc" },
    take: 100,
    select: {
      id: true,
      date: true,
      topic: true,
      classId: true,
      class: { select: { name: true } },
      _count: { select: { attendances: true } },
    },
  });

  const classes = await sdb.class.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 200,
  });

  // If sessionId selected, load enrolled students + existing attendance
  let selectedSession: {
    id: string;
    date: Date;
    topic: string | null;
    className: string;
  } | null = null;
  let rows: Array<{
    studentId: string;
    studentName: string;
    studentPhone: string | null;
    enrollmentStatus: string;
    existing: {
      id: string;
      status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "ABSENT_EXCUSED" | "ABSENT_UNEXCUSED";
      note: string | null;
      makeupStatus: "NONE" | "NEEDS_MAKEUP" | "MADE_UP";
      absenceReason: string | null;
    } | null;
    // R7-08 — HS học bù LIÊN CƠ SỞ: chỉ hiện trong đúng buổi này, KHÔNG lộ hồ sơ.
    makeupFromCenter?: string | null;
  }> = [];

  if (sessionId) {
    // IDOR cross-center: ClassSession không scoped → findFirst + lọc class.centerId
    // trong tầm nhìn (sessionId của cơ sở khác → null → không lộ roster).
    const sess = await db.classSession.findFirst({
      where: {
        id: sessionId,
        ...classScopeWhere,
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            enrollments: {
              where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
              select: {
                status: true,
                student: { select: { id: true, name: true, phone: true } },
              },
              orderBy: { student: { name: "asc" } },
            },
          },
        },
        attendances: {
          select: {
            id: true,
            studentId: true,
            status: true,
            note: true,
            makeupStatus: true,
            absenceReason: true,
          },
        },
      },
    });

    if (sess) {
      selectedSession = {
        id: sess.id,
        date: sess.date,
        topic: sess.topic,
        className: sess.class.name,
      };
      const existingMap = new Map(sess.attendances.map((a) => [a.studentId, a]));
      rows = sess.class.enrollments.map((enr) => {
        const existing = existingMap.get(enr.student.id);
        return {
          studentId: enr.student.id,
          studentName: enr.student.name,
          studentPhone: enr.student.phone,
          enrollmentStatus: enr.status,
          existing: existing
            ? {
                id: existing.id,
                status: existing.status,
                note: existing.note,
                makeupStatus: existing.makeupStatus,
                absenceReason: existing.absenceReason,
              }
            : null,
        };
      });

      // R7-08 (AC4) — HS được xếp HỌC BÙ vào buổi này (có thể từ cơ sở khác).
      // GV lớp đích thấy HS bù trong ĐÚNG buổi này + badge "Học bù từ <CS>";
      // KHÔNG truy cập hồ sơ đầy đủ. Đọc chéo cơ sở qua exception whitelist.
      {
        const xdb = withMakeupException(actor);
        const guests = await xdb.makeupNeed.findMany({
          where: { makeupSessionId: sessionId, status: "SCHEDULED" },
          select: {
            studentId: true,
            centerId: true,
            student: { select: { name: true } },
          },
        });
        const enrolledIds = new Set(rows.map((r) => r.studentId));
        const visitors = guests.filter((g) => !enrolledIds.has(g.studentId));
        if (visitors.length > 0) {
          const centerIds = [...new Set(visitors.map((g) => g.centerId).filter(Boolean))] as string[];
          const centers = await db.center.findMany({
            where: { id: { in: centerIds } },
            select: { id: true, name: true, code: true },
          });
          const centerName = new Map(centers.map((c) => [c.id, c.code ?? c.name]));
          for (const g of visitors) {
            const existing = existingMap.get(g.studentId);
            rows.push({
              studentId: g.studentId,
              studentName: g.student.name,
              studentPhone: null, // T5 hẹp — không lộ hồ sơ HS cơ sở khác
              enrollmentStatus: "MAKEUP",
              existing: existing
                ? {
                    id: existing.id,
                    status: existing.status,
                    note: existing.note,
                    makeupStatus: existing.makeupStatus,
                    absenceReason: existing.absenceReason,
                  }
                : null,
              makeupFromCenter: (g.centerId && centerName.get(g.centerId)) || "cơ sở khác",
            });
          }
        }
      }
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
          <ClipboardCheck className="h-7 w-7 text-orange-500" />
          Điểm danh
        </h1>
        <p className="mt-1 text-neutral-600">
          Chọn buổi học để điểm danh các học viên đăng ký
        </p>
      </div>

      {/* Session selector */}
      <form method="GET" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          name="classId"
          defaultValue={classFilter ?? ""}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          <option value="">Tất cả lớp</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="sessionId"
          defaultValue={sessionId ?? ""}
          className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 sm:max-w-md"
        >
          <option value="">— Chọn buổi học —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {formatDateTime(s.date)} · {s.class.name}
              {s.topic ? ` — ${s.topic}` : ""}
              {s._count.attendances > 0 && ` (đã điểm danh)`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
        >
          Mở
        </button>
      </form>

      {!selectedSession && (
        <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-12 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-12 w-12 text-neutral-400" />
          <p className="text-neutral-600">
            Chọn một buổi học từ dropdown phía trên để bắt đầu điểm danh.
          </p>
          {sessions.length === 0 && (
            <p className="mt-2 text-sm text-amber-600">
              <AlertCircle className="mr-1 inline h-4 w-4" />
              Chưa có buổi học nào.{" "}
              <Link href="/sessions/new" className="text-orange-600 hover:underline">
                Tạo buổi học →
              </Link>
            </p>
          )}
        </div>
      )}

      {selectedSession && (
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-gradient-to-br from-orange-50 to-purple-50 p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-orange-600">
              Buổi học đang điểm danh
            </div>
            <div className="mt-1 text-2xl font-black text-neutral-900">
              {selectedSession.className}
            </div>
            <div className="mt-1 text-sm text-neutral-700">
              {formatDateTime(selectedSession.date)}
              {selectedSession.topic && <> · 📚 {selectedSession.topic}</>}
            </div>
          </div>

          <AttendanceGrid sessionId={selectedSession.id} rows={rows} />
        </div>
      )}
    </div>
  );
}
