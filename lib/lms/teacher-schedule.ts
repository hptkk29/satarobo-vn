// lib/lms/teacher-schedule.ts — #06 (L6): dữ liệu phủ màn "Lịch dạy" site GV
// (buổi Trial + ca làm việc + ngày nghỉ) — port visual từ mock satarobo-ui-giaovien.
//
// Vì sao đọc `db` trần ở đây (app/(teacher)/** bị ESLint chặn import @/lib/db):
// • TrialClassSession ∉ SCOPED_MODELS → scopedDb pass-through, không có auto-scope;
//   WHERE teacherId = chính GV (own-rows) là ranh giới an toàn — chỉ buổi Trial MÌNH
//   dạy, kể cả khi lớp Trial ở cơ sở khác (GV dạy nhiều cơ sở, câu 47).
// • ShiftRegistration ∈ SCOPED_MODELS nhưng đây là CA CỦA CHÍNH MÌNH (unique
//   userId+date); nếu đi qua scopedDb, record centerId null / khác cơ sở sẽ bị ẩn oan
//   dù vẫn là ca của GV. WHERE userId = mình là own-rows, không rò dữ liệu ai khác.
// • Holiday ∈ SCOPED_MODELS và ∉ NULL_IS_GLOBAL_MODELS → scopedDb inject
//   `centerId IN (...)` sẽ ẩn NHẦM ngày nghỉ TOÀN HỆ THỐNG (centerId null). Tự lọc
//   OR-null theo visibleCenterIds của actor (đúng semantics "null = toàn hệ thống").
//
// ⚠️ Câu 46: các hàm chỉ trả tên lớp/giờ/ngày — KHÔNG đụng học viên/phụ huynh.
// ⚠️ @db.Date: tham số from/to là mốc UTC 00:00 của NGÀY VN, khoảng nửa mở [from, to).
import "server-only";
import type {
  ShiftRegStatus,
  TrialSessionStatus,
  TrialEnrollmentStatus,
  WorkShift,
  HolidayType,
} from "@prisma/client";
import { db } from "@/lib/db";

/** Buổi Trial GV phụ trách trong [from, to) — bỏ buổi đã hủy. */
export type TeacherTrialSessionRow = {
  id: string;
  date: Date; // @db.Date → UTC 00:00 của ngày
  startTime: string;
  endTime: string;
  status: TrialSessionStatus;
  trialClassName: string;
};

export async function getTeacherTrialSessions(
  teacherId: string,
  from: Date,
  to: Date,
): Promise<TeacherTrialSessionRow[]> {
  const rows = await db.trialClassSession.findMany({
    where: {
      teacherId, // own-rows: chỉ buổi CHÍNH GV dạy
      status: { not: "CANCELLED" },
      date: { gte: from, lt: to },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      // Nested include không bị auto-scope (giới hạn scopedDb) — ở đây chỉ lấy TÊN lớp
      // Trial của buổi mình dạy, không phải dữ liệu học viên/lead.
      trialClass: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    trialClassName: r.trialClass.name,
  }));
}

/** Ca làm việc CỦA CHÍNH GV trong [from, to). Enum ShiftRegStatus (REGISTERED /
 * LEAVE_REQUESTED / APPROVED) không có trạng thái hủy → lấy đủ cả 3, caller tự
 * đánh dấu LEAVE_REQUESTED (xin nghỉ khẩn) nếu cần. */
export type TeacherShiftRow = {
  date: Date; // @db.Date → UTC 00:00 của ngày
  shifts: WorkShift[];
  status: ShiftRegStatus;
};

export async function getOwnShiftRegistrations(
  userId: string,
  from: Date,
  to: Date,
): Promise<TeacherShiftRow[]> {
  return db.shiftRegistration.findMany({
    where: { userId, date: { gte: from, lt: to } },
    select: { date: true, shifts: true, status: true },
    orderBy: { date: "asc" },
    take: 100, // 1 record/ngày (unique userId+date) — 100 phủ dư lưới tháng 42 ô
  });
}

/** Ngày nghỉ hiển thị cho GV: TOÀN HỆ THỐNG (centerId null) HOẶC thuộc cơ sở actor
 * nhìn thấy. Range-overlap với [from, to): holiday [date, endDate ?? date] giao khoảng. */
export type TeacherHolidayRow = {
  name: string;
  date: Date; // @db.Date
  endDate: Date | null; // @db.Date — null = nghỉ 1 ngày
  type: HolidayType;
};

