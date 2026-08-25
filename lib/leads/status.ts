import type { LeadStatus } from "@prisma/client";

// =============================================================================
// LEAD PIPELINE — Phase T1.1
//
// GĐ0 (25/08/2026) — NGUỒN SỰ THẬT DUY NHẤT cho trạng thái lead.
// Trước GĐ0, nhãn/màu/danh sách hợp lệ/danh sách "đã kết thúc" bị chép ở 6 nơi
// với nội dung lệch nhau (bảng nhãn ở dashboard thiếu 2 giá trị và gọi ENROLLED
// là "Đã đăng ký" trong khi REGISTERED mới là "Đã đăng ký"). Mọi bản chép đã
// được gỡ; chỗ nào cần bảng tra cứu thì import từ đây.
//
// ⚠️ Thêm/bớt giá trị enum: sửa LEAD_STATUS_VALUES rồi để TypeScript dẫn đường —
// mọi `Record<LeadStatus, …>` bên dưới sẽ đỏ cho tới khi khai đủ. Riêng các MẢNG
// thì TS không bắt được, đó là việc của lib/leads/status.test.ts.
// =============================================================================

/**
 * Bộ giá trị LeadStatus theo thứ tự phễu SR.QD.217.
 * `as const` để dùng trực tiếp làm tuple cho `z.enum(...)` — nhờ vậy schema Zod
 * không còn phải chép tay 15 chuỗi (trước GĐ0 có 2 bản chép, lệch thứ tự nhau).
 */
export const LEAD_STATUS_VALUES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "NO_ANSWER",
  "CONSULTING",
  "TRIAL_SCHEDULED",
  "TRIAL_ATTENDED",
  "TRIAL_IN_PROGRESS",
  "AWAITING_DECISION",
  "REGISTERED",
  "ENROLLED",
  "NURTURING",
  "LOST",
  "DUPLICATE",
  "DEMO_SCHEDULED",
] as const satisfies readonly LeadStatus[];

/** Status hợp lệ cho filter + chuyển đổi (gồm cả deprecated để lọc data cũ nếu còn). */
export const ALL_LEAD_STATUSES: LeadStatus[] = [...LEAD_STATUS_VALUES];

// ─── Nhãn ────────────────────────────────────────────────────────────────────

/** Nhãn đầy đủ — dùng ở bảng, thẻ, chi tiết lead. */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Mới",
  ASSIGNED: "Đã phân công",
  CONTACTED: "Đã liên hệ",
  NO_ANSWER: "Không nghe máy",
  CONSULTING: "Đang tư vấn",
  TRIAL_SCHEDULED: "Đã hẹn học thử",
  TRIAL_ATTENDED: "Đã học thử",
  TRIAL_IN_PROGRESS: "Đang học thử",
  AWAITING_DECISION: "Chờ quyết định",
  REGISTERED: "Đã đăng ký",
  ENROLLED: "Đã ghi danh",
  NURTURING: "Đang nuôi dưỡng",
  LOST: "Đã mất",
  DUPLICATE: "Trùng lặp",
  DEMO_SCHEDULED: "Đã hẹn demo (cũ)",
};

/**
 * Nhãn rút gọn cho trục biểu đồ và phễu (chuyển từ lib/reports/lead.ts về đây).
 * Cố ý KHÁC nhãn đầy đủ: trục biểu đồ hẹp, "Đang nuôi dưỡng" bị cắt chữ.
 */
export const LEAD_STATUS_LABEL_SHORT: Record<LeadStatus, string> = {
  NEW: "Mới",
  ASSIGNED: "Đã phân",
  CONTACTED: "Đã liên hệ",
  NO_ANSWER: "Không nghe máy",
  CONSULTING: "Đang tư vấn",
  TRIAL_SCHEDULED: "Hẹn học thử",
  TRIAL_IN_PROGRESS: "Đang học thử",
  TRIAL_ATTENDED: "Đã học thử",
  AWAITING_DECISION: "Chờ quyết định",
  REGISTERED: "Đã đăng ký",
  ENROLLED: "Đã ghi danh",
  NURTURING: "Đang nuôi dưỡng",
  LOST: "Thất bại",
  DUPLICATE: "Trùng",
  DEMO_SCHEDULED: "Hẹn demo (cũ)",
};

// ─── Màu ─────────────────────────────────────────────────────────────────────

