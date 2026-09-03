// lib/lms/attendance-pending.ts — "buổi nào CÒN NỢ điểm danh", một định nghĩa duy nhất.
//
// Vì sao file này tồn tại (QA site GV vòng 1, 28/08/2026 — nguyên nhân gốc RC-2):
// năm chỗ đọc của site GV coi "đã điểm danh" = CÓ ÍT NHẤT MỘT dòng Attendance:
//   • teacher/page.tsx      — ô "Buổi chưa điểm danh" (qua `summarizeSessionFeedback`)
//   • lop/page.tsx          — cột "Cần xử lý" + badge tab Điểm danh
//   • diem-danh/page.tsx    — nhãn "Đã xong"
//   • hub-sessions-tab.tsx  — pill trạng thái buổi
//
// ⚠️ NGÒI NỔ TRÊN PROD, không phải chuyện của UAT: duyệt phiếu xin nghỉ của phụ huynh
// (admin/parent-requests/actions.ts) ghi ĐÚNG MỘT dòng Attendance. Buổi đó lập tức
// thoả "≥1 dòng" nên rơi khỏi mọi danh sách việc cần làm của giáo viên, kèm pill xanh
// "Có mặt 0/12". Chỉ cần một phụ huynh xin nghỉ trước buổi là GV mất dấu buổi đó.
//
// Định nghĩa ĐÚNG đã có sẵn và admin đang dùng: `attendanceCoversRoster` — so theo
// DANH SÁCH studentId, không so số lượng. File này chỉ bắc cầu nó sang site GV.
//
// ⚠️ KHÔNG sửa `summarizeSessionFeedback().attendanceTaken`: 8 file gọi nó, gồm cả màn
// admin, và ở đó "có bản ghi chưa" đúng là câu hỏi cần hỏi (nó quyết định fallback
// "hiện toàn bộ lớp" của phiếu nhận xét). Hai câu hỏi khác nhau, giữ hai hàm.
//
// ⚠️ KHÔNG import `@/lib/db` — cổng DB đã đóng cho app/(teacher). Hàm nạp dữ liệu ở
// đây NHẬN client qua tham số.
import { attendanceCoversRoster } from "@/lib/lms/session-order";
import { rosterWhere } from "@/lib/enrollment-scope";

/** Một buổi, rút gọn đúng phần cần để hỏi "còn nợ điểm danh không". */
export type PendingSessionInput = {
  id: string;
  classId: string;
};

export type MissingAttendanceInput = {
  sessions: PendingSessionInput[];
  /** buổi → danh sách studentId ĐÃ có bản ghi điểm danh (kể cả học viên học bù). */
  markedBySession: Map<string, Set<string>>;
  /** lớp → danh sách studentId đang học (đã lọc đủ ba tầng qua `rosterWhere`). */
  rosterByClass: Map<string, Set<string>>;
};

/**
 * Buổi còn nợ điểm danh = điểm danh CHƯA phủ hết sĩ số.
 *
 * Quy ước biên, cố ý và khớp `attendanceCoversRoster`:
 *   • sĩ số RỖNG ⇒ KHÔNG còn việc. Lớp đã kết khoá (mọi em COMPLETED) hoặc lớp mới
 *     chưa xếp ai thì không có gì để điểm danh — đẩy chúng vào "cần xử lý" là ghim
 *     rác vĩnh viễn ở đầu bảng và đè việc thật xuống dưới.
 *   • học viên HỌC BÙ từ lớp khác cũng sinh bản ghi ⇒ đừng bao giờ so số lượng.
 *
 * Người gọi tự lọc buổi CANCELLED và tự chốt cửa sổ thời gian trước khi truyền vào.
 */
export function sessionsMissingAttendance(
  input: MissingAttendanceInput,
): PendingSessionInput[] {
  const { sessions, markedBySession, rosterByClass } = input;
  return sessions.filter((s) => {
    const roster = rosterByClass.get(s.classId);
    if (!roster || roster.size === 0) return false;
    const marked = markedBySession.get(s.id) ?? new Set<string>();
    return !attendanceCoversRoster(marked, roster);
  });
}

/** Đếm buổi còn nợ theo từng lớp — dạng dùng trực tiếp cho cột "Cần xử lý". */
export function countMissingAttendanceByClass(
  input: MissingAttendanceInput,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessionsMissingAttendance(input)) {
    out.set(s.classId, (out.get(s.classId) ?? 0) + 1);
  }
  return out;
}

/**
 * Ba trạng thái điểm danh của một buổi — thay cho nhị phân "xong / chưa xong".
 *
 * QA vòng 1 (BUG-016): lớp "Dự kiến", sĩ số 0, chưa khai giảng vẫn hiện badge xanh
 * "Hoàn tất" — trùng nghĩa với badge trạng thái lớp ngay cột bên cạnh. `KHONG_CO_VIEC`
 * để màn hình in "Không có việc" / để trống thay vì khoe hoàn tất.
 */
export type SessionAttendanceState = "DU" | "THIEU" | "KHONG_CO_VIEC";

export function sessionAttendanceState(args: {
  markedStudentIds: Iterable<string>;
  rosterStudentIds: Iterable<string>;
}): SessionAttendanceState {
  const roster = new Set(args.rosterStudentIds);
  if (roster.size === 0) return "KHONG_CO_VIEC";
  return attendanceCoversRoster(args.markedStudentIds, roster) ? "DU" : "THIEU";
}

/**
 * Truy vấn sĩ số theo lớp, ĐÚNG ba tầng lọc.
 *
 * ⚠️ Đọc qua quan hệ `class` chứ KHÔNG phải `enrollment.findMany`: `Enrollment` nằm
 * trong `SCOPED_MODELS`, `injectScope` sẽ chèn `centerId IN (...)` trần ⇒ ghi danh
 * `centerId = null` biến mất IM LẶNG. Các file hiện tại cố ý đọc qua `class` vì lý do
 * này (có chú thích ở hoan-thanh/page.tsx và hoc-vien/page.tsx) — đừng "gọn hoá".
 *
 * @param xdb client đã scope sẵn (scopedDb / withMakeupException) — truyền vào, không tự import.
 */
export async function loadRosterByClass(
  xdb: {
    class: {
      findMany: (args: unknown) => Promise<
        { id: string; enrollments: { studentId: string }[] }[]
      >;
    };
  },
  classIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (classIds.length === 0) return out;
  const rows = await xdb.class.findMany({
    where: { id: { in: classIds } },
    select: {
      id: true,
      enrollments: { where: rosterWhere("dang-hoc"), select: { studentId: true } },
    },
  });
  for (const c of rows) {
    out.set(c.id, new Set(c.enrollments.map((e) => e.studentId)));
  }
  return out;
}

/**
 * Gom bản ghi điểm danh theo buổi.
 *
 * @param xdb client đã scope sẵn — truyền vào, không tự import.
 */
export async function loadMarkedBySession(
  xdb: {
    attendance: {
      findMany: (args: unknown) => Promise<{ sessionId: string; studentId: string }[]>;
    };
  },
  sessionIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (sessionIds.length === 0) return out;
  const rows = await xdb.attendance.findMany({
    where: { sessionId: { in: sessionIds } },
    select: { sessionId: true, studentId: true },
  });
  for (const r of rows) {
    const set = out.get(r.sessionId) ?? new Set<string>();
    set.add(r.studentId);
    out.set(r.sessionId, set);
  }
  return out;
}
