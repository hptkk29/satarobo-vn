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

/** Khoá cặp (ca, buổi) của một phiếu rubric. Buổi null = phiếu cũ chưa gắn buổi —
 * phải có khoá RIÊNG, không được coi là "đã đánh giá" cho mọi buổi. */
function evalPairKey(enrollmentId: string, sessionId: string | null): string {
  return `${enrollmentId}::${sessionId ?? ""}`;
}

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
      // Own-rows: buổi GV trực tiếp dạy, HOẶC là GV chính của lớp, HOẶC được Đào tạo
      // phân công cho MỘT CA cụ thể trong lớp đó (GĐ3).
      //
      // ⚠️ Nhánh thứ ba là bắt buộc: từ GĐ3, Đào tạo phân công theo TỪNG CA qua
      // `TrialEnrollment.gvPhanCongId`, không còn qua giáo viên của lớp. Thiếu nó thì
      // giáo viên được phân công không thấy ca của mình trên site GV, còn giáo viên
      // chính của lớp lại thấy cả ca đã giao cho người khác — ngược ma trận §8.2.
      OR: [
        { teacherId },
        { trialClass: { teacherId } },
        { trialClass: { enrollments: { some: { gvPhanCongId: teacherId } } } },
      ],
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
      // GĐ3 — thêm nhánh "được phân công theo ca", cùng lý do như ở truy vấn buổi.
      OR: [
        { trialClass: { teacherId, status: { not: "CANCELLED" } } },
        { gvPhanCongId: teacherId, trialClass: { status: { not: "CANCELLED" } } },
      ],
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

  // GĐ4 — phiếu khoá theo cặp (ca, buổi) nên cờ "đã đánh giá" cũng phải theo CẶP.
  //
  // ⚠️ Bản cũ gom theo `trialEnrollmentId` thuần: ca đã chấm buổi 1 rồi dời sang buổi 2
  // vẫn hiện "Đã đánh giá", giáo viên bấm vào thì biểu mẫu trống — vì phiếu đang nằm ở
  // buổi khác. Khoá cặp mới nói đúng "buổi NÀY đã có phiếu chưa".
  const evaluatedPairs = new Set(
    (
      await db.trialRubricEval.findMany({
        where: { trialEnrollmentId: { in: allEnrollments.map((e) => e.id) } },
        select: { trialEnrollmentId: true, trialClassSessionId: true },
      })
    ).map((r) => evalPairKey(r.trialEnrollmentId, r.trialClassSessionId)),
  );

  const nowYear = new Date().getUTCFullYear();
  /** `sessionId` = buổi đang xét (null = nhóm "chưa xếp buổi" → chỉ phiếu cũ chưa gắn buổi). */
  const toStudent = (
    e: (typeof allEnrollments)[number],
    sessionId: string | null,
  ): TrialRosterStudent => ({
    enrollmentId: e.id,
    studentName: e.leadChild.fullName,
    birthYear:
      e.leadChild.dob?.getUTCFullYear() ??
      (e.leadChild.ageYears != null ? nowYear - e.leadChild.ageYears : null),
    courseName: e.leadChild.interestedCourseId
      ? (courseName.get(e.leadChild.interestedCourseId) ?? null)
      : null,
    status: e.status,
    evaluated: evaluatedPairs.has(evalPairKey(e.id, sessionId)),
  });

  const bySession = new Map<string, TrialRosterStudent[]>();
  for (const e of enrollments) {
    if (!e.scheduledSessionId) continue;
    const arr = bySession.get(e.scheduledSessionId) ?? [];
    arr.push(toStudent(e, e.scheduledSessionId));
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
      ...toStudent(e, null),
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

/** Một buổi của lớp Trial để giáo viên CHỌN chấm (GĐ4 — mỗi buổi một phiếu). */
export type TeacherTrialRubricSession = {
  id: string;
  seq: number;
  /** "Buổi 2 · 05/07 · 09:00-10:30" */
  label: string;
  /** Buổi này đã có phiếu của ĐÚNG ca đang mở chưa. */
  evaluated: boolean;
  /** Buổi đang được xếp cho ca (scheduledSessionId) — mặc định chọn. */
  isScheduled: boolean;
};

export type TeacherTrialRubricContext = {
  enrollmentId: string;
  /** Buổi ĐANG chấm (tham số `sessionId`, mặc định là buổi đang xếp). */
  trialClassSessionId: string | null;
  /** Danh sách buổi của lớp để đổi buổi chấm. */
  sessions: TeacherTrialRubricSession[];
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

// @db.Date là UTC 00:00 của ngày lịch VN → format theo UTC mới ra đúng ngày.
const rubricDateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

/** Bối cảnh phiếu rubric cho 1 enrollment — null nếu không phải HV trải nghiệm của GV.
 * ⚠️ Câu 46: chỉ tên HV + khoá, KHÔNG lead.parentName/phone/email.
 *
 * `sessionId` (GĐ4): buổi được chấm. Bỏ trống = buổi đang xếp cho ca
 * (`scheduledSessionId`) — giữ nguyên hành vi của link cũ.
 *
 * ⚠️ Vì sao phải có tham số này: `scheduledSessionId` CHỈ đổi khi dời lịch, nên nếu
 * màn chấm luôn bám vào nó thì một ca vĩnh viễn chỉ đẻ được MỘT phiếu — khoá kép
 * (ca, buổi) mà GĐ4 dựng ở DB sẽ không bao giờ có hiệu lực. */
export async function getTeacherTrialRubricContext(
  userId: string,
  enrollmentId: string,
  sessionId?: string,
): Promise<TeacherTrialRubricContext | null> {
  const enr = await db.trialEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      scheduledSessionId: true,
      gvPhanCongId: true, // GĐ3 — nhánh sở hữu chính, xem `owned` bên dưới
      leadChild: { select: { fullName: true, interestedCourseId: true } },
      trialClass: {
        select: {
          name: true,
          teacherId: true,
          assistantId: true,
          sessions: {
            orderBy: { seq: "asc" },
            select: {
              id: true,
              seq: true,
              date: true,
              startTime: true,
              endTime: true,
              status: true,
              teacherId: true,
            },
          },
        },
      },
    },
  });
  if (!enr) return null;

  const classSessions = enr.trialClass.sessions;
  // Buổi được chấm. `sessionId` đến từ URL nên PHẢI kiểm nó thuộc đúng lớp của ca này
  // — không có bước này thì đổi một chữ trên thanh địa chỉ là ghi phiếu sang lớp khác.
  // Không khớp → null (fail-closed), KHÔNG âm thầm rơi về buổi đang xếp.
  const scheduled = enr.scheduledSessionId
    ? (classSessions.find((s) => s.id === enr.scheduledSessionId) ?? null)
    : null;
  // `const` (không phải `let`) vì TS không giữ được narrowing của biến `let` bên
  // trong callback của .find()/.filter() phía dưới.
  const target: (typeof classSessions)[number] | null = sessionId
    ? (classSessions.find((s) => s.id === sessionId) ?? null)
    : scheduled;
  if (sessionId && !target) return null;

  // GĐ3 — `gvPhanCongId` (phân công theo TỪNG CA) là nhánh CHÍNH từ nay; ba nhánh cũ
  // giữ làm dự phòng cho lớp chưa được phân công theo ca. Thiếu nhánh đầu thì giáo
  // viên được Đào tạo phân công không mở nổi phiếu đánh giá của chính ca mình dạy.
  //
  // Giữ CẢ giáo viên của buổi đang xếp lẫn của buổi đang chấm: bỏ nhánh "buổi đang xếp"
  // đi là siết hẹp hơn bản trước GĐ4 — người đang chấm được hôm nay sẽ mất quyền.
  const owned =
    enr.gvPhanCongId === userId ||
    enr.trialClass.teacherId === userId ||
    enr.trialClass.assistantId === userId ||
    scheduled?.teacherId === userId ||
    target?.teacherId === userId;
  if (!owned) return null;

  const courseName = enr.leadChild.interestedCourseId
    ? (
        await db.course.findUnique({
          where: { id: enr.leadChild.interestedCourseId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  // GĐ4 — phiếu nay khoá theo BUỔI nên một ca có thể có nhiều phiếu. Nạp HẾT phiếu của
  // ca (số buổi/ca rất nhỏ) để vừa lấy phiếu của buổi đang chấm, vừa gắn cờ "đã chấm"
  // lên từng buổi trong ô chọn buổi.
  const evals = await db.trialRubricEval.findMany({
    where: { trialEnrollmentId: enrollmentId },
    orderBy: { updatedAt: "desc" },
    select: {
      trialClassSessionId: true,
      scores: true,
      totalScore: true,
      rank: true,
      generalComment: true,
      orientation: true,
      updatedAt: true,
      evaluatedByName: true,
    },
  });
  // Không có buổi (dữ liệu trước GĐ4) → lấy phiếu mới nhất để màn cũ vẫn đọc được.
  const eval0 = target
    ? (evals.find((e) => e.trialClassSessionId === target.id) ?? null)
    : (evals[0] ?? null);
  const evaluatedSessionIds = new Set(
    evals
      .map((e) => e.trialClassSessionId)
      .filter((id): id is string => id !== null),
  );

  return {
    enrollmentId: enr.id,
    trialClassSessionId: target?.id ?? null,
    sessions: classSessions
      // Buổi đã huỷ không chấm được nữa, trừ khi ĐANG mở đúng buổi đó (link cũ).
      .filter((s) => s.status !== "CANCELLED" || s.id === target?.id)
      .map((s) => ({
        id: s.id,
        seq: s.seq,
        label: `Buổi ${s.seq} · ${rubricDateFmt.format(s.date)} · ${s.startTime}-${s.endTime}`,
        evaluated: evaluatedSessionIds.has(s.id),
        isScheduled: s.id === enr.scheduledSessionId,
      })),
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
