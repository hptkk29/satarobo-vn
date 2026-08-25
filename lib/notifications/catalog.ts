// lib/notifications/catalog.ts — NGUỒN SỰ THẬT DUY NHẤT phân loại thông báo nhân sự.
//
// PRD (§7.4) đòi mỗi loại thông báo khai đủ 6 trường: mã · nhóm · mức · người nhận · deep-link ·
// dedupeKey. Repo đã có ~17 nơi sinh `StaffNotification`, mỗi nơi tự nối chuỗi `dedupeKey` và tự
// chọn `href`, không nơi nào khai nhóm/mức. File này là chỗ khai bù, và từ nay là chỗ DUY NHẤT
// được quyết nhóm + mức của một thông báo.
//
// VÌ SAO KHOÁ THEO TIỀN TỐ `dedupeKey` chứ không theo một mã loại mới:
// `dedupeKey` là thứ ĐANG có thật trong DB prod và có `@@unique([userId, dedupeKey])`. Đặt một hệ
// mã song song rồi ánh xạ hai chiều là thêm một nguồn lệch. Đổi FORMAT dedupeKey của loại đang chạy
// còn tệ hơn: mọi bản ghi cũ thành mồ côi (không bao giờ được `update` nữa) và người dùng ăn một
// đợt thông báo trùng. Nên: giữ nguyên khoá, khai nghĩa cho khoá.
//
// THUẦN — không import DB, không import React. Test bằng Vitest không cần dựng gì.

import { isPendingSyncKey } from "./pending-sync";

// ─── 5 nhóm của PRD §7.4 ────────────────────────────────────────────────────────

/**
 * Màu nhận diện nhóm ghi bằng HEX chứ không dùng token Tailwind — CÓ CHỦ ĐÍCH.
 * Site admin (tím #610B8A) và site giáo viên (cam #C2410C) có hệ token riêng, nên cùng một token
 * ra hai màu khác nhau ở hai nơi. Nhóm thông báo là DANH TÍNH: "vạch đỏ = đến hạn" phải giống hệt
 * nhau ở mọi site, nếu không người dùng phải học lại bảng màu mỗi lần đổi màn.
 * Màu chỉ là kênh phụ — mỗi nhóm luôn kèm NHÃN CHỮ (yêu cầu tiếp cận của PRD §7.15).
 */
export const NOTI_GROUPS = [
  {
    key: "action_required",
    color: "#4B5BD7",
    label: "Cần thực hiện",
    // "Tôi đang chặn người khác / hệ thống đang chờ tôi."
    hint: "Việc đang chờ chính tôi xử lý",
  },
  {
    key: "parent_message",
    color: "#E08A00",
    label: "Tin nhắn PH",
    hint: "Có phụ huynh đang chờ trả lời",
  },
  {
    key: "new_task",
    color: "#0E9B8E",
    label: "Việc mới",
    hint: "Vừa được giao thêm việc",
  },
  {
    key: "due_date",
    color: "#D93A2B",
    label: "Đến hạn",
    hint: "Sắp trễ hoặc đã trễ",
  },
  {
    key: "system",
    color: "#5B6472",
    label: "Hệ thống",
    hint: "Nên biết, không cần làm gì ngay",
  },
] as const;

export type NotiGroupKey = (typeof NOTI_GROUPS)[number]["key"];

const GROUP_KEY_SET: ReadonlySet<string> = new Set(NOTI_GROUPS.map((g) => g.key));

export function isNotiGroupKey(value: string): value is NotiGroupKey {
  return GROUP_KEY_SET.has(value);
}

export function notiGroupLabel(key: string): string {
  return NOTI_GROUPS.find((g) => g.key === key)?.label ?? "Khác";
}

// ─── Mức ưu tiên ────────────────────────────────────────────────────────────────

/** 1 = khẩn · 2 = thường · 3 = tham khảo. Trùng thang P1/P2/P3 của PRD. */
export type NotiPriority = 1 | 2 | 3;

/**
 * Loại đối tượng đích. Dùng để (a) thu hồi thông báo khi đối tượng bị xoá, (b) sau này dựng
 * deep-link theo host mà không phải đoán từ chuỗi href.
 */
export type NotiEntityType =
  | "class"
  | "session"
  | "lead"
  | "student"
  | "enrollment"
  | "conversation"
  | "parent_request"
  | "work_request"
  | "timesheet"
  | "media"
  | "report_card"
  | "payment"
  | "trial"
  | "center"
  | "marketing"
  | "integration";

// ─── Bảng khai ─────────────────────────────────────────────────────────────────

