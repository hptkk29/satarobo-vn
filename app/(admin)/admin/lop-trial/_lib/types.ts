// app/(admin)/admin/lop-trial/_lib/types.ts — GĐ2.
//
// Type THUẦN dùng chung giữa Server Component và Client Component của màn "Lớp Trial".
// KHÔNG import Prisma runtime ở đây: file này bị client component kéo theo, mà kéo
// Prisma vào bundle client là lỗi build câm ở Next.
//
// Quy ước xuyên suốt màn: mọi `Date` đã được server đổi sang chuỗi trước khi truyền
// xuống client (ISO cho mốc thời gian, "YYYY-MM-DD" cho cột chỉ mang nghĩa NGÀY).

/** Kết quả chuẩn của mọi server action trong màn này. */
export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; overCapacity?: boolean };

// ─── Mặt phẳng V2: lớp trải nghiệm ───────────────────────────────────────────

export type TrialClassStatusV2 = "OPEN" | "RUNNING" | "COMPLETED" | "CANCELLED";
export type TrialSessionStatusV2 = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type TrialEnrollmentStatusV2 = "ACTIVE" | "COMPLETED" | "WITHDRAWN";
export type TrialAttendanceMark = "PRESENT" | "ABSENT";

/** Một dòng ở bảng danh sách lớp. */
export type ClassRow = {
  id: string;
  code: string;
  name: string;
  status: TrialClassStatusV2;
  /** 28/08 — giờ ở CẤP LỚP đã thôi dùng; giờ thật nằm ở từng buổi. `null` = lớp mới. */
  startTime: string | null;
  endTime: string | null;
  /** `null` = KHÔNG giới hạn sĩ số (mặc định từ 28/08). */
  capacity: number | null;
  /** Số ghi danh còn ACTIVE — mẫu số hiển thị "n/capacity". */
  activeUsed: number;
  sessionCount: number;
  configName: string | null;
  /**
   * Buổi SCHEDULED sớm nhất từ hôm nay trở đi, dạng "YYYY-MM-DD".
   * null = lớp chưa có buổi nào sắp tới. Cột này THAY cột "Ngày BĐ" của màn cũ —
   * lớp là slot tái sử dụng nên `startDate` luôn null, cột cũ luôn trống.
   */
  nextSessionDate: string | null;
};

/** Cấu hình số buổi đang hiệu lực. */
export type ProgramConfig = {
  id: string;
  name: string;
  sessionCount: number;
} | null;

/** Một buổi của lớp, kèm bản đồ điểm danh đã lưu. */
export type SessionRow = {
  id: string;
  seq: number;
  /** ISO của mốc UTC-midnight (cột `@db.Date`). */
  date: string;
  startTime: string;
  endTime: string;
  status: TrialSessionStatusV2;
  /** 28/08 — giáo viên dạy BUỔI NÀY. Lớp không còn cột giáo viên; đây là nguồn duy nhất. */
  teacherId: string | null;
  /** trialEnrollmentId → điểm danh đã lưu. Không có khoá = chưa điểm danh em đó. */
  attendance: Record<string, { status: TrialAttendanceMark; note: string | null }>;
  /**
   * trialEnrollmentId → giáo viên ĐÃ chấm phiếu rubric cho em đó Ở BUỔI NÀY.
   * Không có khoá = chưa chấm.
   *
   * Theo TỪNG BUỔI chứ không theo ca: GĐ4 khoá phiếu bằng cặp (ca, buổi) nên một ca có
   * nhiều phiếu. Gộp về mức ca là dòng buổi 1 sáng nút "Xuất PDF" nhờ phiếu của buổi 2.
   */
  danhGia: Record<string, true>;
};

/** Một học viên trong lớp trải nghiệm (một "ca" trải nghiệm). */
export type EnrollmentRow = {
  id: string;
  leadChildId: string | null;
  childName: string;
  parentName: string | null;
  phone: string | null;
  leadId: string | null;
  status: TrialEnrollmentStatusV2;
  // ─── GĐ3 ───────────────────────────────────────────────────────────────────
  /** Buổi ca này đang được xếp vào. null = chưa xếp buổi nào. */
  scheduledSessionId: string | null;
  /** Sale ĐỀ XUẤT. Chỉ còn ý nghĩa khi Đào tạo chưa chốt. */
  gvDeXuatId: string | null;
  /** Đào tạo PHÂN CÔNG. Có giá trị = đã chốt, Sale không sửa đề xuất được nữa. */
  gvPhanCongId: string | null;
  /** Số lần ca này đã bị dời lịch. */
  rescheduleCount: number;
};

/** Ứng viên trả về từ ô tìm học viên. */
export type Candidate = {
  leadChildId: string;
  childName: string;
  parentName: string | null;
  phone: string | null;
  leadStatus: string;
};

/** Lựa chọn cho dropdown (giáo viên, phòng, cơ sở, lớp chính thức). */
export type Option = { id: string; name: string };

/**
 * Phòng học kèm cơ sở sở hữu. `centerId === null` = phòng DÙNG CHUNG (không gắn cơ
 * sở nào) nên luôn được phép chọn.
 *
 * Mọi dropdown phòng BẮT BUỘC lọc theo cơ sở của đối tượng đang sửa — đổ hết phòng
 * của mọi cơ sở là mời người dùng xếp buổi CS1 vào phòng CS2, và lỗi đó chỉ lộ ra
 * khi có người tới lớp.
 */
export type RoomOption = Option & { centerId: string | null };

// ─── Mặt phẳng V1: lịch hẹn học thử ──────────────────────────────────────────

export type BookingStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "ATTENDED"
  | "MISSED"
  | "POSTPONED"
  | "ENROLLED"
  | "REJECTED";

/** Một buổi hẹn học thử 1-1 gắn thẳng vào lead. */
export type BookingRow = {
  id: string;
  leadId: string;
  parentName: string | null;
  phone: string | null;
  childName: string | null;
  /** Cơ sở của buổi hẹn — dùng để lọc dropdown phòng. null = buổi chưa gán cơ sở. */
  centerId: string | null;
  centerName: string | null;
  status: BookingStatus;
  /**
   * Giờ hẹn theo ĐỒNG HỒ VN, dạng "YYYY-MM-DDTHH:mm" — đúng định dạng
   * `<input type="datetime-local">` cần.
   *
   * ⚠️ CỐ Ý không truyền ISO xuống client: màn cũ dựng chuỗi này bằng
   * `date.getFullYear()`… của MÁY NGƯỜI DÙNG, nên máy đặt múi giờ khác +07 sẽ
   * hiện sai giờ rồi lưu đè sai luôn. Nay server tính bằng `vnParts` và client
   * chỉ hiển thị nguyên văn.
   */
  scheduledAtVn: string;
  teacherId: string | null;
  teacherName: string | null;
  roomId: string | null;
  classId: string | null;
  notes: string | null;
};
