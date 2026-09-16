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
    // ── Hộp thư đa kênh (Zalo OA / Messenger) ────────────────────────────────
    // Prefix `inbox:` khai ĐÚNG ở module này (luật index.ts: mỗi prefix nằm trong
    // đúng một module). Xếp vào CRM chứ không tách module riêng vì nó là hội thoại
    // với KHÁCH — cùng họ dữ liệu với lead, và Sale là người dùng chính.
    {
      key: "inbox:view",
      action: "view",
      description:
        "Mở hộp thư đa kênh: xem hội thoại của khách trên Zalo OA / Messenger.",
    },
    {
      key: "inbox:reply",
      action: "reply",
      description: "Soạn và gửi tin trả lời khách trong hộp thư đa kênh.",
    },
    {
      key: "inbox:assign",
      action: "assign",
      description:
        "Nhận/giao hội thoại cho người phụ trách và nối hội thoại mồ côi vào phiếu khách.",
    },
    // ── Tích hợp ZaloCRM (nick Zalo cá nhân) ─────────────────────────────────
    // Prefix `zalocrm:` khai ĐÚNG ở module này (luật index.ts: mỗi prefix nằm trong
    // đúng một module). Xếp vào CRM cùng họ với `inbox:` và `leads:` vì nó cũng là
    // hội thoại với KHÁCH, và Sale là người dùng chính — không tách module riêng cho
    // một quyền duy nhất.
    //
    // `scopable: false` là ĐÚNG CHỦ ĐÍCH, không phải bỏ sót: quyền này chỉ trả lời
    // "được mở màn nhúng hay không". Phạm vi dữ liệu nằm ngoài repo — mỗi cơ sở là
    // một `orgCode` trong ZaloCRM, quyết bởi claim của token SSO do server ký. Khai
    // `scopable: true` là hứa một lớp gác theo cơ sở mà tầng này không thi hành được.
    {
      key: "zalocrm:use",
      action: "use",
      scopable: false,
      description:
        "Mở màn Zalo CRM nhúng (SSO iframe) và nhắn khách qua nick Zalo cá nhân.",
    },
    { key: "leads:assign", action: "assign" },
    {
      key: "leads:assign-config",
      action: "assign-config",
      // LeadAssignmentConfig là dữ liệu THEO CƠ SỞ (centerId @unique) — CM chỉ đặt
      // được cơ sở mình (leads/actions.ts setCenterAssignModeAction) ⇒ scopable.
      description: "Cấu hình quy tắc chia lead tự động (theo cơ sở).",
    },
    {
      key: "leads:rotation-view",
      action: "rotation-view",
      // S-5 — CHỈ ĐỌC sổ lượt luân phiên (`LeadRotationTurn`). Tách khỏi
      // `leads:view-all` để mở được cho tổ Sale mà không mở kèm ~8 màn quản lý
      // khác; tách khỏi `leads:assign-config` vì đó là quyền SỬA cách chia.
      // Cách ly cơ sở nằm ở `rotationBoardScope`, không ở scopeType.
      description: "Xem sổ lượt chia lead (chỉ đọc, theo cơ sở của mình).",
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

    // --- Trục gọi điện + ghi âm (OmiCall) ---
    {
      key: "calls:make",
      action: "make",
      description:
        "Bấm gọi ra từ hệ thống. ⚠️ Kèm nghĩa vụ QT-33: phải chọn mục đích cuộc gọi " +
        "(chăm sóc/xử lý yêu cầu vs chào bán/quảng cáo) TRƯỚC khi quay số.",
    },
    { key: "calls:view-own", action: "view-own", description: "Xem cuộc gọi của chính mình." },
    {
      key: "calls:view-all",
      action: "view-all",
      description: "Xem mọi cuộc gọi trong phạm vi cơ sở.",
    },
    {
      key: "calls:listen-recording",
      action: "listen-recording",
      // Ghi âm chứa giọng phụ huynh (và có thể cả trẻ). Đây là dữ liệu nhạy cảm
      // nhất của module, nên tách hẳn key và KHÔNG mặc định cho Sale (BM-2).
      sensitiveFields: ["recordingKey"],
      description:
        "Nghe lại ghi âm cuộc gọi. Key RIÊNG, KHÔNG mặc định cho Sale (BM-2). Mỗi lượt " +
        "nghe ghi một dòng AuditLog TRƯỚC khi cấp liên kết (QT-36); liên kết là URL ký " +
        "hạn ngắn của bucket R2 riêng, không bao giờ là link thô của nhà cung cấp.",
    },
    {
      key: "calls:export",
      action: "export",
      sensitiveFields: ["peerPhone", "fromNumber", "toNumber"],
      description: "Xuất dữ liệu cuộc gọi (kèm SĐT) — phải đóng dấu người tải + audit (BM-5).",
    },
    {
      key: "calls:assign",
      action: "assign",
      description: 'Gán chủ cho cuộc gọi mồ côi (chưa đối khớp được Lead/cơ sở) — OC-12.',
    },

    // --- Thông báo + yêu cầu/phản hồi phụ huynh ---
    { key: "notifications:manage", action: "manage" },
    { key: "parent-requests:manage", action: "manage" },
    { key: "parent-feedback:view", action: "view" },
  ],
};