export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  NEW: "bg-sky-100 text-sky-700",
  ASSIGNED: "bg-cyan-100 text-cyan-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  NO_ANSWER: "bg-amber-100 text-amber-700",
  CONSULTING: "bg-indigo-100 text-indigo-700",
  TRIAL_SCHEDULED: "bg-violet-100 text-violet-700",
  TRIAL_ATTENDED: "bg-purple-100 text-purple-700",
  TRIAL_IN_PROGRESS: "bg-violet-100 text-violet-800",
  AWAITING_DECISION: "bg-orange-100 text-orange-700",
  REGISTERED: "bg-emerald-100 text-emerald-700",
  ENROLLED: "bg-green-100 text-green-700",
  NURTURING: "bg-yellow-100 text-yellow-700",
  LOST: "bg-red-100 text-red-700",
  DUPLICATE: "bg-gray-200 text-gray-600",
  DEMO_SCHEDULED: "bg-purple-100 text-purple-700",
};

// Top border accent cho Kanban column header.
export const LEAD_STATUS_ACCENT: Record<LeadStatus, string> = {
  NEW: "border-sky-400",
  ASSIGNED: "border-cyan-400",
  CONTACTED: "border-blue-400",
  NO_ANSWER: "border-amber-400",
  CONSULTING: "border-indigo-400",
  TRIAL_SCHEDULED: "border-violet-400",
  TRIAL_ATTENDED: "border-purple-400",
  TRIAL_IN_PROGRESS: "border-violet-500",
  AWAITING_DECISION: "border-orange-400",
  REGISTERED: "border-emerald-500",
  ENROLLED: "border-green-500",
  NURTURING: "border-yellow-400",
  LOST: "border-red-400",
  DUPLICATE: "border-gray-300",
  DEMO_SCHEDULED: "border-purple-300",
};

/** Sắc thái cho <StatusBadge> ở dashboard quản lý. */
export type LeadStatusVariant = "success" | "warning" | "error" | "info" | "neutral";

export const LEAD_STATUS_VARIANT: Record<LeadStatus, LeadStatusVariant> = {
  NEW: "info",
  ASSIGNED: "info",
  CONTACTED: "warning",
  NO_ANSWER: "warning",
  CONSULTING: "info",
  TRIAL_SCHEDULED: "info",
  TRIAL_ATTENDED: "info",
  TRIAL_IN_PROGRESS: "info",
  AWAITING_DECISION: "warning",
  REGISTERED: "success",
  ENROLLED: "success",
  NURTURING: "warning",
  LOST: "error",
  DUPLICATE: "neutral",
  DEMO_SCHEDULED: "info",
};

/** Chấm/thanh màu đặc cho biểu đồ cột trạng thái ở màn marketing. */
export const LEAD_STATUS_DOT: Record<LeadStatus, string> = {
  NEW: "bg-state-info",
  ASSIGNED: "bg-state-info",
  CONTACTED: "bg-state-warning",
  NO_ANSWER: "bg-state-warning",
  CONSULTING: "bg-state-info",
  TRIAL_SCHEDULED: "bg-primary",
  TRIAL_ATTENDED: "bg-primary",
  TRIAL_IN_PROGRESS: "bg-primary",
  AWAITING_DECISION: "bg-primary",
  REGISTERED: "bg-state-success",
  ENROLLED: "bg-state-success",
  NURTURING: "bg-primary",
  LOST: "bg-gray-400",
  DUPLICATE: "bg-gray-300",
  DEMO_SCHEDULED: "bg-primary",
};

// ─── Tập con ─────────────────────────────────────────────────────────────────

// Cột Kanban hiển thị (theo thứ tự vận hành). KHÔNG show DEMO_SCHEDULED (deprecated).
// NHÓM 03 — Việc 1: thêm REGISTERED (đã đăng ký — đã có khoản Sale ghi nhận, chưa
// convert) sau AWAITING_DECISION, trước ENROLLED (= "đã chốt/convert" trong pipeline
// này — schema KHÔNG có status CONVERTED riêng, ENROLLED đóng vai trò đó). Vị trí theo
// phễu SR.QD.217; đổi vị trí = đổi thứ tự mảng (final chờ câu 38 phiếu xác nhận).
export const KANBAN_COLUMNS: LeadStatus[] = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "NO_ANSWER",
  "CONSULTING",
  "TRIAL_SCHEDULED",
  "TRIAL_IN_PROGRESS",
  "TRIAL_ATTENDED",
  "AWAITING_DECISION",
  "REGISTERED",
  "ENROLLED",
  "NURTURING",
  "LOST",
  "DUPLICATE",
];

/**
 * Lead đã ĐÓNG HẲN — không còn là việc đang mở của sale.
 * Dùng cho: đếm tải round-robin, lọc ứng viên bàn giao, đếm "lead đang mở" ở CRM.
 *
 * ⚠️ CỐ Ý KHÔNG có REGISTERED: lead đã ghi nhận tiền vẫn còn việc phải làm
 * (xếp lớp, chốt convert) nên vẫn tính là tải của sale.
 */
