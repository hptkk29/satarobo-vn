// lib/auth/page-gates.ts — NGUỒN DUY NHẤT cho "ai được vào trang nào".
//
// Vì sao tồn tại: smoke prod 10/07 lòi ra hai lớp lỗi ngược nhau, cùng một gốc là
// sidebar và page.tsx mỗi bên tự khai một danh sách action:
//   1. DEAD LINK — menu hiện (perm A), trang gác bằng action B mà vai đó không có
//      ⇒ bấm vào là văng /dashboard. (Marketing × /site-content; GV × /students.)
//   2. HỞ QUYỀN THEO URL — menu giấu, nhưng trang gác bằng action rộng hơn
//      ⇒ gõ URL là vào. (Kế toán/HR/Marketing đọc được tin nhắn phụ huynh, học bạ.)
//
// scopedDb KHÔNG cứu được lớp (2): nó cách ly *cơ sở*, không cách ly *chức năng* —
// và vai HO thì nhìn xuyên cơ sở.
//
// Quy tắc: mỗi route ở đây khai đúng MỘT danh sách action. Vào được ⟺ có ≥1 action
// trong danh sách (OR). Sidebar dùng chính mảng này làm `perm`, page.tsx dùng chính
// nó làm gate ⇒ menu và cổng không thể lệch nhau nữa. `page-gates.test.ts` khoá lại.
//
// Muốn đổi ai-thấy-gì thì sửa Ở ĐÂY, không sửa rải rác trong page.tsx.
import type { Action } from "@/lib/auth/permissions";

