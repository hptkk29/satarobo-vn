import "server-only";
import { scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/filters";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { SESSION_MEDIA_SELECT } from "@/lib/lms/session-order";
import { sessionWorkState, type SessionWorkInput } from "@/lib/lms/attendance-queue";
import { vnDateAt, vnParts } from "@/lib/time/vn";

// E-01 — "buổi học & đánh giá còn thiếu", đếm cho tab Tương tác KH.
//
// 🔴 DÙNG BỘ `attendance-queue`, KHÔNG dùng `sessionIncomplete` của `lib/pending-tasks`.
// Hai hệ định nghĩa "còn thiếu" khác nhau và cùng tồn tại trong repo:
//   • `sessionIncomplete` — MỘT cờ `status != COMPLETED`, và lọc cơ sở bằng
//     `user.centerId` ĐƠN TRỊ ⇒ quản lý hai cơ sở chỉ thấy một nửa;
//   • `attendance-queue` — ba việc xét theo TỪNG HỌC VIÊN, thuần, không dính scope.
// Con số ở đây phải khớp màn `/admin/attendance`; lấy hệ kia là hai màn nói hai số.
//
// 🔴 KHÔNG N+1 theo số buổi. Năm truy vấn CỐ ĐỊNH bất kể range rộng bao nhiêu — khuôn
// của `getChatPilotStats`. Viết vòng lặp gọi DB theo từng buổi là màn dashboard treo
// đúng vào tháng đông buổi nhất.
//
// ⚠️ Định nghĩa "đủ" KHÔNG viết lại ở đây: `sessionWorkState` ráp ba câu trả lời có sẵn
// (`attendanceCoversRoster` · `summarizeSessionFeedback` · `mediaCoversAttendees`).
// Sửa định nghĩa thì sửa ở đó, đừng đẻ bản thứ hai.

export type SessionGaps = {
  /** Số buổi ĐÃ DIỄN RA trong kỳ mà còn thiếu ít nhất một trong ba việc. */
  pending: number;
  missingAttendance: number;
  missingFeedback: number;
  missingMedia: number;
  /** Tổng số buổi đã diễn ra trong kỳ — mẫu số để `pending` đọc được. */
  totalPast: number;
};

function nextDayStart(dateTo: Date): Date {
  const p = vnParts(dateTo);
  return vnDateAt(p.year, p.month, p.day + 1);
}

export async function countSessionGaps(
  actor: Actor,
  f: ScopeFilters,
  now = new Date(),
): Promise<SessionGaps> {
  const sdb = scopedDb(actor);

  // `ClassSession` ∈ SCOPED_MODELS ⇒ `scopedDb` đã cách ly theo tầm nhìn actor. Mệnh đề
  // `centerId` dưới đây là bộ LỌC của người dùng chồng lên, không phải lớp bảo vệ.
  const sessions = await sdb.classSession.findMany({
    where: {
      date: {
        gte: f.dateFrom,
        // Chỉ đếm buổi ĐÃ DIỄN RA: buổi của ngày mai chưa thể "thiếu điểm danh".
        // `lt` lấy min(hết kỳ, bây giờ) — thiếu vế `now` là mọi buổi tương lai trong
        // kỳ đều bị đếm là còn thiếu và con số phồng lên mỗi khi người dùng chọn range dài.
        lt: new Date(Math.min(nextDayStart(f.dateTo).getTime(), now.getTime())),
      },
      ...(f.centerIds ? { centerId: { in: f.centerIds } } : {}),
    },
    select: { id: true, classId: true },
    // Trần an toàn: range rộng bất thường không được biến màn dashboard thành truy vấn
    // vài chục nghìn dòng. Vượt trần thì con số là "ít nhất N" — chấp nhận được cho một
    // ô đếm, khác hẳn bảng số liệu tài chính.
    take: 5_000,
  });

  if (sessions.length === 0) {
    return {
      pending: 0,
      missingAttendance: 0,
      missingFeedback: 0,
      missingMedia: 0,
      totalPast: 0,
    };
  }

  const sessionIds = sessions.map((s) => s.id);
  const classIds = [...new Set(sessions.map((s) => s.classId))];

  const [rosterRows, attendanceRows, feedbackRows, mediaRows] = await Promise.all([
    // Cùng bộ lọc với màn điểm danh — hai nơi đếm sĩ số khác nhau thì buổi nào cũng
    // "thiếu một em" và không buổi nào xong được.
    sdb.enrollment.findMany({
      where: {
        classId: { in: classIds },
        status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
        deletedAt: null,
        student: { deletedAt: null },
      },
      select: { classId: true, studentId: true },
    }),
    sdb.attendance.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, studentId: true, status: true },
    }),
    // ⚠️ Cột ở bảng này tên `classSessionId`, KHÔNG phải `sessionId` như `Attendance`.
    // Hai tên khác nhau cho cùng một khái niệm là bẫy chép-dán có thật.
    sdb.studentSessionFeedback.findMany({
      where: { classSessionId: { in: sessionIds } },
      select: { classSessionId: true, studentId: true },
    }),
    sdb.classSessionMedia.findMany({
      where: { classSessionId: { in: sessionIds } },
      select: SESSION_MEDIA_SELECT,
    }),
  ]);

  const rosterByClass = new Map<string, string[]>();
  for (const r of rosterRows) {
    const arr = rosterByClass.get(r.classId) ?? [];
    arr.push(r.studentId);
    rosterByClass.set(r.classId, arr);
  }

  const attBySession = new Map<string, { studentId: string; status: string }[]>();
  for (const a of attendanceRows) {
    const arr = attBySession.get(a.sessionId) ?? [];
    arr.push({ studentId: a.studentId, status: a.status });
    attBySession.set(a.sessionId, arr);
  }

  const fbBySession = new Map<string, string[]>();
  for (const fb of feedbackRows) {
    const arr = fbBySession.get(fb.classSessionId) ?? [];
    arr.push(fb.studentId);
    fbBySession.set(fb.classSessionId, arr);
  }

  const mediaBySession = new Map<string, { taggedStudentIds: Set<string>; hasClassWide: boolean }>();
  for (const m of mediaRows) {
    if (!m.classSessionId) continue;
    const cur = mediaBySession.get(m.classSessionId) ?? {
      taggedStudentIds: new Set<string>(),
      hasClassWide: false,
    };
    if (m.isClassWide) cur.hasClassWide = true;
    for (const t of m.tags) cur.taggedStudentIds.add(t.studentId);
    mediaBySession.set(m.classSessionId, cur);
  }

  let pending = 0;
  let missingAttendance = 0;
  let missingFeedback = 0;
  let missingMedia = 0;

  for (const s of sessions) {
    const input: SessionWorkInput = {
      rosterStudentIds: rosterByClass.get(s.classId) ?? [],
      attendanceRows: attBySession.get(s.id) ?? [],
      feedbackStudentIds: fbBySession.get(s.id) ?? [],
      media: mediaBySession.get(s.id) ?? {
        taggedStudentIds: new Set<string>(),
        hasClassWide: false,
      },
    };
    const state = sessionWorkState(input);
    if (!state.attendanceDone) missingAttendance++;
    if (!state.feedbackDone) missingFeedback++;
    if (!state.photoDone) missingMedia++;
    if (!state.attendanceDone || !state.feedbackDone || !state.photoDone) pending++;
  }

  return {
    pending,
    missingAttendance,
    missingFeedback,
    missingMedia,
    totalPast: sessions.length,
  };
}
