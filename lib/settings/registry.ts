/**
 * R6-A — Registry tham số vận hành (SystemSetting / CenterSetting).
 *
 * Mỗi key có: schema (Zod, source-of-truth validate), default (giá trị hardcode
 * hiện tại — fallback an toàn), centerOverridable (cho phép override theo cơ sở?).
 * KEY KHÔNG CÓ TRONG REGISTRY → không được ghi (US-R6A-1 AC4).
 *
 * Default lấy đúng giá trị đang hardcode trong code (additive, không đổi hành vi
 * khi DB trống): student.nearEndThreshold=5 (lib/students/renewal.ts),
 * class 5–20 (lib/validators/class.ts), shift.toleranceMinutes=5 /
 * emergencyMonthlyLimit=3 (lib/shifts.ts), contact (lib/locations.ts),
 * finance.debtReminderDaysBefore=14 (QĐ-O7), enrollment.suspendMaxMonths=6 (TBD-4).
 */
import { z } from "zod";

export type SettingGroup =
  | "student"
  | "risk"
  | "class"
  | "shift"
  | "contact"
  | "finance"
  | "enrollment";

export interface SettingDef<T = unknown> {
  key: string;
  group: SettingGroup;
  label: string;
  schema: z.ZodType<T>;
  default: T;
  /** true = CenterSetting được override key này; false = chỉ GLOBAL. */
  centerOverridable: boolean;
}

function def<T>(d: SettingDef<T>): SettingDef<T> {
  return d;
}

const hotlineSchema = z.array(
  z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    phone: z.string().min(1),
  }),
);

const proposalWindowSchema = z
  .object({
    fromDay: z.number().int().min(1).max(28),
    toDay: z.number().int().min(1).max(28),
  })
  .refine((v) => v.fromDay <= v.toDay, {
    message: "fromDay phải ≤ toDay",
    path: ["fromDay"],
  });

const emailsSchema = z.object({
  primary: z.string().email(),
  recruitment: z.string().email(),
});

/**
 * Bảng key cấu hình. Thêm key mới = thêm 1 entry ở đây (schema + default).
 */
export const SETTINGS = {
  "student.nearEndThreshold": def({
    key: "student.nearEndThreshold",
    group: "student",
    label: "Ngưỡng 'sắp hết khóa' (số buổi còn lại)",
    schema: z.number().int().min(1).max(50),
    default: 5,
    centerOverridable: true,
  }),
  "risk.careTaskDueDays": def({
    key: "risk.careTaskDueDays",
    group: "risk",
    label: "Hạn xử lý task chăm sóc (ngày)",
    schema: z.number().int().min(1).max(30),
    default: 2,
    centerOverridable: true,
  }),
  "class.minStudents.default": def({
    key: "class.minStudents.default",
    group: "class",
    label: "Sĩ số tối thiểu mặc định",
    schema: z.number().int().min(1).max(100),
    default: 5,
    centerOverridable: true,
  }),
  "class.maxStudents.default": def({
    key: "class.maxStudents.default",
    group: "class",
    label: "Sĩ số tối đa mặc định",
    schema: z.number().int().min(1).max(100),
    default: 20,
    centerOverridable: true,
  }),
  "shift.toleranceMinutes": def({
    key: "shift.toleranceMinutes",
    group: "shift",
    label: "Dung sai chấm công (phút)",
    schema: z.number().int().min(0).max(120),
    default: 5,
    centerOverridable: true,
  }),
  "shift.emergencyMonthlyLimit": def({
    key: "shift.emergencyMonthlyLimit",
    group: "shift",
    label: "Quota đăng ký ca khẩn cấp / tháng",
    schema: z.number().int().min(0).max(31),
    default: 3,
    centerOverridable: true,
  }),
  "shift.proposalWindow": def({
    key: "shift.proposalWindow",
    group: "shift",
    label: "Cửa sổ đăng ký ca tháng sau (ngày trong tháng)",
    schema: proposalWindowSchema,
    default: { fromDay: 25, toDay: 28 },
    centerOverridable: true,
  }),
  "contact.hotlines": def({
    key: "contact.hotlines",
    group: "contact",
    label: "Hotline hiển thị theo cơ sở",
    schema: hotlineSchema,
    default: [
      { code: "CS1", label: "Cơ sở 1 - Nguyễn Hữu Thọ", phone: "0818.823.720" },
      { code: "CS2", label: "Cơ sở 2 - Hoàng Diệu", phone: "0702.193.933" },
    ],
    centerOverridable: false,
  }),
  "contact.emails": def({
    key: "contact.emails",
    group: "contact",
    label: "Email hiển thị",
    schema: emailsSchema,
    default: {
      primary: "thongtin@satarobo.vn",
      recruitment: "tuyendung@satarobo.vn",
    },
    centerOverridable: false,
  }),
  "finance.debtReminderDaysBefore": def({
    key: "finance.debtReminderDaysBefore",
    group: "finance",
    label: "Nhắc công nợ trước đợt 2 (ngày)",
    schema: z.number().int().min(1).max(60),
    default: 14,
    centerOverridable: true,
  }),
  "enrollment.suspendMaxMonths": def({
    key: "enrollment.suspendMaxMonths",
    group: "enrollment",
    label: "Trần thời hạn bảo lưu (tháng)",
    schema: z.number().int().min(1).max(24),
    default: 6,
    centerOverridable: false,
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function getSettingDef(key: string): SettingDef | undefined {
  return (SETTINGS as Record<string, SettingDef>)[key];
}

export type ValidateResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Validate value theo schema của key. Key không có schema → từ chối. */
export function validateSettingValue(key: string, value: unknown): ValidateResult {
  const d = getSettingDef(key);
  if (!d) return { ok: false, error: `Key cấu hình không hợp lệ (không có schema): ${key}` };
  const r = d.schema.safeParse(value);
  if (!r.success) {
    return { ok: false, error: r.error.issues[0]?.message ?? "Giá trị không hợp lệ" };
  }
  return { ok: true, value: r.data };
}