export const PAGE_GATES = {
  /** Danh sách HV toàn cơ sở. GV KHÔNG vào (trang không lọc theo lớp) — GV xem lớp
   *  mình ở site giáo viên. Trước 10/07 sidebar mời GV vào rồi trang đá ra. */
  "/students": ["students:view-all"],

  /** Học bạ + xuất PDF. Chốt 10/07 (BGĐ): chỉ Đào tạo + QL cơ sở + GV. HR/Kế toán/
   *  Marketing/Sale/Giáo vụ KHÔNG xem — trước đó vào được bằng URL nhờ students:view-all. */
  "/hoc-ba": ["curriculum:view", "students:view-own-class"],

  /** Hội thoại phụ huynh ↔ giáo viên (PII). GV vào được vì trang CÓ lọc theo lớp
   *  phân công. Đào tạo/HR/Kế toán/Marketing bị cắt.
   *
   *  ⚠️ 09/08/2026 — GỠ `parent-requests:manage` khỏi ô này. Action đó do
   *  SUPER_ADMIN + CENTER_MANAGER + **SALES_CSM** giữ (nó là chìa khoá CSKH cho
   *  /cham-soc-hv và /canh-bao-rui-ro, không gỡ khỏi Sale được), nên Sale mở được
   *  /tin-nhan — trong khi `docs/chat-realtime/permissions.md` ghi Sale ❌ ở MỌI ô
   *  chat và TS-01.6 đòi "sale1 gọi mọi endpoint chat → 403 toàn bộ". Danh sách hiện
   *  rỗng (phạm vi đọc là participant-based) nhưng cửa vẫn mở — hợp đồng nói là đóng.
   *
   *  Vì sao là `students:view-own-class` chứ KHÔNG phải `chat:read`: gate cấp trang gọi
   *  `checkAnyPermission` KHÔNG có target, mà dưới RBAC v2 (đang bật prod) `chat:read`
   *  seed scope CENTER cho QLCS và ASSIGNED cho GV — `scopeMatches` đòi target
   *  (lib/auth/can.ts:18,29) nên gọi trần trả FALSE ⇒ khoá cửa chính của cả QLCS lẫn GV
   *  trên prod, trong khi máy dev (v1 tĩnh) vẫn xanh. Đúng dạng "chạy máy tôi thì được".
   *  `students:view-own-class` giữ được cả hai tính chất cần: v1 = SUPER_ADMIN +
   *  CENTER_MANAGER + TEACHER (không có Sale), v2 = GLOBAL ở CẢ CENTER_MANAGER lẫn
   *  TEACHER nên gọi trần vẫn đúng. Quyền theo TỪNG hội thoại (đọc/gửi/thông báo/gỡ)
   *  vẫn kiểm CÓ target trong `chat-workspace` + từng Server Action — gate này chỉ là
   *  cửa vào màn hình. Bất biến "action trong PAGE_GATES phải GLOBAL ở mọi RoleDef giữ
   *  nó" được `page-gates.test.ts` khoá lại.
   *
   *  ⚠️ 09/08/2026 — ĐẢO phần Giáo vụ. Bản trước ghi "Giáo vụ (`CENTER_CLASS_MANAGER`)
   *  cũng ra khỏi cửa này vì sync chỉ dẫn xuất participant cho `CENTER_MANAGER`". Chủ dự
   *  án chốt Giáo vụ được đối xử Y HỆT Quản lý cơ sở trong chat, nên
   *  `lib/chat/sync-membership.ts` (CHAT_CENTER_MANAGER_ROLE_CODES) nay dẫn xuất cả vai
   *  này → họ LÀ thành viên nhóm lớp cơ sở mình. Gate không đổi; Giáo vụ vào bằng
   *  `classes:view-own` GLOBAL vừa thêm ở `prisma/seed-roles.ts` (KHÔNG mượn
   *  `students:view-own-class` — action đó kéo theo /hoc-ba mà BGĐ 10/07 đã cấm Giáo vụ).
   *  Sale vẫn ❌: vai đó không giữ action nào trong danh sách này. */
  /**
   * F5 (mở phạm vi 10/08/2026) — THÊM `parent-requests:manage` để Sale vào được.
   *
   * Vì sao action này chứ không phải `chat:read`: hai bất biến do chính file test bên
   * cạnh khoá lại — (a) mọi action trong bảng phải seed **GLOBAL** ở MỌI RoleDef giữ nó,
   * vì `checkAnyPermission` gọi KHÔNG target; (b) gate **cấm** mọi `chat:*`. Sale giữ
   * `chat:read` scope OWN, GV giữ ASSIGNED, QLCS giữ CENTER ⇒ nhét `chat:read` vào gate
   * là khoá luôn cửa chính của GV lẫn QLCS. `parent-requests:manage` thoả cả hai: GLOBAL
   * ở cả 3 RoleDef giữ nó (seed-roles.ts:347/456/520) và không phải chat:*.
   *
   * Nó cũng KHÔNG mở cửa cho ai mới ngoài Sale: v1 giữ nó ở đúng
   * [SUPER_ADMIN, CENTER_MANAGER, SALES_CSM] — hai vai đầu vốn đã qua cổng này.
   */
  "/tin-nhan": ["students:view-own-class", "classes:view-own", "parent-requests:manage"],

  /**
   * Cây tổ chức (P1 · US-05 AC4) — MÀN QUẢN TRỊ, không phải màn tra cứu.
   *
   * Trước 11/08/2026 gác bằng `centers:view`, mà action đó 7 RoleDef giữ (kể cả TEACHER,
   * Sale, HR, Kế toán) vì nó là chìa khoá cho dropdown/bộ lọc cơ sở ở khắp nơi. Hệ quả:
   * gần như MỌI vai đều thấy nhóm "Hệ thống & Cấu hình" hiện lên chỉ vì mục này — trong
   * khi chủ dự án chốt (11/08/2026) nhóm đó CHỈ dành cho SUPER_ADMIN.
   *
   * `centers:edit` giữ đúng ngữ nghĩa (đây là màn sửa cây) và chỉ SUPER_ADMIN có
   * (v1: permissions.ts:544; v2: không RoleDef nào khai ⇒ chỉ qua bypass). KHÔNG gỡ
   * `centers:view` khỏi các vai — làm thế là gãy bộ lọc cơ sở ở hàng chục màn khác.
   */
  "/to-chuc": ["centers:edit"],

  /** P2 · US-08 — vị trí công việc mang bộ vai trò ⇒ cùng hạng nguy hiểm với sửa
   *  RoleDef, cùng một cổng `roles:manage` (chỉ SUPER_ADMIN). */
  "/nhan-su/vi-tri": ["roles:manage"],

  /** Cảnh báo rủi ro HV. GV KHÔNG vào: trang không có lọc theo lớp, cho GV vào là
   *  mở toàn cơ sở — đúng thứ câu 19 cấm. */
  /** Quản lý chia lead (29/08) — Quản trị + Quản lý cơ sở; QLCS chỉ thấy cơ sở mình. */
  "/quan-ly-chia-lead": ["lead_pool:manage"],

  "/canh-bao-rui-ro": ["parent-requests:manage"],

  /** Ghi chú chăm sóc HV. Cùng lý do /canh-bao-rui-ro. Sale vào bằng chính
   *  parent-requests:manage (thay hack `hasRole(SALES_CSM)` cũ trong page.tsx). */
  "/cham-soc-hv": ["parent-requests:manage"],

  /** Sinh nhật học viên (06/08/2026) — Sale/CSKH + QL cơ sở là người đi chúc.
   *  Gác bằng `students:view-all`: trang liệt kê học viên toàn cơ sở, đúng bộ vai
   *  đang giữ quyền đó. GV không vào (không lọc theo lớp phân công) — GV nhận
   *  thông báo riêng cho buổi mình đứng lớp. */
  "/sinh-nhat": ["students:view-all"],

  /** Nội dung website. Trước 10/07 gác nhầm bằng `honors:settings` ⇒ Marketing thấy
   *  menu mà không vào được. Sau flip nó tự hết đau do HO_MARKETING tình cờ giữ cả hai
   *  — tức đúng do may, không do thiết kế. */
  "/site-content": ["site-content:view"],

  /** Tracking lead. Gác bằng leads:view-all từ đầu; sidebar khai nhầm site-content:view. */
  "/marketing": ["leads:view-all"],

  /** G-D (21/08/2026) — nhập nhanh khách hàng, bản CÓ ĐĂNG NHẬP thay cho biểu mẫu
   *  công khai `sale.satarobo.vn`. Ai nhập được lead thì vào được: marketing,
   *  sale-admin, Sale cơ sở. `leads:create` là GLOBAL ở cả 3 RoleDef giữ nó nên
   *  dùng làm gate cấp trang được (gate gọi trần, không target). */
  "/nhap-khach-hang": ["leads:create"],

  /** Chuyển lớp/cơ sở. Sale TẠO yêu cầu, QL cơ sở DUYỆT (enrollments:transfer chỉ điều
   *  khiển nút duyệt trong trang). Menu cũ khai `enrollments:transfer` ⇒ Sale không thấy
   *  đường vào chính việc của mình. Đây là lỗi giấu-tính-năng, không phải hở quyền. */
  "/chuyen-lop": ["enrollments:create"],

  /** Thư viện media buổi học. Menu cũ khai thiếu `media:upload` (cùng người giữ ở v1
   *  nên chưa ai đau) — khai đủ để menu ≡ gate. */
  "/media": ["media:view", "media:upload"],

  /** Cổng duyệt ảnh/video buổi học (MEDIA-REVIEW, 26/08). CHỈ `media:approve` — đây là
   *  màn RA QUYẾT ĐỊNH, không phải thư viện: người chỉ có `media:view` vào được thì sẽ
   *  thấy nút "Duyệt tất cả" mà bấm vào là bị Server Action từ chối. */
  "/duyet-media": ["media:approve"],

  // ── Site Sale (sale.satarobo.vn) ────────────────────────────────────────
  // Khai ở ĐÂY chứ không để mỗi trang tự gõ action: thanh điều hướng của site
  // Sale đọc thẳng bảng này làm `perm`, nên menu và cổng trang không thể lệch.
  // Trang nằm ở `app/(sale)/sale/...` nên `page-gates.test.ts` cần một dòng
  // `PAGE_DIR_OVERRIDE` cho mỗi route — bảng này mặc định tìm trong `(admin)`.
  //
  // ⚠️ Cả hai action dưới đây đều GLOBAL ở mọi RoleDef giữ chúng (đã có test
  // riêng khoá bất biến đó): gate cấp trang gọi `checkAnyPermission` KHÔNG có
  // target, action seed scope CENTER/OWN sẽ trả FALSE trên prod trong khi máy
  // dev vẫn xanh. Cách ly cơ sở do `scopedDb` lo, không do gate.

  /** Lớp trải nghiệm — Sale xem lịch, xem phiếu đánh giá của GV, xuất PDF.
   *  `trials:view` là quyền Sale vốn đã có; không mở thêm gì. */
  "/sale/trial": ["trials:view"],

  /** Biểu mẫu nhập khách hàng, bản đứng TRÊN site Sale.
   *  Cùng action với bản `/nhap-khach-hang` bên admin — cùng một việc, cùng một
   *  đường ghi (`ingestIntakeLead`), chỉ khác chỗ đứng. Trước 23/08 Sale gõ địa
   *  chỉ này bị 307 sang admin host, tức nhập khách là bị đá khỏi site của mình. */
  "/sale/nhap-khach-hang": ["leads:create"],

  /** Ba báo cáo đào tạo. BGĐ chốt 10/07: "báo cáo của chức năng nào thì role chức năng
   *  đó xem". Trước đây gác `classes:view-all` ∨ `training:manage` ⇒ HR/Kế toán/Marketing
   *  mở được bằng URL (menu thì khai `courses:create`, nên giấu). Nay: Đào tạo + QL cơ sở. */
  "/bao-cao/dao-tao": ["reports:training"],
  "/bao-cao/hieu-suat-gv": ["reports:training"],
  "/bao-cao/cohort": ["reports:training"],
} as const satisfies Record<string, readonly Action[]>;

export type GatedHref = keyof typeof PAGE_GATES;

/**
 * CHƯA đưa vào bảng — gate và menu vẫn lệch, có chủ đích. Rỗng từ L5 chấm công v3 (06/09/2026):
 * `/cham-cong/lich-ca-nhan-vien` (ngoại lệ duy nhất) đã bị gỡ cùng 4 màn ShiftRegistration cũ.
 * Thêm route mới vào đây phải kèm lý do, không được im lặng.
 */
export const GATE_MISMATCH_ALLOWLIST: readonly string[] = [];
