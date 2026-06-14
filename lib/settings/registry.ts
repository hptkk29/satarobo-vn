// lib/settings/registry.ts — R6-A: đăng ký tham số vận hành động (SystemSetting).
// THUẦN (không chạm DB) → test được. Mỗi key có: schema (Zod) + default an toàn =
// GIÁ TRỊ HARDCODE HIỆN TẠI (BA US-R6A AC2: key chưa có trong DB → trả default, không lỗi).
// Thêm key mới = thêm 1 entry ở đây (kèm default = hằng số cũ ở call-site) rồi wire getSetting.
import { z } from "zod";

export type SettingDef<T> = {
  schema: z.ZodType<T>;
  default: T;
  /** Mô tả ngắn cho UI admin. */
  description: string;
  /** Nhóm hiển thị trên UI (student/shift/otp/...). */
  group: string;
};

const proposalWindowSchema = z
  .object({ startDay: z.number().int().min(1).max(31), endDay: z.number().int().min(1).max(31) })
  .refine((w) => w.startDay <= w.endDay, "startDay phải ≤ endDay");

// satisfies: giữ literal type của default để suy ra SettingValue<K> chính xác.
export const SETTING_REGISTRY = {
  // ── Học viên / vòng đời ──
  "student.nearEndThreshold": {
    schema: z.number().int().min(1).max(50),
    default: 5, // lib/students/renewal.ts NEAR_END_THRESHOLD
    description: "Số buổi còn lại để coi là 'sắp hết khóa' (nhắc gia hạn).",
    group: "student",
  },
  "student.absenceUrgentThresholdDays": {
    schema: z.number().int().min(1).max(30),
    default: 3, // lib/students/absence.ts URGENT_THRESHOLD_DAYS
    description: "Số ngày vắng để gắn cờ khẩn.",
    group: "student",
  },
  "student.renewalWindowDays": {
    schema: z.number().int().min(1).max(365),
    default: 90, // lib/students/lifecycle.ts RENEWAL_WINDOW_DAYS
    description: "Cửa sổ (ngày) coi là tái tục sau khi hoàn thành khoá.",
    group: "student",
  },
  "student.frequentAbsentThreshold": {
    schema: z.number().int().min(1).max(20),
    default: 3, // lib/students/lifecycle.ts FREQUENT_ABSENT_THRESHOLD
    description: "Số buổi vắng để coi là 'hay vắng'.",
    group: "student",
  },
  "student.frequentAbsentWindow": {
    schema: z.number().int().min(1).max(50),
    default: 5, // lib/students/lifecycle.ts FREQUENT_ABSENT_WINDOW
    description: "Số buổi gần nhất xét 'hay vắng'.",
    group: "student",
  },
  // ── CRM / lead ──
  "crm.dedupWindowDays": {
    schema: z.number().int().min(1).max(365),
    default: 90, // lib/crm/lead-qualify.ts & lib/lead/dedup.ts DEDUP_WINDOW_DAYS (trùng 2 nơi)
    description: "Cửa sổ (ngày) coi lead trùng.",
    group: "crm",
  },
  // ── Ca làm / chấm công ──
  "shift.proposalWindow": {
    schema: proposalWindowSchema,
    default: { startDay: 25, endDay: 28 }, // lib/shifts.ts d>=25 && d<=28
    description: "Cửa sổ ngày trong tháng cho phép đăng ký ca tháng sau.",
    group: "shift",
  },
  "shift.geofenceRadiusMeters": {
    schema: z.number().int().min(10).max(2000),
    default: 100, // lib/attendance/qr.ts GEOFENCE_RADIUS_METERS
    description: "Bán kính geofence (m) cho check-in QR.",
    group: "shift",
  },
  "shift.managerEditWindowDays": {
    schema: z.number().int().min(0).max(31),
    default: 2, // lib/attendance/adjust.ts MANAGER_EDIT_WINDOW_DAYS
    description: "Số ngày quản lý được sửa bảng công sau ngày công.",
    group: "shift",
  },
  "shift.emergencyMonthlyLimit": {
    schema: z.number().int().min(1).max(31),
    default: 3, // lib/shifts.ts EMERGENCY_MONTHLY_LIMIT
    description: "Số lần đổi/nghỉ khẩn cấp tối đa / tháng / nhân viên.",
    group: "shift",
  },
  // ── OTP ──
  "otp.ttlMinutes": {
    schema: z.number().int().min(1).max(60),
    default: 5, // lib/otp/service.ts OTP_TTL_MINUTES
    description: "Hiệu lực OTP (phút).",
    group: "otp",
  },
  "otp.maxAttempts": {
    schema: z.number().int().min(1).max(20),
    default: 5, // MAX_ATTEMPTS
    description: "Số lần nhập sai OTP tối đa.",
    group: "otp",
  },
  "otp.resendCooldownSec": {
    schema: z.number().int().min(10).max(600),
    default: 60, // RESEND_COOLDOWN_SEC
    description: "Thời gian chờ gửi lại OTP (giây).",
    group: "otp",
  },
  "otp.dailyLimit": {
    schema: z.number().int().min(1).max(50),
    default: 8, // DAILY_LIMIT
    description: "Số OTP tối đa/ngày cho 1 số.",
    group: "otp",
  },
  // ── Giáo viên ──
  "teacher.overloadHoursPerWeek": {
    schema: z.number().int().min(1).max(80),
    default: 24, // lib/teachers/load.ts OVERLOAD_HOURS_PER_WEEK
    description: "Ngưỡng giờ/tuần coi là quá tải.",
    group: "teacher",
  },
  // ── LMS / media ──
  "lms.mediaSignedUrlTtl": {
    schema: z.number().int().min(60).max(86400),
    default: 900, // lib/lms/media-key.ts MEDIA_SIGNED_URL_TTL_SECONDS
    description: "Hiệu lực signed URL media (giây).",
    group: "lms",
  },
  // ── Tài chính ──
  "finance.debtReminderDaysBefore": {
    schema: z.number().int().min(1).max(60),
    default: 14, // app/api/cron/debt-reminder/route.ts
    description: "Số ngày trước hạn để nhắc công nợ.",
    group: "finance",
  },
  // ── Storage ──
  "storage.presignTtlSec": {
    schema: z.number().int().min(30).max(3600),
    default: 300, // app/api/{portal,admin}/upload-url presign TTL
    description: "Hiệu lực presigned upload URL (giây).",
    group: "storage",
  },
  // ── Public form (chống spam) ──
  "public.leadRateLimitMax": {
    schema: z.number().int().min(1).max(100),
    default: 5, // app/api/leads/route.ts RATE_LIMIT_MAX
    description: "Số lần gửi form lead tối đa mỗi cửa sổ / IP.",
    group: "public",
  },
  "public.leadRateLimitWindowMs": {
    schema: z.number().int().min(1000).max(3_600_000),
    default: 60_000, // RATE_LIMIT_WINDOW_MS
    description: "Cửa sổ rate-limit form lead (ms).",
    group: "public",
  },
} as const satisfies Record<string, SettingDef<unknown>>;

export type SettingKey = keyof typeof SETTING_REGISTRY;

export type SettingValue<K extends SettingKey> = z.infer<
  (typeof SETTING_REGISTRY)[K]["schema"]
>;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_REGISTRY, key);
}

/**
 * Parse raw value (từ DB Json) theo schema của key.
 * Lỗi/invalid → trả default an toàn (AC2: không bao giờ throw ra call-site).
 */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const def = SETTING_REGISTRY[key];
  const r = def.schema.safeParse(raw);
  return (r.success ? r.data : def.default) as SettingValue<K>;
}

export function settingDefault<K extends SettingKey>(key: K): SettingValue<K> {
  return SETTING_REGISTRY[key].default as SettingValue<K>;
}