export async function getVisibleHolidays(
  visibleCenterIds: string[],
  from: Date,
  to: Date,
): Promise<TeacherHolidayRow[]> {
  return db.holiday.findMany({
    where: {
      AND: [
        { date: { lt: to } }, // bắt đầu trước khi khoảng kết thúc
        {
          // kết thúc (endDate, hoặc chính date nếu nghỉ 1 ngày) sau khi khoảng bắt đầu
          OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }],
        },
        { OR: [{ centerId: null }, { centerId: { in: visibleCenterIds } }] },
      ],
    },
    select: { name: true, date: true, endDate: true, type: true },
    orderBy: { date: "asc" },
    take: 50,
  });
}

/* ─────────────────────────── Danh sách Trial (site GV) ───────────────────────────
 * "Danh sách Trial": buổi Trial GV phụ trách + học viên mỗi buổi. Own-rows: buổi mà
 * teacherId = GV HOẶC trialClass.teacherId = GV (GV chính của lớp Trial).
 *
 * ⚠️ Câu 46: CHỈ trả tên HV + năm sinh + khoá quan tâm — TUYỆT ĐỐI KHÔNG đụng
 * lead.parentName/phone/email (khác các trang GV khác đều strip tên PH). Chốt với
 * chủ nhiệm: site GV ẩn hẳn phụ huynh cho lớp Trial. */

export type TrialRosterStudent = {
  enrollmentId: string;
  studentName: string;
  birthYear: number | null;
  courseName: string | null;
  /** ACTIVE/COMPLETED/WITHDRAWN — trạng thái ghi danh trải nghiệm của HV. */
  status: TrialEnrollmentStatus;
  /** Đã có phiếu rubric chưa (→ "Xem phiếu"/"Xuất PDF" thay vì "Nhập phiếu"). */
  evaluated: boolean;
};

export type TrialRosterSlot = {
  sessionId: string;
  trialClassName: string;
  date: Date; // @db.Date → UTC 00:00 của ngày VN
  startTime: string;
  endTime: string;
  status: TrialSessionStatus;
  students: TrialRosterStudent[];
};

/** Buổi Trial GV phụ trách trong [from, to) + học viên (ghép theo scheduledSessionId). */
export async function getTeacherTrialRoster(
  teacherId: string,
  from: Date,
  to: Date,
): Promise<TrialRosterSlot[]> {
  const sessions = await db.trialClassSession.findMany({
    where: {
      status: { not: "CANCELLED" },
      date: { gte: from, lt: to },
      // Own-rows: buổi GV trực tiếp dạy HOẶC là GV chính của lớp Trial.
      OR: [{ teacherId }, { trialClass: { teacherId } }],
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      trialClass: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 200,
  });
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  // HV xếp vào từng buổi (scheduledSessionId). Câu 46: leadChild only — KHÔNG lead.*.
  const enrollments = await db.trialEnrollment.findMany({
    where: { scheduledSessionId: { in: sessionIds } },
    select: {
      id: true,
      scheduledSessionId: true,
      status: true,
      leadChild: {
        select: { fullName: true, dob: true, ageYears: true, interestedCourseId: true },
      },
    },
    orderBy: { leadChild: { fullName: "asc" } },
  });

  const courseIds = [
    ...new Set(
      enrollments
        .map((e) => e.leadChild.interestedCourseId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const courses = courseIds.length
    ? await db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } })
    : [];
  const courseName = new Map(courses.map((c) => [c.id, c.name]));

  // Enrollment nào đã có phiếu rubric → cờ evaluated.
  const evaluatedSet = new Set(
    (
      await db.trialRubricEval.findMany({
        where: { trialEnrollmentId: { in: enrollments.map((e) => e.id) } },
        select: { trialEnrollmentId: true },
      })
    ).map((r) => r.trialEnrollmentId),
  );

  const nowYear = new Date().getUTCFullYear();
  const bySession = new Map<string, TrialRosterStudent[]>();
  for (const e of enrollments) {
    if (!e.scheduledSessionId) continue;
    const birthYear =
      e.leadChild.dob?.getUTCFullYear() ??
      (e.leadChild.ageYears != null ? nowYear - e.leadChild.ageYears : null);
    const arr = bySession.get(e.scheduledSessionId) ?? [];
    arr.push({
      enrollmentId: e.id,
      studentName: e.leadChild.fullName,
      birthYear,
      courseName: e.leadChild.interestedCourseId
        ? (courseName.get(e.leadChild.interestedCourseId) ?? null)
        : null,
      status: e.status,
      evaluated: evaluatedSet.has(e.id),
    });
    bySession.set(e.scheduledSessionId, arr);
  }

  return sessions.map((s) => ({
    sessionId: s.id,
    trialClassName: s.trialClass.name,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    status: s.status,
    students: bySession.get(s.id) ?? [],
  }));
}

/** Props điền phiếu đánh giá 1 buổi Trial (reuse TrialSessionEvalFill). null = không
 * phải buổi của GV (guard own-teacher — khớp gateTrialFill của session-eval-actions). */
export type TeacherTrialEvalProps = {
  trialClassName: string;
  /** Buổi được bấm đặt LÊN ĐẦU để component preselect đúng. */
  evalSessions: { id: string; label: string }[];
  /** studentId = LeadChild.id (khớp evalStudents admin). name = tên HV (câu 46: không PH). */
  evalStudents: { studentId: string; name: string; present: boolean }[];
};

export async function getTeacherTrialEvalProps(
  userId: string,
  sessionId: string,
): Promise<TeacherTrialEvalProps | null> {
  const sess = await db.trialClassSession.findUnique({
    where: { id: sessionId },
    select: {
      teacherId: true,
      trialClass: {
        select: {
          name: true,
          teacherId: true,
          assistantId: true,
          sessions: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { seq: "asc" },
            select: { id: true, seq: true },
          },
          enrollments: {
            orderBy: { leadChild: { fullName: "asc" } },
            select: { id: true, leadChild: { select: { id: true, fullName: true } } },
          },
        },
      },
    },
  });
  if (!sess) return null;

  // Guard own-teacher (khớp gateTrialFill): buổi mình dạy / GV chính / trợ giảng lớp Trial.
  const owned =
    sess.teacherId === userId ||
    sess.trialClass.teacherId === userId ||
    sess.trialClass.assistantId === userId;
  if (!owned) return null;

  const ordered = [
    ...sess.trialClass.sessions.filter((s) => s.id === sessionId),
    ...sess.trialClass.sessions.filter((s) => s.id !== sessionId),
  ];
  return {
    trialClassName: sess.trialClass.name,
    evalSessions: ordered.map((s) => ({ id: s.id, label: `Buổi ${s.seq}` })),
    evalStudents: sess.trialClass.enrollments.map((e) => ({
      studentId: e.leadChild.id,
      name: e.leadChild.fullName,
      present: true,
    })),
  };
}

