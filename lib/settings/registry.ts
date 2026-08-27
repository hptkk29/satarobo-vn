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
  | "media"
  | "storage"
  | "public"
  | "content"
  | "cron"
  | "dashboard"
  | "makeup"
  | "chat"
  | "system";

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
  // 03/08 — dung sai LÀM TRÒN khi đối khớp tiền về (lib/payments/allocation.ts).
  // Khách chuyển thiếu ≤ ngưỡng này thì phiếu thu vẫn coi là ĐÃ ĐÓNG ĐỦ (ghi lại
  // phần tha để kế toán thấy) — tránh treo phiếu vì lệch vài nghìn do phí/làm tròn.
  // KHÔNG phải ngưỡng chấp nhận giao dịch: tiền về luôn được ghi nhận và phân bổ.
  "payment.roundingToleranceVnd": def({
    key: "payment.roundingToleranceVnd",
    group: "finance",
    label: "Dung sai làm tròn khi đối khớp thanh toán (VNĐ)",
    schema: z.number().int().min(0).max(100_000),
    default: 5_000,
    centerOverridable: true,
  }),
  // 03/08 — TTL của một phiên QR (QrSession.expiresAt). CHỈ dùng để hiển thị đồng hồ
  // đếm ngược + chặn 2 QR sống song song trên cùng phiếu thu. KHÔNG phải điều kiện
  // đối khớp: QR hết hạn mà phụ huynh vẫn chuyển thì tiền VẪN về đúng phiếu (matchKey
  // bền theo đời phiếu). Đừng biến key này thành cửa sổ nhận tiền.
  "payment.qrTtlMinutes": def({
    key: "payment.qrTtlMinutes",
    group: "finance",
    label: "Thời gian sống của mã QR (phút)",
    schema: z.number().int().min(1).max(1440),
    default: 10,
    centerOverridable: false,
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
  // ── Sinh nhật học viên (06/08/2026) ────────────────────────────────────────
  // Buổi TỔ CHỨC có thể rơi TRƯỚC ngày sinh nhật (hôm sinh nhật HV không có lớp),
  // nên mốc nhắc bám `celebrationDate`, KHÔNG bám ngày sinh nhật. Chủ dự án chốt
  // cho QLCS tự chỉnh số ngày báo trước tại /admin/cau-hinh-van-hanh.
  "student.birthdayAlertDaysBefore": def({
    key: "student.birthdayAlertDaysBefore",
    group: "student",
    label: "Báo trước buổi tổ chức sinh nhật (ngày)",
    schema: z.number().int().min(0).max(30),
    default: 3,
    centerOverridable: true,
  }),
  "student.birthdayLookaheadDays": def({
    key: "student.birthdayLookaheadDays",
    group: "student",
    label: "Cửa sổ quét sinh nhật sắp tới (ngày)",
    // Phải ≥ birthdayAlertDaysBefore, nếu không cron chưa kịp lập kế hoạch đã tới hạn báo.
    schema: z.number().int().min(1).max(60),
    default: 10,
    centerOverridable: false,
  }),
  "student.birthdayLookbackDays": def({
    key: "student.birthdayLookbackDays",
    group: "student",
    label: "Buổi tổ chức được lùi tối đa trước sinh nhật (ngày)",
    schema: z.number().int().min(0).max(30),
    default: 7,
    centerOverridable: true,
  }),
  // ── Nền Hệ thống P4 · US-13 · AC2 ──────────────────────────────────────────
  // Cutover đơn vị đo của phạm vi dữ liệu: `centerId` → `orgUnitId`.
  //
  // Ở ĐÂY chứ không ở env vì AC2 đòi rollback MỘT thao tác, KHÔNG cần deploy: đổi env
  // trên Vercel là phải redeploy, và suốt lúc chờ thì quyền vẫn sai. Sửa ở màn Cấu hình
  // là có audit + lý do bắt buộc sẵn.
  //
  // ⚠️ CHỈ BẬT khi `scripts/nen-p4-kiem-cong.ts` báo ĐẠT. Bật sớm = người dùng mất
  // quyền ở đúng những chỗ mà pha shadow chưa kịp đo (target chưa mang `orgUnitId` thì
  // resolver mới TỪ CHỐI — cố ý fail-closed, không rơi ngược về centerId).
  //
  // Rollback: đặt lại `false` — có hiệu lực trong ≤5 phút (TTL cache cấu hình), không deploy.
  "orgScope.cutoverEnabled": def({
    key: "orgScope.cutoverEnabled",
    group: "system",
    label: "Cutover phạm vi dữ liệu sang cây đơn vị (orgUnitId)",
    schema: z.boolean(),
    default: false,
    centerOverridable: false, // quyền không được lệch nhau giữa các cơ sở
  }),
  "student.birthdayZnsEnabled": def({
    key: "student.birthdayZnsEnabled",
    group: "student",
    label: "Gửi ZNS chúc mừng sinh nhật cho phụ huynh",
    schema: z.boolean(),
    // Tắt cờ này thì phần nhắc việc Sale/QLCS/GV VẪN chạy — chỉ ngưng tốn tiền tin nhắn.
    default: true,
    centerOverridable: false,
  }),
  // Template ZNS đọc từ DB để đổi mẫu không cần deploy (cùng mẫu zalo.znsTemplateOtp).
  // ⚠️ RỖNG = KHÔNG GỬI (skip an toàn). Mẫu "Chúc mừng sinh nhật" phải được Zalo DUYỆT
  // trước; đặt ID mẫu chưa duyệt vào đây thì mọi cú gửi hỏng — đúng vết mẫu 616899.
  // Duyệt xong PHẢI mở bảng tham số trên ZBS đối chiếu ZNS_BIRTHDAY_PARAM_SPEC rồi mới đặt.
  "zalo.znsTemplateBirthday": def({
    key: "zalo.znsTemplateBirthday",
    group: "student",
    // Ô sửa ở /admin/cau-hinh-van-hanh nhận JSON ⇒ giá trị chuỗi phải có nháy kép.
    // Nhắc ngay trong nhãn, nếu không người nhập gõ 616999 trần → JSON.parse ra SỐ → Zod chặn.
    label: 'Template ID ZNS chúc mừng sinh nhật — nhập dạng "616999", rỗng "" = không gửi',
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    default: "",
    centerOverridable: false,
  }),
  "crm.dedupWindowDays": def({
    key: "crm.dedupWindowDays",
    group: "crm",
    label: "Cửa sổ chống trùng lead (ngày)",
    schema: z.number().int().min(1).max(365),
    default: 90, // lib/crm/lead-qualify.ts & lib/lead/dedup.ts
    centerOverridable: false,
  }),
  // GĐ3 (chủ dự án chốt câu 5, 25/08/2026) — TRẦN số buổi học thử: siết về 4, nhưng
  // admin đổi được ở /admin/cau-hinh-van-hanh mà không cần deploy.
  //
  // ⚠️ KHÁC `TrialProgramConfig.sessionCount`: cái kia là SỐ BUỔI MẶC ĐỊNH của chương
  // trình (được snapshot vào từng lớp lúc tạo, nên lớp cũ giữ số cũ). Cái này là TRẦN
  // — chặn không cho nhập quá. Hai thứ khác nhau, đừng gộp.
  //
  // Dữ liệu cũ vượt trần KHÔNG bị đụng: trần chỉ kiểm lúc GHI MỚI. Siết rồi mà đi sửa
  // ngược dữ liệu đang chạy là đổi nghiệp vụ sau lưng người dùng.
  "crm.trialMaxSessions": def({
    key: "crm.trialMaxSessions",
    group: "crm",
    label: "Trần số buổi học thử mỗi ca",
    schema: z.number().int().min(1).max(60),
    default: 4,
    centerOverridable: true,
  }),
  // C-05 — CẢNH BÁO LEAD TREO. Quyết định 12(a) của chủ dự án (24/08/2026): vàng ≥ 2
  // ngày, đỏ ≥ 7 ngày, **cả hai `centerOverridable`** (nguyên văn: "không hardcode").
  //
  // ⚠️ Default ở đây phải BẰNG `STALE_LEAD_WARN_DAYS`/`STALE_LEAD_DANGER_DAYS` của
  // `lib/lead/stale-lead.ts` — file kia là hằng dùng khi CHƯA đọc được cấu hình (test
  // thuần, component client), file này là giá trị người vận hành sửa được. Hai chỗ lệch
  // nhau là bảng và cấu hình nói hai ngưỡng khác nhau; `registry.test.ts` ghim lại.
  //
  // ⚠️ KHÁC hẳn `crm.sla.*` ngay dưới: nhóm SLA đo phễu SR.QD.217 tính bằng PHÚT và
  // đếm từ mốc phễu; hai key này đếm NGÀY từ lần TIẾP CẬN gần nhất
  // (`lastLeadOutreachAt`, `lib/lead/activity-clock.ts`) — mốc khác, đơn vị khác.
  "crm.staleLeadWarnDays": def({
    key: "crm.staleLeadWarnDays",
    group: "crm",
    label: "Lead treo — cảnh báo VÀNG khi chưa tiếp cận (ngày)",
    // min 1: đặt 0 là mọi lead đỏ ngay lúc vừa vào hệ thống ⇒ cột cảnh báo thành nhiễu
    // trắng và người dùng tắt mắt với nó.
    schema: z.number().int().min(1).max(365),
    default: 2, // lib/lead/stale-lead.ts STALE_LEAD_WARN_DAYS
    centerOverridable: true,
  }),
  "crm.staleLeadDangerDays": def({
    key: "crm.staleLeadDangerDays",
    group: "crm",
    label: "Lead treo — cảnh báo ĐỎ khi chưa tiếp cận (ngày)",
    schema: z.number().int().min(1).max(365),
    default: 7, // lib/lead/stale-lead.ts STALE_LEAD_DANGER_DAYS
    centerOverridable: true,
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
  // AUTH-SĐT P0 §3.2 (chốt 29/07) — hạn mức CHI PHÍ, không phải hằng số kỹ thuật.
  // Mỗi tin ZNS = 300đ ⇒ trần 300 tin/ngày ≈ 90.000đ/ngày. Kill-switch là lưới
  // cuối: vượt ngưỡng này thì NGỪNG gửi hoàn toàn cho tới hết ngày.
  "otp.ipMaxPerHour": def({
    key: "otp.ipMaxPerHour",
    group: "otp",
    label: "Số lần xin mã tối đa / IP / giờ (đường công khai)",
    schema: z.number().int().min(1).max(100),
    default: 5,
    centerOverridable: false,
  }),
  "otp.globalDailyCap": def({
    key: "otp.globalDailyCap",
    group: "otp",
    label: "Trần số tin OTP gửi/ngày (toàn hệ thống)",
    schema: z.number().int().min(10).max(10000),
    default: 300,
    centerOverridable: false,
  }),
  "otp.globalKillSwitch": def({
    key: "otp.globalKillSwitch",
    group: "otp",
    label: "Ngưỡng tự ngắt gửi OTP (toàn hệ thống/ngày)",
    schema: z.number().int().min(10).max(20000),
    default: 500,
    centerOverridable: false,
  }),
  // AUTH-SĐT P4 — template ZNS đọc từ SystemSetting để ĐỔI MẪU KHÔNG CẦN DEPLOY
  // (Zalo bắt sửa mẫu là chuyện thường). Default = mẫu A "Xác thực" đã duyệt
  // 31/07 (QĐ-G). Tên tham số trong mẫu phải là `code` + `minutes` — lệch tên
  // là ZNS từ chối template_data (lộ ngay ở smoke dev-mode).
  // 07/08 — CHUYỂN 2 công tắc ZNS từ env sang DB để admin tự chỉnh, không cần deploy.
  // Cả hai VẪN đọc env làm dự phòng khi setting rỗng (không vỡ cấu hình đang chạy).
  //
  // ⚠️ Đây là 2 công tắc ĐỤNG TIỀN THẬT (400đ/tin) và ĐỤNG KHÁCH THẬT. Rỗng/false là
  // trạng thái AN TOÀN (không gửi), bật lên mới gửi — không bao giờ ngược lại.
  "zalo.znsTemplateAccount": def({
    key: "zalo.znsTemplateAccount",
    group: "otp",
    // Ô sửa nhận JSON ⇒ chuỗi phải có nháy kép: "616899", không phải 616899 trần.
    label: 'Template ID ZNS "Cấp tài khoản" (nhập dạng "616899")',
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    // Mẫu 616899 duyệt 01/08. GIỮ NGUYÊN giá trị kể cả khi tắt gửi — bật/tắt là việc
    // của `zalo.znsAccountEnabled`, không phải xoá trắng ô này rồi gõ lại (chốt 07/08).
    default: "616899",
    centerOverridable: false,
  }),
  "zalo.znsAccountEnabled": def({
    key: "zalo.znsAccountEnabled",
    group: "otp",
    label: 'Bật gửi ZNS "Cấp tài khoản" cho phụ huynh',
    schema: z.boolean(),
    // TẮT mặc định: chủ dự án chưa muốn cấp TK cho PH (chốt 07/08). Bật lên là tin
    // đi thật tới khách — 400đ/tin.
    default: false,
    centerOverridable: false,
  }),
  // S-2b (27/08/2026) — công tắc gửi tin Messenger ra khách. Ở registry chứ không ở
  // env để tắt gấp được mà không cần deploy (spec §2.3). TẮT mặc định: bật lên là mọi
  // lượt "Trả lời" đi THẬT tới phụ huynh. Tắt ⇒ tin vẫn ghi sổ nhưng mang trạng thái
  // `SIMULATED` và giao diện nói thẳng "khách KHÔNG nhận" — không bao giờ báo suông.
  "messenger.sendLive": def({
    key: "messenger.sendLive",
    group: "crm",
    label: "Gửi tin Messenger THẬT ra khách (tắt = mô phỏng, không gọi Meta)",
    schema: z.boolean(),
    default: false,
    centerOverridable: false,
  }),
  "zalo.znsLive": def({
    key: "zalo.znsLive",
    group: "otp",
    label: "Gửi ZNS THẬT (tắt = mô phỏng, không gọi Zalo, không tốn tiền)",
    schema: z.boolean(),
    // Mặc định false. Bật lên là MỌI ZNS đi thật, gồm cả OTP đăng nhập —
    // tắt đi thì phụ huynh KHÔNG nhận được mã đăng nhập.
    default: false,
    centerOverridable: false,
  }),
  "zalo.znsTemplateOtp": def({
    key: "zalo.znsTemplateOtp",
    group: "otp",
    label: "Template ID ZNS cho mã OTP (mẫu Xác thực đã duyệt)",
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    default: "616128",
    centerOverridable: false,
  }),
  // ─── US-14: báo tin nhắn mới cho phụ huynh qua ZNS (cron chat-zns-notify) ───
  // 400đ/tin, gửi cho KHÁCH THẬT ⇒ mọi ngưỡng/trần nằm ở đây để hạ/nâng không cần
  // deploy, và trạng thái AN TOÀN luôn là "không gửi" (false / rỗng / trần thấp).
  // ⚠️ Chỉ áp dụng cho nhóm lớp. Nhắn riêng (DM) KHÔNG BAO GIỜ gửi — luật cứng nằm
  // trong code (`lib/chat/zns-notify.ts`), KHÔNG có công tắc nào mở được.
  "chat.znsNotifyEnabled": def({
    key: "chat.znsNotifyEnabled",
    group: "chat",
    label: "Gửi ZNS báo tin nhắn mới trong nhóm lớp cho phụ huynh",
    schema: z.boolean(),
    // TẮT mặc định: bật lên là tin đi thật + tính tiền. Bật sau khi mẫu đã được duyệt
    // và đã điền `chat.znsTemplateNewMessage`.
    default: false,
    centerOverridable: false,
  }),
  "chat.znsTemplateNewMessage": def({
    key: "chat.znsTemplateNewMessage",
    group: "chat",
    // Ô sửa ở /admin/cau-hinh-van-hanh nhận JSON ⇒ chuỗi phải có nháy kép.
    label: 'Template ID ZNS "có tin nhắn mới" — nhập dạng "616999", rỗng "" = không gửi',
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    // RỖNG = KHÔNG GỬI (skip an toàn). Mẫu phải được Zalo DUYỆT và có ĐÚNG 3 tham số
    // className/senderName/time (ZNS_CHAT_NEW_MESSAGE_PARAM_SPEC) trước khi điền.
    default: "",
    centerOverridable: false,
  }),
  "chat.znsUnreadMinutes": def({
    key: "chat.znsUnreadMinutes",
    group: "chat",
    label: "Tin thường: phụ huynh chưa đọc bao nhiêu phút thì nhắc qua ZNS",
    schema: z.number().int().min(5).max(1440),
    default: 360, // 6 tiếng — chốt 09/08/2026
    centerOverridable: false,
  }),
  "chat.znsAnnouncementUnreadMinutes": def({
    key: "chat.znsAnnouncementUnreadMinutes",
    group: "chat",
    label: "Thông báo chính thức: chưa đọc bao nhiêu phút thì nhắc qua ZNS",
    // Ô RIÊNG (không dùng chung với tin thường) để hạ xuống 30 phút cho thông báo gấp
    // mà không phải deploy — chốt 09/08/2026.
    schema: z.number().int().min(5).max(1440),
    default: 360,
    centerOverridable: false,
  }),
  "chat.znsCooldownMinutes": def({
    key: "chat.znsCooldownMinutes",
    group: "chat",
    label: "Trần chống bão: mỗi phụ huynh chỉ nhận 1 ZNS/hội thoại trong bao nhiêu phút",
    schema: z.number().int().min(30).max(2880),
    default: 360,
    centerOverridable: false,
  }),
  "chat.znsMaxPerRun": def({
    key: "chat.znsMaxPerRun",
    group: "chat",
    label: "Trần số ZNS gửi trong một lượt cron (chống hoá đơn bất ngờ)",
    schema: z.number().int().min(1).max(500),
    default: 100,
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
  // R7-14 — phụ huynh xem điểm tổng quan bài tập/kiểm tra của con (mặc định TẮT;
  // PH chỉ thấy trạng thái đã giao/đã làm trừ khi bật key này). Không bao giờ lộ
  // nội dung câu hỏi cho PH — đó là kiểm soát ở tầng query (lib/portal/learning.ts).
  "homework.showScoreToParent": def({
    key: "homework.showScoreToParent",
    group: "lms",
    label: "Cho phụ huynh xem điểm tổng quan bài tập/kiểm tra",
    schema: z.boolean(),
    default: false,
    centerOverridable: true,
  }),
  // ── F-20 — hạn duyệt ảnh/video buổi học ────────────────────────────────
  // Mặc định "10h sáng ngày hôm sau" (spec F-20 + quyết định #7). Hai key rời chứ
  // không một chuỗi "10:00 D+1": trang cấu hình hiện ô JSON theo schema, số nguyên
  // validate được biên, chuỗi thì không.
  // ⚠️ GIỜ VN, không phải UTC — quy đổi nằm ở lib/lms/media-review-deadline.ts.
  // ⚠️ Hạn ĐÓNG BĂNG lúc folder duyệt sinh ra (F-20-2): đổi hai key này chỉ đổi
  // các folder MỚI, không viết lại hạn của quá khứ (nếu không báo cáo SLA F-30 sẽ
  // đổi kết quả của những tháng đã chốt mỗi lần ai đó chỉnh cấu hình).
  "media.reviewDeadlineHour": def({
    key: "media.reviewDeadlineHour",
    group: "media",
    label: "Giờ hạn duyệt ảnh/video buổi học (giờ VN, 0–23)",
    schema: z.number().int().min(0).max(23),
    default: 10, // spec F-20: 10h sáng
    centerOverridable: true,
  }),
  "media.reviewDeadlineOffsetDays": def({
    key: "media.reviewDeadlineOffsetDays",
    group: "media",
    label: "Hạn duyệt ảnh/video sau ngày dạy (số ngày, 0 = trong ngày)",
    schema: z.number().int().min(0).max(7),
    default: 1, // spec F-20: "ngày hôm sau"
    centerOverridable: true,
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
  // ── Nhận lead từ nguồn ngoài (form Sale, quatang) ───────────────────────
  // Đặt ở SystemSetting chứ KHÔNG ở env: theo QĐ-3 (16/08) MISA sẽ bị bỏ hẳn
  // sau khi lead chảy về ổn định. Ngày đó chỉ cần tắt 1 nút, không phải deploy.
  // Tắt = ngừng gửi bản sao sang MISA; Lead trong DB ta không đổi gì.
  "intake.mirrorMisa": def({
    key: "intake.mirrorMisa",
    group: "crm",
    label:
      "Gửi kèm bản sao phiếu nhập của Sale sang MISA (giai đoạn chuyển tiếp — tắt khi bỏ MISA)",
    schema: z.boolean(),
    default: true, // app/api/public/lead-intake/sale-form/route.ts
    centerOverridable: false,
  }),
  "intake.saleFormRateLimitMax": def({
    key: "intake.saleFormRateLimitMax",
    group: "crm",
    label: "Số phiếu nhập tối đa / phút / IP trên form Sale",
    schema: z.number().int().min(1).max(200),
    // Rộng hơn form khách (5) vì đây là NHÂN VIÊN nhập liên tiếp tại quầy/sự kiện.
    default: 30,
    centerOverridable: false,
  }),
  "intake.alertFailedPerHour": def({
    key: "intake.alertFailedPerHour",
    group: "crm",
    label: "Cảnh báo khi 1 nguồn lead có từng này phiếu LỖI trong 1 giờ",
    schema: z.number().int().min(1).max(1000),
    default: 3, // lib/lead/intake/health.ts
    centerOverridable: false,
  }),
  "intake.alertSilentHours": def({
    key: "intake.alertSilentHours",
    group: "crm",
    label: "Cảnh báo khi nguồn lead (vốn chạy đều) im lặng quá số giờ này",
    schema: z.number().int().min(1).max(168),
    // 24h: lưu lượng thật chỉ ~2 lead/ngày nên ngưỡng ngắn hơn chỉ đẻ báo động giả.
    default: 24,
    centerOverridable: false,
  }),
  // ── Cron nhắc lịch (hardcode remediation): cửa sổ quét + idempotency ──
  "cron.renewalReminderMinDays": def({
    key: "cron.renewalReminderMinDays",
    group: "cron",
    label: "Nhắc tái tục: từ N ngày trước khi hết khoá",
    schema: z.number().int().min(1).max(365),
    default: 13, // app/api/cron/renewal-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.renewalReminderMaxDays": def({
    key: "cron.renewalReminderMaxDays",
    group: "cron",
    label: "Nhắc tái tục: đến N ngày trước khi hết khoá",
    schema: z.number().int().min(1).max(365),
    default: 15, // app/api/cron/renewal-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.renewalReminderIdempotencyDays": def({
    key: "cron.renewalReminderIdempotencyDays",
    group: "cron",
    label: "Nhắc tái tục: không gửi lại trong N ngày",
    schema: z.number().int().min(1).max(365),
    default: 30, // app/api/cron/renewal-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.classReminderMinHours": def({
    key: "cron.classReminderMinHours",
    group: "cron",
    label: "Nhắc buổi học: từ N giờ trước buổi",
    schema: z.number().int().min(1).max(168),
    default: 12, // app/api/cron/class-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.classReminderMaxHours": def({
    key: "cron.classReminderMaxHours",
    group: "cron",
    label: "Nhắc buổi học: đến N giờ trước buổi",
    schema: z.number().int().min(1).max(168),
    default: 48, // app/api/cron/class-reminder/route.ts
    centerOverridable: false,
  }),
  // ── Dashboard việc cần xử lý (lib/pending-tasks.ts) ──
  "dashboard.pendingItemLimit": def({
    key: "dashboard.pendingItemLimit",
    group: "dashboard",
    label: "Số item hiển thị mỗi nhóm việc cần xử lý",
    schema: z.number().int().min(1).max(50),
    default: 6, // lib/pending-tasks.ts ITEM_LIMIT
    centerOverridable: false,
  }),
  "dashboard.pendingStaleDays": def({
    key: "dashboard.pendingStaleDays",
    group: "dashboard",
    label: "Số ngày coi việc cần xử lý là quá hạn",
    schema: z.number().int().min(1).max(30),
    default: 2, // lib/pending-tasks.ts TWO_DAYS_MS
    centerOverridable: false,
  }),
  // ── R7-08 — học bù liên cơ sở (QĐ-O2) ──
  "makeup.crossCenterEnabled": def({
    key: "makeup.crossCenterEnabled",
    group: "makeup",
    label: "Cho phép xếp học bù liên cơ sở",
    schema: z.boolean(),
    default: true, // QĐ-O2: liên cơ sở mặc định bật
    centerOverridable: true,
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

  // ─── TRẦN CHI PHÍ THÁNG cho lời gọi ra ngoài (chốt 27/08/2026) ────────────
  // Zalo 2tr · cước gọi 3tr · chấm điểm AI 1tr = 6tr/tháng. Chạm trần là DỪNG CỨNG
  // (`lib/ngan-sach-goi-ra/`), cảnh báo ở mốc 80%.
  //
  // Ba con số nằm ở ĐÂY chứ không ở env vì đó là cả yêu cầu: "phải có một con số
  // trước khi bật lời gọi ra ngoài", và con số đó tháng sau phải điều chỉnh được theo
  // thực tế mà không triển khai lại. Env đổi là phải deploy; ô này đổi có hiệu lực
  // trong ≤300s (TTL cache cấu hình) và có audit + lý do bắt buộc.
  //
  // KHÔNG có ô "tổng 6 triệu": tổng SUY RA từ ba trục (`tongTran()`). Khai tổng riêng
  // bên cạnh các phần là công thức tạo hai nguồn sự thật rồi để chúng trôi khỏi nhau —
  // đúng cái bẫy `COMMISSION_TIERS` đã dựng sẵn trong kho này.
  //
  // TRẦN = 0 nghĩa là TẮT trục đó (không phải "không giới hạn").
  "outbound.zaloMonthlyCapVnd": def({
    key: "outbound.zaloMonthlyCapVnd",
    group: "finance",
    label: "Trần chi phí tin nhắn Zalo mỗi tháng (đ) — 0 = tắt gửi Zalo",
    schema: z.number().int().min(0).max(500_000_000),
    default: 2_000_000,
    // Trần là chính sách tiền của công ty, không phải tham số vận hành của từng cơ sở.
    centerOverridable: false,
  }),
  "outbound.callMonthlyCapVnd": def({
    key: "outbound.callMonthlyCapVnd",
    group: "finance",
    label: "Trần cước gọi điện mỗi tháng (đ) — 0 = tắt gọi ra",
    schema: z.number().int().min(0).max(500_000_000),
    default: 3_000_000,
    centerOverridable: false,
  }),
  "outbound.aiGradingMonthlyCapVnd": def({
    key: "outbound.aiGradingMonthlyCapVnd",
    group: "finance",
    label: "Trần chi phí chấm điểm AI mỗi tháng (đ) — 0 = tắt chấm điểm AI",
    schema: z.number().int().min(0).max(500_000_000),
    default: 1_000_000,
    centerOverridable: false,
  }),
  "outbound.warnAtPercent": def({
    key: "outbound.warnAtPercent",
    group: "finance",
    label: "Cảnh báo khi ngân sách một trục dùng tới (%) — mặc định 80",
    // Chặn dưới 50%: đặt quá thấp thì cảnh báo kêu suốt và sẽ bị bỏ qua. Chặn trên
    // 99%: cảnh báo ở 100% là báo tang, không phải cảnh báo.
    schema: z.number().int().min(50).max(99),
    default: 80,
    centerOverridable: false,
  }),
  "outbound.znsUnitCostVnd": def({
    key: "outbound.znsUnitCostVnd",
    group: "finance",
    label: "Đơn giá ƯỚC TÍNH một tin ZNS (đ) — dùng để trừ vào trần Zalo",
    // ⚠️ ĐÂY LÀ ƯỚC TÍNH, KHÔNG PHẢI HOÁ ĐƠN. Giá thật khác nhau theo mẫu và theo
    // cách gửi (đo trên chính kho này: học phí 616258 = 700đ/SĐT · 490đ/UID; xác thực
    // 616128 và tài khoản 616899 = 400đ/280đ; `lib/observability/slo.ts` lại đang
    // dùng 300đ). Zalo KHÔNG trả về giá theo từng tin, nên không có cách nào biết
    // đúng ngoài đối chiếu hoá đơn cuối tháng.
    // 400đ = mẫu hay dùng nhất. Cách vận hành đúng: cuối tháng lấy hoá đơn Zalo chia
    // cho `chargeCount` của kỳ (bảng OutboundSpendCounter) rồi chỉnh ô này.
    schema: z.number().int().min(0).max(100_000),
    default: 400,
    centerOverridable: false,
  }),
  // ─── Trục gọi điện + ghi âm (OmiCall) ────────────────────────────────────
  // §2.3: thứ cần TẮT GẤP không được nằm trong env (tắt env phải deploy lại).
  // ⚠️ `revalidate` thật của cache setting là 300s — đừng hứa "tắt trong 5 giây".
  "calls.live": def({
    key: "calls.live",
    group: "crm",
    label: "Gọi API tổng đài THẬT (tắt = mô phỏng, không gọi nhà cung cấp)",
    schema: z.boolean(),
    // TẮT mặc định. Bật lên là chạm nhà cung cấp thật, tức chạm tiền cước và chạm
    // dữ liệu khách. Trạng thái an toàn luôn là "không gọi".
    default: false,
    centerOverridable: false,
  }),
  "calls.recordingAnnouncement": def({
    key: "calls.recordingAnnouncement",
    group: "crm",
    label: 'Lời thông báo ghi âm đầu cuộc gọi (rỗng "" = KHÔNG được ghi âm)',
    schema: z.string(),
    // PL-2 (Luật 91/2025 + NĐ 15/2020): tổng đài tự động ghi âm PHẢI thông báo rõ
    // ràng trước khi ghi. Để ở đây vì câu chữ là việc của pháp chế/vận hành, đổi
    // không cần deploy. RỖNG là trạng thái an toàn: chưa có lời thông báo thì
    // `quyetDinhGhiAm()` trả `NOT_ANNOUNCED` và không ghi âm.
    default:
      "Cuộc gọi này có thể được ghi âm nhằm nâng cao chất lượng phục vụ. " +
      "Nếu quý khách không đồng ý, vui lòng báo với nhân viên để chúng tôi tắt ghi âm.",
    centerOverridable: false,
  }),
  "calls.recordingRetentionMonths": def({
    key: "calls.recordingRetentionMonths",
    group: "crm",
    label: "Số tháng giữ tệp ghi âm trước khi xoá (0 = không đặt hạn)",
    schema: z.number().int().min(0).max(60),
    // OC-20 đề xuất 12 tháng — ❓ CHỜ CHỐT. Câu hỏi LS-3 (giọng nói có phải dữ liệu
    // sinh trắc học theo NĐ 356/2025 không) chưa có lời đáp; nếu CÓ thì con số này
    // phải xét lại cùng cả hồ sơ DPIA.
    default: 12,
    centerOverridable: false,
  }),
  "calls.minTalkSecondsForContacted": def({
    key: "calls.minTalkSecondsForContacted",
    group: "crm",
    label: 'Số giây đàm thoại tối thiểu để tính là "đã liên hệ"',
    schema: z.number().int().min(0).max(600),
    // QT-37 — chống bấm gọi rồi cúp ngay để tắt cảnh báo SLA. Mặc định 10 giây
    // theo đề xuất của BA.
    default: 10,
    centerOverridable: false,
  }),
  "calls.listenUrlTtlSeconds": def({
    key: "calls.listenUrlTtlSeconds",
    group: "crm",
    label: "Số giây sống của liên kết nghe ghi âm",
    schema: z.number().int().min(30).max(3600),
    // OC-17 — chuẩn hiện hành của repo là 600s. Ngắn hơn thì người nghe hết hạn
    // giữa chừng; dài hơn thì một liên kết bị chuyển tiếp sống quá lâu.
    default: 600,
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
