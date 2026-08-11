import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, AlertCircle } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, withMakeupException } from "@/lib/db-scope";
import { AttendanceGrid } from "./_components/attendance-grid";
import { AttendanceSelector } from "./_components/attendance-selector";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Điểm danh | Admin" };

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

  // LMS-1 / W1-1 — owner-scope cho selector: GV chỉ thấy lớp mình dạy/trợ giảng;
  // CENTER_MANAGER theo cơ sở; SUPER_ADMIN toàn bộ (cùng quy tắc canManageSessionClass).
  const gateUser = (await auth())?.user;
  if (!gateUser) redirect("/login");
  const NONE: Prisma.ClassWhereInput = { id: "__none__" };
  // Cách ly cơ sở (A0-04): Class/ClassSession ∈ SCOPED_MODELS → đọc qua scopedDb.
  const actor = await resolveActor(gateUser.id);
  const sdb = scopedDb(actor);

  // Ai được sửa điểm danh thì phải VÀO ĐƯỢC màn này. Trước 03/08 selector dựng
  // bằng hasRole v1 tĩnh (SA/CM/GV, còn lại NONE) nên CSKH bị chặn trắng, trong khi
  // chính markAttendance cho họ sửa hồi tố 7 ngày qua attendance:edit (Task #16) —
  // họ phải đi vòng qua hub lớp. Nay hỏi đúng quyền, và hỏi THEO TỪNG CƠ SỞ vì
  // `attendance:edit` là scope CENTER (R1: action non-GLOBAL cấm gọi trần).
  const editableCenterIds = (
    await Promise.all(
      actor.visibleCenterIds.map(async (centerId) =>
        (await checkPermission("attendance:edit", { centerId })) ? centerId : null,
      ),
    )
  ).filter((id): id is string => id !== null);

  const classScope: Prisma.ClassWhereInput = actor.isSuperAdmin
    ? {}
    : editableCenterIds.length > 0
      ? { centerId: { in: editableCenterIds } }
      : hasRole(gateUser, "TEACHER")
        ? { OR: [{ teacherId: gateUser.id }, { assistantId: gateUser.id }] }
        : NONE;

  // Load list of sessions for selector (upcoming or recent past)
  // QA 21/07 — loại buổi của lớp đã xoá mềm khỏi selector (đồng bộ /sessions).
  const sessions = await sdb.classSession.findMany({
    where: {
      ...(classFilter ? { classId: classFilter } : {}),
      class: { deletedAt: null, ...classScope },
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
    where: { deletedAt: null, ...classScope },
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
    // Scope theo selector: GV mở thẳng sessionId của lớp ngoài phạm vi → null (ẩn roster).
    const sess = await sdb.classSession.findFirst({
      where: { id: sessionId, class: { deletedAt: null, ...classScope } },
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
          const centers = await sdb.center.findMany({
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
        <h1 className="flex items-center gap-2 text-3xl font-black text-foreground">
          <ClipboardCheck className="h-7 w-7 text-primary" />
          Điểm danh
        </h1>
        <p className="mt-1 text-muted-foreground">
          Chọn buổi học để điểm danh các học viên đăng ký
        </p>
      </div>

      {/* Session selector — client-side nav + pending "Đang mở…" (Lỗi 2-click QA 20/07) */}
      <AttendanceSelector
        key={classFilter ?? ""}
        classId={classFilter ?? ""}
        sessionId={sessionId ?? ""}
        classes={classes.map((c) => ({ id: c.id, label: c.name }))}
        sessions={sessions.map((s) => ({
          id: s.id,
          label: `${formatDateTime(s.date)} · ${s.class.name}${s.topic ? ` — ${s.topic}` : ""}${
            s._count.attendances > 0 ? " (đã điểm danh)" : ""
          }`,
        }))}
      />

      {!selectedSession && (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted p-12 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Chọn một buổi học từ dropdown phía trên để bắt đầu điểm danh.
          </p>
          {sessions.length === 0 && (
            <p className="mt-2 text-sm text-state-warning-ink">
              <AlertCircle className="mr-1 inline h-4 w-4" />
              Chưa có buổi học nào.{" "}
              <Link href="/sessions/new" className="text-primary hover:underline">
                Tạo buổi học →
              </Link>
            </p>
          )}
        </div>
      )}

      {selectedSession && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-primary-soft p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-primary">
              Buổi học đang điểm danh
            </div>
            <div className="mt-1 text-2xl font-black text-foreground">
              {selectedSession.className}
            </div>
            <div className="mt-1 text-sm text-foreground">
              {formatDateTime(selectedSession.date)}
              {selectedSession.topic && <> · 📚 {selectedSession.topic}</>}
            </div>
          </div>

          {/* key = buổi: đổi ?sessionId= là điều hướng client, React giữ nguyên instance
              cũ ⇒ state (chỉ khởi tạo 1 lần) còn của buổi trước. Có key thì lưới nạp lại. */}
          <AttendanceGrid key={selectedSession.id} sessionId={selectedSession.id} rows={rows} />
        </div>
      )}
    </div>
  );
}