interface NotiDef {
  /** Nhóm hiển thị trong panel. */
  group: NotiGroupKey;
  /** Mức mặc định. Khoá `:overdue` của vòng việc tồn luôn được nâng lên 1 — xem `classifyNotification`. */
  priority: NotiPriority;
  /** Đối tượng đích. */
  entity: NotiEntityType;
  /** Ai nhận — chỉ để đọc hiểu, không dùng lúc chạy. Đây là trường "người nhận" mà PRD đòi. */
  recipients: string;
  /** Đích đến mong đợi — chỉ để đọc hiểu; href thật do nơi sinh dựng. */
  target: string;
}

/**
 * Khai theo TIỀN TỐ `dedupeKey`. Khớp theo tiền tố DÀI NHẤT (xem `classifyNotification`), nên
 * `payment-reconcile:unmatched:` thắng `payment-reconcile:` nếu sau này có mục chung.
 *
 * Thêm nguồn sinh thông báo mới BẮT BUỘC thêm một dòng ở đây, nếu không nó rơi về nhóm "Hệ thống"
 * mức P3 — tức nằm chót panel và không bao giờ được ai chú ý. Test `catalog.test.ts` khoá danh sách
 * tiền tố đang chạy thật để việc quên không đi lọt.
 */
const BY_PREFIX: Readonly<Record<string, NotiDef>> = {
  // ── Vòng đồng bộ việc tồn (lib/pending-tasks.ts → lib/staff-notifications.ts) ──
  "class_approval:": {
    group: "action_required", priority: 2, entity: "class",
    recipients: "Người có quyền duyệt lớp", target: "/classes?status=PENDING_APPROVAL",
  },
  "timesheet_adjust:": {
    group: "action_required", priority: 2, entity: "timesheet",
    recipients: "Quản lý chấm công", target: "/cham-cong/chinh-cong",
  },
  "parent_request:": {
    group: "action_required", priority: 1, entity: "parent_request",
    recipients: "CSKH / Quản lý cơ sở", target: "/parent-requests",
  },
  "media_approval:": {
    group: "action_required", priority: 2, entity: "media",
    recipients: "Người duyệt ảnh lớp", target: "/media",
  },
  "session_incomplete:": {
    group: "action_required", priority: 1, entity: "session",
    recipients: "Giáo viên phụ trách buổi", target: "/sessions",
  },
  "center_checklist:": {
    group: "action_required", priority: 1, entity: "center",
    recipients: "Quản lý cơ sở", target: "/cham-cong/checklist-co-so",
  },
  "lead_followup:": {
    group: "action_required", priority: 1, entity: "lead",
    recipients: "Tư vấn viên phụ trách lead", target: "/leads",
  },
  "renewal:": {
    group: "due_date", priority: 2, entity: "enrollment",
    recipients: "Tư vấn viên / CSKH", target: "/students/sap-het-khoa",
  },
  "student_risk:": {
    group: "action_required", priority: 2, entity: "student",
    recipients: "CSKH phụ trách học viên", target: "/canh-bao-rui-ro",
  },
  "student_care:": {
    group: "new_task", priority: 2, entity: "student",
    recipients: "Người được giao việc chăm sóc", target: "/cham-soc-hv",
  },
  "student_birthday:": {
    group: "system", priority: 3, entity: "student",
    recipients: "CSKH + giáo viên lớp", target: "/sinh-nhat",
  },
  "class_no_teacher:": {
    group: "action_required", priority: 1, entity: "class",
    recipients: "Quản lý cơ sở / Đào tạo", target: "/sessions",
  },
  // ⚠️ `status=` phải là giá trị LeadStatus CÒN SỐNG: màn /leads bỏ qua giá trị lạ
  // KHÔNG báo lỗi, nên link cũ (?status=REGISTERED) mở ra TOÀN BỘ danh sách lead —
  // trông như bộ lọc chạy đúng mà thật ra không lọc gì.
  "registered_stale:": {
    group: "action_required", priority: 2, entity: "lead",
    recipients: "Tư vấn viên phụ trách lead", target: "/leads?status=DA_DANG_KY",
  },
  "report_card_milestone:": {
    group: "due_date", priority: 2, entity: "report_card",
    recipients: "Giáo viên phụ trách lớp", target: "/report-cards",
  },

  // ── Sinh từ sự kiện: lớp & buổi học ──
  "class.session_changed:": {
    group: "system", priority: 2, entity: "class",
    recipients: "Giáo viên phụ trách lớp", target: "/classes/<classId>/edit",
  },
  "class.cancelled:": {
    group: "system", priority: 2, entity: "class",
    recipients: "Giáo viên phụ trách lớp", target: "/classes/<classId>/edit",
  },
  "session.taught:": {
    group: "system", priority: 3, entity: "session",
    recipients: "Giáo viên dạy buổi đó", target: "/sessions/<sessionId>",
  },
  // Điểm danh bị người khác sửa hồi tố — giáo viên phải kiểm lại, đây là việc chứ không phải tin.
  "attendance.edited:": {
    group: "action_required", priority: 2, entity: "session",
    recipients: "Giáo viên chính của lớp", target: "/attendance?sessionId=<id>",
  },
  // Lịch dạy thay ngày mai — đổi ca của chính mình.
  "session.substitute:": {
    group: "system", priority: 2, entity: "session",
    recipients: "Giáo viên dạy thay", target: "/lich",
  },
  // Buổi đã kết thúc mà chưa chốt — đây là hạn chót thật.
  "session.close-reminder:": {
    group: "due_date", priority: 1, entity: "session",
    recipients: "Giáo viên phụ trách buổi", target: "/lich",
  },

  // ── Sinh từ sự kiện: lead & học thử ──
  "lead.trialAttended:": {
    group: "new_task", priority: 2, entity: "lead",
    recipients: "Tư vấn viên phụ trách lead", target: "/leads/<leadId>",
  },
  "trial.assigned:": {
    group: "new_task", priority: 2, entity: "trial",
    // Người nhận là SALE, KHÔNG phải giáo viên: producer lấy `lead.assignedToId` (rơi về admin
    // lead nếu trống) — lib/_handlers/trial-notif.ts. Khai nhầm ở đây làm người rà deep-link kết
    // luận loại này gãy trên site giáo viên rồi đi sửa nhầm chỗ.
    recipients: "Tư vấn viên phụ trách lead (không có thì admin lead)", target: "/leads/<leadId>",
  },
  "trial.schedule_changed:": {
    group: "system", priority: 2, entity: "trial",
    // Cũng là SALE (lib/_handlers/trial-schedule-notif.ts), không phải giáo viên.
    recipients: "Tư vấn viên phụ trách lead (không có thì admin lead)", target: "/leads/<leadId>",
  },
  "trial-v1.assigned:": {
    group: "new_task", priority: 2, entity: "trial",
    recipients: "Giáo viên được phân buổi học thử", target: "/lop-trial/lich-hen",
  },
  "trial-class.assigned:": {
    group: "new_task", priority: 2, entity: "trial",
    recipients: "Giáo viên được phân lớp học thử", target: "/lop-trial",
  },
  // Buổi ad-hoc thêm tay vào lớp trải nghiệm (addTrialSession) — GV được gán buổi đó.
  // Cùng mức với hai loại trên: là ca dạy vừa rơi vào lịch của mình, không phải tin để biết.
  "trial-session.assigned:": {
    group: "new_task", priority: 2, entity: "trial",
    recipients: "Giáo viên được phân buổi trải nghiệm", target: "/lop-trial",
  },
  // ── GĐ3 — luồng giáo viên theo TỪNG CA (không phải theo lớp) ────────────────
  "trial-case.assigned:": {
    group: "new_task", priority: 2, entity: "trial",
    recipients: "Giáo viên được Đào tạo phân công một ca trải nghiệm", target: "/lop-trial",
  },
  // Lịch bị dời ⇒ giáo viên MẤT ca đang cầm. Ưu tiên cao hơn tin "được phân công":
  // biết muộn là tới lớp thừa hoặc bỏ trống ca đã hẹn với phụ huynh.
  "trial-case.rescheduled:": {
    group: "new_task", priority: 3, entity: "trial",
    recipients: "Giáo viên vừa bị gỡ phân công do dời lịch", target: "/lop-trial",
  },
  "trial.cho-phan-cong:": {
    group: "new_task", priority: 2, entity: "trial",
    recipients: "Bộ phận Đào tạo (ca trải nghiệm chưa có giáo viên)", target: "/lop-trial",
  },
  // GĐ6 — nhắc Sale trước buổi để Sale tự nhắn phụ huynh qua Zalo cá nhân. Hệ thống
  // KHÔNG gửi tin tự động cho phụ huynh; đây là chốt nghiệp vụ, không phải giới hạn
  // kỹ thuật. Xếp nhóm "due_date" vì đây là việc CÓ HẠN, không phải việc mới rơi xuống.
  "trial.reminder:": {
    group: "due_date", priority: 2, entity: "trial",
    recipients: "Sale phụ trách lead (không có thì admin lead)", target: "/leads/<leadId>",
  },
  // Vi phạm SLA chăm lead — theo PRD đây là "đã trễ", không phải "việc mới".
  "sla:": {
    group: "due_date", priority: 1, entity: "lead",
    recipients: "Tư vấn viên phụ trách + Quản lý", target: "/leads/<leadId>",
  },

  // ── Sinh từ sự kiện: phụ huynh ──
  "conversation.message_posted:": {
    group: "parent_message", priority: 2, entity: "conversation",
    recipients: "Giáo viên chính + trợ giảng của lớp", target: "/tin-nhan?c=<conversationId>",
  },
  "parent_request.created:": {
    group: "action_required", priority: 1, entity: "parent_request",
    recipients: "CSKH / Quản lý cơ sở", target: "/parent-requests",
  },
  "parent_request.reminder:": {
    group: "action_required", priority: 1, entity: "parent_request",
    recipients: "CSKH / Quản lý cơ sở", target: "/parent-requests",
  },

  // ── Sinh từ sự kiện: học viên & tiền ──
  "reserve.expired:": {
    group: "action_required", priority: 2, entity: "student",
    recipients: "CSKH phụ trách học viên", target: "/students/<studentId>/edit",
  },
  "reserve-expiry:": {
    group: "action_required", priority: 2, entity: "student",
    recipients: "CSKH phụ trách học viên", target: "/students/<studentId>/edit",
  },
  "payment-reconcile:unmatched:": {
    group: "action_required", priority: 1, entity: "payment",
    recipients: "Kế toán", target: "/bien-dong-so-du?status=unmatched",
  },
  "payment-reconcile:overdue-partial:": {
    group: "action_required", priority: 1, entity: "payment",
    recipients: "Kế toán", target: "/cong-no",
  },

  // ── Sinh từ sự kiện: marketing & tích hợp ──
  "cost-unconfirmed:": {
    group: "action_required", priority: 2, entity: "marketing",
    recipients: "Marketing", target: "/marketing/funnel",
  },
  // Đến hạn chốt sổ mà chưa nộp báo cáo — PRD xếp ACTION.REPORT_MISSING là P1.
  "report-missing:": {
    group: "action_required", priority: 1, entity: "marketing",
    recipients: "Marketing", target: "/marketing/funnel",
  },
  // Nguồn lead hỏng/im lặng = tiền quảng cáo đang chảy vào hư không ⇒ khẩn.
  "intake-failing:": {
    group: "system", priority: 1, entity: "integration",
    recipients: "SUPER_ADMIN", target: "/crm/webhook-replay",
  },
  "intake-silent:": {
    group: "system", priority: 1, entity: "integration",
    recipients: "SUPER_ADMIN", target: "/crm/webhook-replay",
  },
  "birthday:": {
    group: "system", priority: 3, entity: "student",
    recipients: "CSKH + giáo viên lớp", target: "/sinh-nhat",
  },
};