export const LEAD_CLOSED_STATUSES: LeadStatus[] = ["ENROLLED", "LOST", "DUPLICATE"];

/**
 * Lead đã RỜI PHỄU tư vấn — tự động hoá không được đẩy trạng thái nữa.
 * Dùng cho: module học thử (tiến độ điểm danh KHÔNG được kéo ngược trạng thái của
 * lead đã đăng ký), và mọi nơi khác cần "sale tự quản từ đây".
 *
 * Khác LEAD_CLOSED_STATUSES đúng một giá trị: REGISTERED. Trước GĐ0 hai tập này
 * nằm ở 5 file rời và không ai biết vì sao chúng lệch nhau.
 */
export const LEAD_PIPELINE_EXIT_STATUSES: LeadStatus[] = [
  "REGISTERED",
  ...LEAD_CLOSED_STATUSES,
];

/**
 * Bậc phễu chuyển đổi của dashboard CRM (chuyển từ app/(admin)/admin/crm/page.tsx).
 *
 * ⚠️ Bản chép cũ ở màn CRM BỎ SÓT `TRIAL_IN_PROGRESS` và `REGISTERED`: lead đang học
 * thử dở và lead ĐÃ GHI NHẬN TIỀN không rơi vào bậc nào, nên cột "Học thử" và "Đã chốt"
 * đếm THIẾU. GĐ0 vá luôn — hệ quả: hai cột đó sẽ tăng so với số cũ, và "Đã chốt" nay
 * khớp với `CONVERTED_STATUSES` mà báo cáo Lead vẫn dùng (trước đó hai màn lệch nhau).
 * Lưới chặn tái diễn nằm ở lib/leads/status.test.ts.
 */
export const LEAD_FUNNEL_STAGES: { name: string; statuses: LeadStatus[] }[] = [
  { name: "Lead mới", statuses: ["NEW", "ASSIGNED"] },
  {
    name: "Đã liên hệ",
    statuses: ["CONTACTED", "CONSULTING", "NO_ANSWER", "NURTURING"],
  },
  {
    name: "Học thử",
    statuses: [
      "TRIAL_SCHEDULED",
      "TRIAL_IN_PROGRESS",
      "TRIAL_ATTENDED",
      "DEMO_SCHEDULED",
    ],
  },
  { name: "Chờ quyết định", statuses: ["AWAITING_DECISION"] },
  { name: "Đã chốt", statuses: ["REGISTERED", "ENROLLED"] },
];

/**
 * Status CỐ Ý nằm ngoài phễu: lead rớt và bản ghi trùng không phải một bậc chuyển đổi.
 * Khai tường minh để test phân biệt được "bỏ sót" với "loại có chủ đích".
 */
export const LEAD_FUNNEL_EXCLUDED: LeadStatus[] = ["LOST", "DUPLICATE"];

/**
 * Status coi là ĐÃ CHỐT (chuyển đổi thành công) cho báo cáo phễu.
 * Kiểu ReadonlySet<string> có chủ đích: call-site nhận `status: string` từ record
 * phẳng đã select sẵn, không phải LeadStatus đã narrow.
 */
export const CONVERTED_STATUSES: ReadonlySet<string> = new Set<string>([
  "ENROLLED",
  "REGISTERED",
] satisfies LeadStatus[]);

export function leadStatusLabel(status: LeadStatus | string): string {
  return LEAD_STATUS_LABEL[status as LeadStatus] ?? String(status);
}

// =============================================================================
// R7-01 — Transition guard (permissive; chỉ chặn case REGISTERED có điều kiện C4).
// =============================================================================

/**
 * Kiểm tra chuyển trạng thái lead có hợp lệ không.
 * PERMISSIVE: cho phép mọi chuyển đổi giữa các status hiện hữu, TRỪ:
 *  - to === "REGISTERED": chỉ hợp lệ khi from === "AWAITING_DECISION" và đã có khoản ghi nhận.
 *  - from === to: no-op, luôn ok.
 */
export function canTransitionLeadStatus(
  from: LeadStatus,
  to: LeadStatus,
  opts: { hasRecordedPayment: boolean },
): { ok: boolean; reason?: string } {
  if (from === to) return { ok: true };

  if (to === "REGISTERED") {
    if (from === "AWAITING_DECISION" && opts.hasRecordedPayment === true) {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        "Chỉ chuyển sang 'Đã đăng ký' từ 'Chờ quyết định' khi đã có khoản ghi nhận",
    };
  }

  return { ok: true };
}
