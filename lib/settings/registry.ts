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
import { internalAwards } from "@/components/legacy-laptrinhrobot/_data/awards";
import { gifts } from "@/components/legacy-laptrinhrobot/_data/gifts";
import { commitments } from "@/components/legacy-laptrinhrobot/_data/commitments";

export type SettingGroup =
  | "student"
  | "risk"
  | "class"
  | "shift"
  | "contact"
  | "finance"
  | "enrollment"
  | "crm"
  | "otp"
  | "teacher"
  | "lms"
  | "storage"
  | "public"
  | "content";

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

// ── Nội dung chính sách marketing (group "content") — shape khớp _data/* ──
const internalAwardsSchema = z.object({
  totalValue: z.string(),
  perYear: z.number(),
  perEvent: z.string(),
  description: z.string(),
  prizes: z.array(
    z.object({
      rank: z.union([z.number(), z.string()]),
      icon: z.string(),
      name: z.string(),
      reward: z.string(),
      note: z.string(),
    }),
  ),
});

const giftsSchema = z.array(
  z.object({
    id: z.number(),
    icon: z.string(),
    title: z.string(),
    value: z.string(),
    description: z.string(),
  }),
);

const commitmentsSchema = z.array(
  z.object({
    id: z.number(),
    icon: z.string(),
    title: z.string(),
    description: z.string(),
  }),
);

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
  // ── Bổ sung (hardcode remediation Đợt 3): wire hằng số call-site về registry ──
  "student.absenceUrgentThresholdDays": def({
    key: "student.absenceUrgentThresholdDays",
    group: "student",
    label: "Số ngày báo vắng coi là khẩn",
    schema: z.number().int().min(1).max(30),
    default: 3, // lib/students/absence.ts URGENT_THRESHOLD_DAYS
    centerOverridable: true,
  }),
  "student.renewalWindowDays": def({
    key: "student.renewalWindowDays",
    group: "student",
    label: "Cửa sổ tái tục sau hoàn thành khoá (ngày)",
    schema: z.number().int().min(1).max(365),
    default: 90, // lib/students/lifecycle.ts RENEWAL_WINDOW_DAYS
    centerOverridable: true,
  }),
  "student.frequentAbsentThreshold": def({
    key: "student.frequentAbsentThreshold",
    group: "student",
    label: "Số buổi vắng coi là 'hay vắng'",
    schema: z.number().int().min(1).max(20),
    default: 3, // lib/students/lifecycle.ts FREQUENT_ABSENT_THRESHOLD
    centerOverridable: true,
  }),
  "student.frequentAbsentWindow": def({
    key: "student.frequentAbsentWindow",
    group: "student",
    label: "Số buổi gần nhất xét 'hay vắng'",
    schema: z.number().int().min(1).max(50),
    default: 5, // lib/students/lifecycle.ts FREQUENT_ABSENT_WINDOW
    centerOverridable: true,
  }),
  "crm.dedupWindowDays": def({
    key: "crm.dedupWindowDays",
    group: "crm",
    label: "Cửa sổ chống trùng lead (ngày)",
    schema: z.number().int().min(1).max(365),
    default: 90, // lib/crm/lead-qualify.ts & lib/lead/dedup.ts
    centerOverridable: false,
  }),
  // SLA phễu SR.QD.217 (lib/crm/sla.ts SLA_THRESHOLDS) — ngưỡng tính bằng PHÚT.
  "crm.sla.respondMinutes": def({
    key: "crm.sla.respondMinutes",
    group: "crm",
    label: "SLA-0: chưa phản hồi tin nhắn (phút)",
    schema: z.number().int().min(1).max(1440),
    default: 5, // 5'
    centerOverridable: false,
  }),
  "crm.sla.handoverMinutes": def({
    key: "crm.sla.handoverMinutes",
    group: "crm",
    label: "SLA-1: chưa bàn giao lead sau L2 (phút)",
    schema: z.number().int().min(1).max(10080),
    default: 240, // 4h
    centerOverridable: false,
  }),
  "crm.sla.assignMinutes": def({
    key: "crm.sla.assignMinutes",
    group: "crm",
    label: "SLA-2: chưa phân công Sale (phút)",
    schema: z.number().int().min(1).max(10080),
    default: 30, // 30'
    centerOverridable: false,
  }),
  "crm.sla.contactMinutes": def({
    key: "crm.sla.contactMinutes",
    group: "crm",
    label: "SLA-3: chưa liên hệ khách sau phân công (phút)",
    schema: z.number().int().min(1).max(10080),
    default: 180, // 3h
    centerOverridable: false,
  }),
  "crm.sla.silentMinutes": def({
    key: "crm.sla.silentMinutes",
    group: "crm",
    label: "SLA-4: lead im lặng chưa xử lý (phút)",
    schema: z.number().int().min(1).max(43200),
    default: 2880, // 2 ngày
    centerOverridable: false,
  }),
  "sla.leadIdleHours": def({
    key: "sla.leadIdleHours",
    group: "crm",
    label: "R7-01: lead NEW/ASSIGNED im lặng coi là idle (giờ)",
    schema: z.number().int().min(1).max(720),
    default: 24, // QĐ-O: 24h không hoạt động
    centerOverridable: true,
  }),
  "shift.geofenceRadiusMeters": def({
    key: "shift.geofenceRadiusMeters",
    group: "shift",
    label: "Bán kính geofence check-in QR (m)",
    schema: z.number().int().min(10).max(2000),
    default: 100, // lib/attendance/qr.ts GEOFENCE_RADIUS_METERS
    centerOverridable: true,
  }),
  "shift.managerEditWindowDays": def({
    key: "shift.managerEditWindowDays",
    group: "shift",
    label: "Số ngày quản lý được sửa bảng công",
    schema: z.number().int().min(0).max(31),
    default: 2, // lib/attendance/adjust.ts MANAGER_EDIT_WINDOW_DAYS
    centerOverridable: true,
  }),
  "otp.ttlMinutes": def({
    key: "otp.ttlMinutes",
    group: "otp",
    label: "Hiệu lực OTP (phút)",
    schema: z.number().int().min(1).max(60),
    default: 5, // lib/otp/service.ts
    centerOverridable: false,
  }),
  "otp.maxAttempts": def({
    key: "otp.maxAttempts",
    group: "otp",
    label: "Số lần nhập sai OTP tối đa",
    schema: z.number().int().min(1).max(20),
    default: 5,
    centerOverridable: false,
  }),
  "otp.resendCooldownSec": def({
    key: "otp.resendCooldownSec",
    group: "otp",
    label: "Chờ gửi lại OTP (giây)",
    schema: z.number().int().min(10).max(600),
    default: 60,
    centerOverridable: false,
  }),
  "otp.dailyLimit": def({
    key: "otp.dailyLimit",
    group: "otp",
    label: "Số OTP tối đa/ngày cho 1 số",
    schema: z.number().int().min(1).max(50),
    default: 8,
    centerOverridable: false,
  }),
  "teacher.overloadHoursPerWeek": def({
    key: "teacher.overloadHoursPerWeek",
    group: "teacher",
    label: "Ngưỡng giờ/tuần coi là quá tải",
    schema: z.number().int().min(1).max(80),
    default: 24, // lib/teachers/load.ts OVERLOAD_HOURS_PER_WEEK
    centerOverridable: true,
  }),
  "lms.mediaSignedUrlTtl": def({
    key: "lms.mediaSignedUrlTtl",
    group: "lms",
    label: "Hiệu lực signed URL media (giây)",
    schema: z.number().int().min(60).max(86400),
    default: 900, // lib/lms/media-key.ts
    centerOverridable: false,
  }),
  "storage.presignTtlSec": def({
    key: "storage.presignTtlSec",
    group: "storage",
    label: "Hiệu lực presigned upload URL (giây)",
    schema: z.number().int().min(30).max(3600),
    default: 300, // app/api/{portal,admin}/upload-url
    centerOverridable: false,
  }),
  "public.leadRateLimitMax": def({
    key: "public.leadRateLimitMax",
    group: "public",
    label: "Số lần gửi form lead tối đa / cửa sổ / IP",
    schema: z.number().int().min(1).max(100),
    default: 5, // app/api/leads/route.ts
    centerOverridable: false,
  }),
  "public.leadRateLimitWindowMs": def({
    key: "public.leadRateLimitWindowMs",
    group: "public",
    label: "Cửa sổ rate-limit form lead (ms)",
    schema: z.number().int().min(1000).max(3_600_000),
    default: 60_000,
    centerOverridable: false,
  }),
  // ── Nội dung chính sách marketing (legacy-laptrinhrobot) — default = static _data ──
  "content.internalAwards": def({
    key: "content.internalAwards",
    group: "content",
    label: "Giải thưởng nội bộ (Sata Robo Championship)",
    schema: internalAwardsSchema,
    default: internalAwards,
    centerOverridable: false,
  }),
  "content.gifts": def({
    key: "content.gifts",
    group: "content",
    label: "Bộ quà tặng khi đăng ký",
    schema: giftsSchema,
    default: gifts,
    centerOverridable: false,
  }),
  "content.commitments": def({
    key: "content.commitments",
    group: "content",
    label: "Cam kết với phụ huynh",
    schema: commitmentsSchema,
    default: commitments,
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