/* ─────────────── Phiếu đánh giá rubric 1 HV trải nghiệm (form + PDF) ─────────────── */

export type TeacherTrialRubricContext = {
  enrollmentId: string;
  trialClassSessionId: string | null;
  studentName: string;
  courseName: string | null;
  trialClassName: string;
  /** Phiếu đã lưu (null = chưa đánh giá). scores: criterionId -> points. */
  existing: {
    scores: Record<string, number>;
    totalScore: number;
    rank: string;
    generalComment: string | null;
    orientation: string | null;
    updatedAt: Date;
    evaluatedByName: string | null;
  } | null;
};

/** Bối cảnh phiếu rubric cho 1 enrollment — null nếu không phải HV trải nghiệm của GV.
 * ⚠️ Câu 46: chỉ tên HV + khoá, KHÔNG lead.parentName/phone/email. */
export async function getTeacherTrialRubricContext(
  userId: string,
  enrollmentId: string,
): Promise<TeacherTrialRubricContext | null> {
  const enr = await db.trialEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      scheduledSessionId: true,
      leadChild: { select: { fullName: true, interestedCourseId: true } },
      trialClass: { select: { name: true, teacherId: true, assistantId: true } },
    },
  });
  if (!enr) return null;

  // Guard own-teacher: GV chính/trợ giảng lớp Trial, hoặc GV của buổi được xếp.
  let sessionTeacherId: string | null = null;
  if (enr.scheduledSessionId) {
    const sess = await db.trialClassSession.findUnique({
      where: { id: enr.scheduledSessionId },
      select: { teacherId: true },
    });
    sessionTeacherId = sess?.teacherId ?? null;
  }
  const owned =
    enr.trialClass.teacherId === userId ||
    enr.trialClass.assistantId === userId ||
    sessionTeacherId === userId;
  if (!owned) return null;

  const courseName = enr.leadChild.interestedCourseId
    ? (
        await db.course.findUnique({
          where: { id: enr.leadChild.interestedCourseId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  const eval0 = await db.trialRubricEval.findUnique({
    where: { trialEnrollmentId: enrollmentId },
    select: {
      scores: true,
      totalScore: true,
      rank: true,
      generalComment: true,
      orientation: true,
      updatedAt: true,
      evaluatedByName: true,
    },
  });

  return {
    enrollmentId: enr.id,
    trialClassSessionId: enr.scheduledSessionId,
    studentName: enr.leadChild.fullName,
    courseName,
    trialClassName: enr.trialClass.name,
    existing: eval0
      ? {
          // scores lưu JSON → ép về Record<string, number>.
          scores: (eval0.scores as Record<string, number>) ?? {},
          totalScore: eval0.totalScore,
          rank: eval0.rank,
          generalComment: eval0.generalComment,
          orientation: eval0.orientation,
          updatedAt: eval0.updatedAt,
          evaluatedByName: eval0.evaluatedByName,
        }
      : null,
  };
}
