// A2 — Nguồn chân lý DUY NHẤT cho "học viên đang thuộc lớp" (hiển thị/đếm).
//
// Hai hệ status từng lẫn lộn: legacy ACTIVE và D5 (CONFIRMED/STUDYING/PAUSED).
// Chốt deal + đăng ký tạo enrollment status = CONFIRMED → phải nằm trong bộ này
// thì điểm danh / sĩ số mới thấy. PAUSED = tạm dừng nhưng VẪN thuộc lớp (giữ
// hiển thị). File THƯỜNG (không "use server") để được export const an toàn.
import type { EnrollmentStatus } from "@prisma/client";

export const ENROLLMENT_ACTIVE_STATUSES = [
  "ACTIVE",
  "CONFIRMED",
  "STUDYING",
  "PAUSED",
] as const satisfies readonly EnrollmentStatus[];

// Dạng mutable để dùng trực tiếp trong Prisma `{ in: [...] }` không cần spread.
export const ENROLLMENT_ACTIVE_STATUS_LIST: EnrollmentStatus[] = [
  ...ENROLLMENT_ACTIVE_STATUSES,
];
