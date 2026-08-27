// Registry quyền — module CRM: lead, lớp trải nghiệm, yêu cầu/phản hồi PH, thông báo.
// Key GIỮ NGUYÊN format v1 `resource:verb` — parity 2 chiều với ALL_ACTIONS (TS-01).
import type { ModuleDecl } from "./types";

export const crmModule: ModuleDecl = {
  module: "crm",
  permissions: [
    // --- Leads ---
    { key: "leads:view-all", action: "view-all" },
    { key: "leads:view-own", action: "view-own" },
    {
      key: "leads:view-pii",
      action: "view-pii",
      // #11 T2 (OI-4) — khớp ĐỦ bộ field maskLeadPiiFields đang gate (lib/lead/pii.ts).
      // G-01 (26/08/2026) thêm `parentDob`; C-05 thêm `lostNote` (lý do rớt — ô ghi
      // chú tự do, cùng hạng "nội dung tư vấn" với `note`). Địa chỉ
      // (city/ward/addressLine) CỐ Ý không vào đây: dữ liệu địa bàn để lọc/xuất,
      // không phải danh tính.
      sensitiveFields: [
        "parentName",
        "phone",
        "email",
        "childName",
        "note",
        "parentDob",
        "lostNote",
      ],
      description:
        "Xem PII lead (tên PH-HS/SĐT/email/ngày sinh PH/ghi chú tư vấn/lý do rớt) không che.",
    },
    { key: "leads:create", action: "create" },
    { key: "leads:edit", action: "edit" },
    {
      key: "leads:change-status",
      action: "change-status",
      // 27/08/2026 — chủ dự án chốt: CHỈ Sale được đổi trạng thái lead. Tách khỏi
      // `leads:edit` vì quyền đó còn gác ~10 việc khác (sửa ô hồ sơ, ghi chú, gán
      // lại, xoá…) mà Quản lý cơ sở và Marketing VẪN cần. Gộp chung là hoặc khoá
      // nhầm cả chuỗi, hoặc mở nhầm cái vừa bị cấm.
      description:
        "Đổi trạng thái lead trên phễu (kéo thẻ Kanban / chọn ở bảng). Chỉ Sale.",
    },
    {
      key: "leads:edit-own-intake",
      action: "edit-own-intake",
      description:
        "Sửa phiếu do chính mình nhập, chỉ các ô có trong biểu mẫu nhập khách hàng.",
    },
    { key: "leads:assign", action: "assign" },
    {
      key: "leads:assign-config",
      action: "assign-config",
      // LeadAssignmentConfig là dữ liệu THEO CƠ SỞ (centerId @unique) — CM chỉ đặt
      // được cơ sở mình (leads/actions.ts setCenterAssignModeAction) ⇒ scopable.
      description: "Cấu hình quy tắc chia lead tự động (theo cơ sở).",
    },
    { key: "leads:delete", action: "delete" },
    { key: "leads:export", action: "export" },
    {
      key: "leads:import",
      action: "import",
      description: "Import danh sách khách đã đăng ký từ Excel.",
    },
    {
      key: "lead_targets:manage",
      action: "manage",
      // C-01 — chỉ tiêu SỐ HỌC SINH theo tháng × cơ sở (bảng LeadTarget). TÁCH khỏi
      // `leads:assign-config` (màn cấu hình chia lead tự động) theo chốt 24/08/2026:
      // gộp hai việc vào một key là cấp nhầm năng lực khi mở cho Quản lý cơ sở.
      description:
        "Đặt/sửa chỉ tiêu lead (số học sinh) theo tháng × cơ sở. Không bao gồm cấu hình chia lead.",
    },

    // --- Chỉ tiêu ngân sách quảng cáo (D-02) ---
    // Ở module `crm` chứ không `finance`: toàn bộ mã quảng cáo của repo đang sống dưới
    // `lib/crm/` (`ads-insights.ts`) và màn phễu là `/admin/marketing/funnel` — một
    // màn CRM. Registry đòi mỗi prefix `resource:` nằm ĐÚNG MỘT module, nên đặt sai
    // chỗ hôm nay là phải dời cả prefix về sau. Khi khu vực D đẻ ra module `marketing`
    // riêng (kèm `ads:view`/`ads:manage` — nợ đã ghi ở OQ-D5), key này dời sang đó.
    {
      key: "ads_budget_targets:manage",
      action: "manage",
      description:
        "Đặt/sửa chỉ tiêu ngân sách quảng cáo (VNĐ) theo tháng × cơ sở. KHÔNG bao gồm xem/sửa số chi tiêu thật, cũng không gán campaign về cơ sở.",
    },

    // --- Trials (lớp trải nghiệm) ---
    { key: "trials:view", action: "view" },
    { key: "trials:manage", action: "manage" },
    {
      key: "trials:feedback",
      action: "feedback",
      description: "GV ghi nhận xét buổi trải nghiệm.",
    },
    {
      key: "trials:attendance",
      action: "attendance",
      description:
        "Sale điểm danh buổi trải nghiệm. Tách khỏi trials:feedback vì điểm danh là việc của Sale phụ trách khách, nộp phiếu đánh giá là việc của giáo viên.",
    },
    { key: "trials:assign-teacher", action: "assign-teacher" },
    {
      key: "trials:override-capacity",
      action: "override-capacity",
      description: "Xếp lớp trải nghiệm vượt sĩ số tối đa.",
    },
    {
      key: "trials:config",
      action: "config",
      description: "Cấu hình số buổi của lớp trải nghiệm.",
    },

    // --- Thông báo + yêu cầu/phản hồi phụ huynh ---
    { key: "notifications:manage", action: "manage" },
    { key: "parent-requests:manage", action: "manage" },
    { key: "parent-feedback:view", action: "view" },
  ],
};