/** Danh sách tiền tố đã sắp DÀI TRƯỚC — khớp tiền tố dài nhất, tính sẵn một lần. */
const PREFIXES_LONGEST_FIRST: readonly string[] = Object.keys(BY_PREFIX).sort(
  (a, b) => b.length - a.length,
);

/** Khai báo dùng khi không khớp tiền tố nào: rơi xuống đáy panel, không gây ồn. */
const FALLBACK: NotiDef = {
  group: "system",
  priority: 3,
  entity: "integration",
  recipients: "(chưa khai trong catalog)",
  target: "(chưa khai trong catalog)",
};

export interface NotiClassification {
  groupKey: NotiGroupKey;
  priority: NotiPriority;
  entityType: NotiEntityType;
  /** false = không khớp tiền tố nào ⇒ đang dùng giá trị rơi tự do. Dùng cho test + cảnh báo. */
  known: boolean;
}

/**
 * Phân loại một thông báo từ `dedupeKey` của nó.
 *
 * Quy tắc nâng mức: khoá của vòng đồng bộ việc tồn kết thúc bằng `:overdue` LUÔN được nâng lên P1,
 * bất kể mức khai trong bảng. Lý do: cùng một loại việc, "còn tồn" và "đã quá hạn" là hai mức độ
 * khẩn khác nhau, và người dùng cần thấy cái quá hạn nằm trên cùng panel (PRD §7.5).
 */
export function classifyNotification(dedupeKey: string): NotiClassification {
  const prefix = PREFIXES_LONGEST_FIRST.find((p) => dedupeKey.startsWith(p));
  const def = prefix ? BY_PREFIX[prefix] : FALLBACK;

  const overdue = isPendingSyncKey(dedupeKey) && dedupeKey.endsWith(":overdue");

  return {
    groupKey: def.group,
    priority: overdue ? 1 : def.priority,
    entityType: def.entity,
    known: prefix !== undefined,
  };
}

/** Chỉ dùng cho test/kiểm kê — đừng đọc trực tiếp ở đường chạy. */
export function catalogPrefixes(): readonly string[] {
  return PREFIXES_LONGEST_FIRST;
}
