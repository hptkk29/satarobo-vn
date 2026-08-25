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
//   OR-null theo per-model scope của actor (vá 24/07: getModelVisibleCenterIds
//   "Holiday" thay blanket visibleCenterIds — HO-role khác chức năng hết thấy CS2).
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
import { getModelVisibleCenterIds } from "@/lib/db-scope";
import {
  isSettledTrialRow,
  trialRowStatus,
  type TrialRowStatus,
} from "@/lib/lms/trial-row-status";
import type { Actor } from "@/lib/auth/actor";

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
      // #5 — ĐỒNG BỘ với getTeacherTrialRoster: buổi GV trực tiếp dạy HOẶC buổi
      // teacherId null thuộc lớp Trial GV là GV chính (trước đây WHERE teacherId
      // thuần → buổi chưa gán GV riêng hiện ở màn Trial nhưng MẤT ở màn Lịch).
      OR: [{ teacherId }, { trialClass: { teacherId } }],
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

/** Ngày nghỉ hiển thị cho GV: TOÀN HỆ THỐNG (centerId null) HOẶC thuộc scope Holiday
 * của actor. Range-overlap với [from, to): holiday [date, endDate ?? date] giao khoảng. */
export type TeacherHolidayRow = {
  name: string;
  date: Date; // @db.Date
  endDate: Date | null; // @db.Date — null = nghỉ 1 ngày
  type: HolidayType;
};

