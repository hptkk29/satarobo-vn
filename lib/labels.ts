import type { Role } from "@prisma/client";

// =============================================================================
// LABELS tiếng Việt — single source of truth cho hiển thị
// =============================================================================

// Phase T0.1 — nhãn role tiếng Việt (8 roles).
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CENTER_MANAGER: "Quản lý cơ sở",
  HR: "Nhân sự (HR)",
  SALES_CSM: "Tư vấn & Chăm sóc",
  TEACHER: "Giáo viên",
  MARKETING: "Marketing",
  ACCOUNTANT: "Kế toán",
  PARENT: "Phụ huynh",
};

export function roleLabel(role: Role | string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role as Role] ?? String(role);
}

// Màu badge role — single source (gộp từ users/role-badge.tsx).
export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700",
  CENTER_MANAGER: "bg-purple-100 text-purple-700",
  HR: "bg-pink-100 text-pink-700",
  SALES_CSM: "bg-blue-100 text-blue-700",
  TEACHER: "bg-green-100 text-green-700",
  MARKETING: "bg-orange-100 text-orange-700",
  ACCOUNTANT: "bg-yellow-100 text-yellow-700",
  PARENT: "bg-teal-100 text-teal-700",
};

export function roleColor(role: Role | string | null | undefined): string {
  return ROLE_COLORS[role as Role] ?? "bg-gray-100 text-gray-700";
}

// Role gán được cho nhân viên (loại PARENT — phụ huynh không phải nhân sự).
export const ASSIGNABLE_ROLES: Role[] = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "HR",
  "SALES_CSM",
  "TEACHER",
  "MARKETING",
  "ACCOUNTANT",
];

/** Option {value,label} cho dropdown chọn role. Mặc định = toàn bộ role gán được. */
export function getRoleOptions(
  roles: Role[] = ASSIGNABLE_ROLES,
): Array<{ value: Role; label: string }> {
  return roles.map((value) => ({ value, label: ROLE_LABELS[value] }));
}

// =============================================================================
// R7-08 (XĐ-8 PA2) — 6 NHÃN ĐIỂM DANH hiển thị.
//
// Enum DB giữ theo Doc 15 (status + makeupStatus + SessionStatus). Nhãn HIỂN THỊ
// suy ra từ 3 nguồn qua attendanceLabel(...) — KHÔNG đổi enum. Buổi CANCELLED →
// "Buổi học bị hủy", KHÔNG tính vắng (countsAbsent=false, countsAttended=false).
// =============================================================================

export type AttendanceStatusValue =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "EXCUSED"
  | "ABSENT_EXCUSED"
  | "ABSENT_UNEXCUSED";

export type MakeupStatusValue = "NONE" | "NEEDS_MAKEUP" | "MADE_UP";

export type SessionStatusValue = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** 6 nhãn SRS + nhãn đặc biệt buổi hủy. */
export type AttendanceLabelKey =
  | "PRESENT"
  | "LATE"
  | "ABSENT_EXCUSED"
  | "ABSENT_UNEXCUSED"
  | "NEEDS_MAKEUP"
  | "MADE_UP"
  | "CANCELLED";

export type AttendanceLabelTone = "green" | "amber" | "blue" | "red" | "purple" | "neutral";

export interface AttendanceLabelInfo {
  key: AttendanceLabelKey;
  label: string;
  tone: AttendanceLabelTone;
  /** Có tính là "đã học" (đếm tiến độ) không. */
  countsAttended: boolean;
  /** Có tính là "vắng" không (buổi hủy = false). */
  countsAbsent: boolean;
}

/** Bảng nhãn — đổi text/màu ở 1 chỗ. */
export const ATTENDANCE_LABELS: Record<AttendanceLabelKey, AttendanceLabelInfo> = {
  PRESENT: { key: "PRESENT", label: "Có mặt", tone: "green", countsAttended: true, countsAbsent: false },
  LATE: { key: "LATE", label: "Đi muộn", tone: "amber", countsAttended: true, countsAbsent: false },
  ABSENT_EXCUSED: { key: "ABSENT_EXCUSED", label: "Vắng có phép", tone: "blue", countsAttended: false, countsAbsent: true },
  ABSENT_UNEXCUSED: { key: "ABSENT_UNEXCUSED", label: "Vắng không phép", tone: "red", countsAttended: false, countsAbsent: true },
  NEEDS_MAKEUP: { key: "NEEDS_MAKEUP", label: "Chờ học bù", tone: "amber", countsAttended: false, countsAbsent: true },
  MADE_UP: { key: "MADE_UP", label: "Đã học bù", tone: "purple", countsAttended: true, countsAbsent: false },
  CANCELLED: { key: "CANCELLED", label: "Buổi học bị hủy", tone: "neutral", countsAttended: false, countsAbsent: false },
};

const EXCUSED_SET = new Set<AttendanceStatusValue>(["EXCUSED", "ABSENT_EXCUSED"]);

/**
 * Map (status, makeupStatus, sessionStatus) → 1 trong 6 nhãn (+ buổi hủy).
 * Ưu tiên: buổi hủy > đã học bù > chờ học bù > trạng thái điểm danh.
 */
export function attendanceLabel(
  status: AttendanceStatusValue,
  makeupStatus: MakeupStatusValue = "NONE",
  sessionStatus?: SessionStatusValue | null,
): AttendanceLabelInfo {
  if (sessionStatus === "CANCELLED") return ATTENDANCE_LABELS.CANCELLED;
  if (makeupStatus === "MADE_UP") return ATTENDANCE_LABELS.MADE_UP;
  if (makeupStatus === "NEEDS_MAKEUP") return ATTENDANCE_LABELS.NEEDS_MAKEUP;
  switch (status) {
    case "PRESENT":
      return ATTENDANCE_LABELS.PRESENT;
    case "LATE":
      return ATTENDANCE_LABELS.LATE;
    default:
      return EXCUSED_SET.has(status)
        ? ATTENDANCE_LABELS.ABSENT_EXCUSED
        : ATTENDANCE_LABELS.ABSENT_UNEXCUSED;
  }
}
