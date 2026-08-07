import "server-only";
import { db } from "@/lib/db";
import { withMakeupException } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

// Roster điểm danh của 1 buổi (ClassSession) — tách từ attendance/page.tsx để
// trang chi tiết lớp đa-tab (FL-R2 W4 R2-CLASS-1) nhúng AttendanceGrid mà KHÔNG
// dựng lại logic enrollments + học bù liên cơ sở. Mô hình null-row: mọi HV đã ghi
// danh đều có dòng; `existing: null` = chưa điểm danh (không tạo bản ghi PENDING).

export type AttendanceRosterRow = {
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
};

export type SessionAttendanceRoster = {
  session: { id: string; date: Date; topic: string | null; className: string } | null;
  rows: AttendanceRosterRow[];
};

/**
 * Dựng roster điểm danh cho 1 buổi. KHÔNG tự kiểm tra scope cơ sở — caller PHẢI
 * xác minh `sessionId` thuộc lớp trong tầm nhìn actor trước (chống IDOR). `actor`
 * dùng cho exception đọc HS học bù liên cơ sở (withMakeupException).
 */
export async function buildSessionAttendanceRows(
  actor: Actor,
  sessionId: string,
): Promise<SessionAttendanceRoster> {
  const sess = await db.classSession.findFirst({
    where: { id: sessionId },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          enrollments: {
            // `student: { deletedAt: null }` là hàng rào 2 (07/08): cascade lúc xoá HV đã
            // hạ status, nhưng roster này nuôi CẢ điểm danh admin lẫn site GV và còn là
            // guard chống ghi attendance ngoài danh sách — dữ liệu hỏng sẵn không được lọt.
            where: {
              status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
              deletedAt: null,
              student: { deletedAt: null },
            },
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
  if (!sess) return { session: null, rows: [] };

  const existingMap = new Map(sess.attendances.map((a) => [a.studentId, a]));
  const rows: AttendanceRosterRow[] = sess.class.enrollments.map((enr) => {
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

  // R7-08 (AC4) — HS được xếp HỌC BÙ vào buổi này (có thể từ cơ sở khác). GV lớp
  // đích thấy HS bù trong ĐÚNG buổi này + badge "Học bù từ <CS>"; KHÔNG lộ hồ sơ.
  const xdb = withMakeupException(actor);
  const guests = await xdb.makeupNeed.findMany({
    where: { makeupSessionId: sessionId, status: "SCHEDULED" },
    select: { studentId: true, centerId: true, student: { select: { name: true } } },
  });
  const enrolledIds = new Set(rows.map((r) => r.studentId));
  const visitors = guests.filter((g) => !enrolledIds.has(g.studentId));
  if (visitors.length > 0) {
    const centerIds = [...new Set(visitors.map((g) => g.centerId).filter(Boolean))] as string[];
    const centers = centerIds.length
      ? await db.center.findMany({
          where: { id: { in: centerIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
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

  return {
    session: { id: sess.id, date: sess.date, topic: sess.topic, className: sess.class.name },
    rows,
  };
}

/**
 * SEC-M02 — Tập studentId HỢP LỆ của buổi = ROSTER hiển thị (enrolled active trong lớp
 * ∪ HS học bù có MakeupNeed SCHEDULED vào buổi này, kể cả liên cơ sở). TÁI DÙNG
 * buildSessionAttendanceRows để không lệch với roster đang hiển thị. Dùng để chặn
 * upsert attendance/feedback với studentId ngoài roster (chống inject thông báo giả).
 * Trả về set RỖNG nếu session không tồn tại.
 */
export async function getSessionRosterStudentIds(
  actor: Actor,
  sessionId: string,
): Promise<Set<string>> {
  const { rows } = await buildSessionAttendanceRows(actor, sessionId);
  return new Set(rows.map((r) => r.studentId));
}