export async function getVisibleHolidays(
  actor: Actor,
  from: Date,
  to: Date,
): Promise<TeacherHolidayRow[]> {
  // Vá 24/07 — per-model scope thay blanket visibleCenterIds: cross-center chỉ khi
  // actor có quyền holidays:/centers: scope ALL. GV thuần không đổi (fallback về
  // visibleCenterIds). Ngày nghỉ TOÀN HỆ THỐNG (centerId null) luôn hiển thị như cũ.
  const scope = getModelVisibleCenterIds("Holiday", actor);
  return db.holiday.findMany({
    where: {
      AND: [
        { date: { lt: to } }, // bắt đầu trước khi khoảng kết thúc
        {
          // kết thúc (endDate, hoặc chính date nếu nghỉ 1 ngày) sau khi khoảng bắt đầu
          OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }],
        },
        ...(scope === "ALL"
          ? []
          : [{ OR: [{ centerId: null }, { centerId: { in: scope } }] }]),
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

/** HV Trial CHƯA xếp buổi (scheduledSessionId null) — kèm tên lớp để GV biết nguồn. */
export type TrialRosterUnassigned = TrialRosterStudent & { trialClassName: string };

export type TrialRosterResult = {
  slots: TrialRosterSlot[];
  /** #2 — HV lớp Trial của GV nhưng CHƯA gắn buổi: hiển thị riêng để không ai tàng hình. */
  unassigned: TrialRosterUnassigned[];
};

/** Buổi Trial GV phụ trách trong [from, to) + học viên (ghép theo scheduledSessionId)
 * + nhóm "Chưa xếp buổi" (enroll cũ không sessionId — không phụ thuộc khoảng ngày). */
export async function getTeacherTrialRoster(
  teacherId: string,
  from: Date,
  to: Date,
): Promise<TrialRosterResult> {
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

  const sessionIds = sessions.map((s) => s.id);
  // HV xếp vào từng buổi (scheduledSessionId). Câu 46: leadChild only — KHÔNG lead.*.
  const enrollments = sessionIds.length
    ? await db.trialEnrollment.findMany({
        where: { scheduledSessionId: { in: sessionIds } },
        select: {
          id: true,
          scheduledSessionId: true,
          status: true,
          trialClass: { select: { name: true } },
          leadChild: {
            select: { fullName: true, dob: true, ageYears: true, interestedCourseId: true },
          },
        },
        orderBy: { leadChild: { fullName: "asc" } },
      })
    : [];

  // #2 — HV ghi danh lớp Trial của GV nhưng scheduledSessionId null (data cũ /
  // enroll trước khi có auto-gán): trước đây `continue` lặng lẽ → GV không hề thấy.
  const unassignedRows = await db.trialEnrollment.findMany({
    where: {
      scheduledSessionId: null,
      status: { in: ["ACTIVE", "COMPLETED"] },
      trialClass: { teacherId, status: { not: "CANCELLED" } },
    },
    select: {
      id: true,
      scheduledSessionId: true,
      status: true,
      trialClass: { select: { name: true } },
      leadChild: {
        select: { fullName: true, dob: true, ageYears: true, interestedCourseId: true },
      },
    },
    orderBy: { leadChild: { fullName: "asc" } },
    take: 200,
  });

  if (sessions.length === 0 && unassignedRows.length === 0) {
    return { slots: [], unassigned: [] };
  }

  const allEnrollments = [...enrollments, ...unassignedRows];
  const courseIds = [
    ...new Set(
      allEnrollments
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
        where: { trialEnrollmentId: { in: allEnrollments.map((e) => e.id) } },
        select: { trialEnrollmentId: true },
      })
    ).map((r) => r.trialEnrollmentId),
  );

  const nowYear = new Date().getUTCFullYear();
  const toStudent = (e: (typeof allEnrollments)[number]): TrialRosterStudent => ({
    enrollmentId: e.id,
    studentName: e.leadChild.fullName,
    birthYear:
      e.leadChild.dob?.getUTCFullYear() ??
      (e.leadChild.ageYears != null ? nowYear - e.leadChild.ageYears : null),
    courseName: e.leadChild.interestedCourseId
      ? (courseName.get(e.leadChild.interestedCourseId) ?? null)
      : null,
    status: e.status,
    evaluated: evaluatedSet.has(e.id),
  });

  const bySession = new Map<string, TrialRosterStudent[]>();
  for (const e of enrollments) {
    if (!e.scheduledSessionId) continue;
    const arr = bySession.get(e.scheduledSessionId) ?? [];
    arr.push(toStudent(e));
    bySession.set(e.scheduledSessionId, arr);
  }

  return {
    slots: sessions.map((s) => ({
      sessionId: s.id,
      trialClassName: s.trialClass.name,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      students: bySession.get(s.id) ?? [],
    })),
    unassigned: unassignedRows.map((e) => ({
      ...toStudent(e),
      trialClassName: e.trialClass.name,
    })),
  };
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

  // GĐ4 — phiếu nay khoá theo BUỔI nên một ca có thể có nhiều phiếu. Lấy phiếu của
  // ĐÚNG buổi ca đang được xếp; không có buổi thì lấy phiếu mới nhất để màn cũ và
  // dữ liệu trước GĐ4 (phiếu chưa gắn buổi) vẫn đọc được.
  const eval0 = await db.trialRubricEval.findFirst({
    where: {
      trialEnrollmentId: enrollmentId,
      ...(enr.scheduledSessionId
        ? { trialClassSessionId: enr.scheduledSessionId }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
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


/* ─────────────────── Bảng Trial site GV (25/08 — 2 bảng phẳng) ───────────────────
 * Chủ dự án 25/08: màn "Học viên trial" đổi từ lưới thẻ theo ngày sang HAI BẢNG PHẲNG —
 * "Các suất sắp Trial" (hôm nay → hết 7 ngày tới) và "Đã Trial" ở dưới — cùng bộ cột
 * Học viên / Phụ huynh / Khoá học / Đánh giá / Trạng thái.
 *
 * ⚠️ ĐẢO "câu 46". Cho tới 24/08, site GV CỐ Ý giấu hẳn phụ huynh ở màn Trial. Chủ dự
 * án 25/08 yêu cầu cột "Phụ huynh" (ví dụ "Hoàng Văn Sơn") — nên ở đây, và CHỈ ở đây,
 * `lead.parentName` được trả về. SĐT/email phụ huynh vẫn tuyệt đối không đi ra: giáo
 * viên cần biết gọi con ai là con nhà ai, không cần kênh liên hệ trực tiếp (đó là việc
 * của Sale, và `canViewParentContact` vẫn chặn TEACHER ở mọi màn khác).
 */

export type { TrialRowStatus } from "@/lib/lms/trial-row-status";

export type TrialTableRow = {
  enrollmentId: string;
  studentName: string;
  birthYear: number | null;
  /** Tên phụ huynh — xem ghi chú "ĐẢO câu 46" ở trên. KHÔNG kèm SĐT/email. */
  parentName: string | null;
  courseName: string | null;
  trialClassName: string;
  /** null = chưa xếp buổi. @db.Date → UTC 00:00 của ngày VN. */
  date: Date | null;
  startTime: string | null;
  endTime: string | null;
  status: TrialRowStatus;
  evaluated: boolean;
};

export type TrialTableResult = {
  /** Hôm nay → hết `days` ngày tới, xếp theo ngày tăng dần. Rỗng = không hiện bảng. */
  upcoming: TrialTableRow[];
  /** Buổi đã qua + mọi suất đã có kết cục (nhập học / rớt / rút), mới nhất lên trước. */
  done: TrialTableRow[];
};

// 26/08 (chủ dự án): BỎ khối "Chưa xếp buổi". Bảng Trial chỉ còn học viên ĐÃ ĐƯỢC LÊN
// LỊCH. Ghi danh chưa gắn buổi là việc của quản lý ở /admin/trial-classes — bày ở site
// GV thì giáo viên không làm gì được với nó ngoài việc thấy một dòng không có ngày giờ.

/**
 * Dữ liệu 2 bảng Trial của site GV.
 *
 * `today` là mốc UTC 00:00 của NGÀY VN (trang truyền vào — server tính, client không
 * đụng `new Date()` để khỏi lệch hydrate). `days` = số ngày nhìn tới, mặc định 7.
 *
 * Own-rows y như `getTeacherTrialRoster`: buổi GV trực tiếp dạy HOẶC lớp Trial mà GV là
 * GV chính. Không đi qua scopedDb vì `TrialClassSession` ∉ SCOPED_MODELS (xem đầu file).
 */
export async function getTeacherTrialTable(
  teacherId: string,
  opts: { today: Date; days?: number; historyDays?: number },
): Promise<TrialTableResult> {
  const days = opts.days ?? 7;
  const historyDays = opts.historyDays ?? 90;
  const todayMs = opts.today.getTime();
  const DAY = 24 * 60 * 60 * 1000;
  // Nửa mở [from, to): "hết 7 ngày tiếp theo" = hôm nay + 7 ngày ⇒ chặn trên là +8 ngày.
  const upcomingTo = new Date(todayMs + (days + 1) * DAY);
  const historyFrom = new Date(todayMs - historyDays * DAY);

  const sessions = await db.trialClassSession.findMany({
    where: {
      status: { not: "CANCELLED" },
      date: { gte: historyFrom, lt: upcomingTo },
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
    take: 400,
  });

  const sessionIds = sessions.map((s) => s.id);
  const enrollmentSelect = {
    id: true,
    scheduledSessionId: true,
    rescheduledFromSessionId: true,
    status: true,
    trialClassId: true,
    leadChildId: true,
    trialClass: { select: { name: true } },
    leadChild: {
      select: {
        fullName: true,
        dob: true,
        ageYears: true,
        interestedCourseId: true,
        // ĐẢO câu 46 — CHỈ tên phụ huynh, không SĐT/email (xem ghi chú đầu khối).
        lead: { select: { parentName: true } },
      },
    },
  } as const;

  // Lead đã XOÁ MỀM thì suất trải nghiệm của nó không còn là việc của ai: giáo viên
  // không nhập phiếu cho một hồ sơ đã bị gỡ, mà lead thì đã biến khỏi /admin/leads nên
  // cũng không ai đi đóng sổ hộ được. Lọc ở ĐƯỜNG ĐỌC thay vì trông vào mọi đường ghi
  // nhớ dọn `LeadTrialHistory.outcome` — đường ghi thì còn thêm mãi, đường đọc chỉ có đây.
  const aliveLead = { leadChild: { lead: { deletedAt: null } } } as const;

  // CHỈ ghi danh ĐÃ GẮN BUỔI. Ghi danh chưa xếp buổi không còn được bày ở site GV
  // (chủ dự án 26/08) nên cũng không truy vấn nữa — bớt một round-trip mỗi lần mở trang.
  const all = sessionIds.length
    ? await db.trialEnrollment.findMany({
        where: { scheduledSessionId: { in: sessionIds }, ...aliveLead },
        select: enrollmentSelect,
        orderBy: { leadChild: { fullName: "asc" } },
      })
    : [];
  if (all.length === 0) return { upcoming: [], done: [] };

  const courseIds = [
    ...new Set(
      all.map((e) => e.leadChild.interestedCourseId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const [courses, evals, histories] = await Promise.all([
    courseIds.length
      ? db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    db.trialRubricEval.findMany({
      where: { trialEnrollmentId: { in: all.map((e) => e.id) } },
      select: { trialEnrollmentId: true },
    }),
    // Kết cục học thử (ENROLLED / LOST / PENDING) — 1 dòng / con × lớp.
    db.leadTrialHistory.findMany({
      where: {
        leadChildId: { in: [...new Set(all.map((e) => e.leadChildId))] },
        trialClassId: { in: [...new Set(all.map((e) => e.trialClassId))] },
      },
      select: { leadChildId: true, trialClassId: true, outcome: true },
    }),
  ]);

  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const evaluatedSet = new Set(evals.map((r) => r.trialEnrollmentId));
  const outcomeOf = new Map(
    histories.map((h) => [`${h.leadChildId}:${h.trialClassId}`, h.outcome]),
  );
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const nowYear = new Date(todayMs).getUTCFullYear();

  function toRow(e: (typeof all)[number]): TrialTableRow {
    const ses = e.scheduledSessionId ? (sessionById.get(e.scheduledSessionId) ?? null) : null;
    const evaluated = evaluatedSet.has(e.id);
    return {
      enrollmentId: e.id,
      studentName: e.leadChild.fullName,
      birthYear:
        e.leadChild.dob?.getUTCFullYear() ??
        (e.leadChild.ageYears != null ? nowYear - e.leadChild.ageYears : null),
      parentName: e.leadChild.lead?.parentName?.trim() || null,
      courseName: e.leadChild.interestedCourseId
        ? (courseName.get(e.leadChild.interestedCourseId) ?? null)
        : null,
      trialClassName: ses?.trialClass.name ?? e.trialClass.name,
      date: ses?.date ?? null,
      startTime: ses?.startTime ?? null,
      endTime: ses?.endTime ?? null,
      evaluated,
      status: trialRowStatus({
        enrollmentStatus: e.status,
        outcome: outcomeOf.get(`${e.leadChildId}:${e.trialClassId}`) ?? null,
        evaluated,
        rescheduled: e.rescheduledFromSessionId != null,
        sessionDate: ses?.date ?? null,
        sessionStatus: ses?.status ?? null,
        todayMs,
      }),
    };
  }

  const upcoming: TrialTableRow[] = [];
  const done: TrialTableRow[] = [];
  for (const e of all) {
    const row = toRow(e);
    // Suất đã có kết cục (nhập học / rớt / rút) rơi xuống bảng dưới dù buổi còn ở tương
    // lai — với giáo viên thì việc đã xong, không còn là "suất sắp Trial".
    const settled = isSettledTrialRow(row.status);
    const inWindow = row.date != null && row.date.getTime() >= todayMs;
    if (inWindow && !settled) upcoming.push(row);
    else done.push(row);
  }

  upcoming.sort(
    (a, b) =>
      (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) ||
      (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
      a.studentName.localeCompare(b.studentName, "vi"),
  );
  done.sort(
    (a, b) =>
      (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) ||
      (b.startTime ?? "").localeCompare(a.startTime ?? "") ||
      a.studentName.localeCompare(b.studentName, "vi"),
  );

  return { upcoming, done };
}
