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

  /**
   * S-5 — SỔ LƯỢT CHIA LEAD (chỉ đọc). Màn kiểm chứng dựng ra để dập tin đồn thiên
   * vị khi chia lead; đặc tả gốc đòi "màn hình cho **cả tổ sale** nhìn thấy"
   * (plan/15 §5). Nhưng nó gác bằng `leads:view-all` — quyền QUẢN LÝ mà Sale cố ý
   * không có — nên người duy nhất không mở được là người mà bằng chứng viết cho.
   *
   * Vá bằng key ĐỌC riêng `leads:rotation-view` ĐỨNG CẠNH `leads:view-all`, không
   * thay thế:
   *  • không nới `leads:view-all` cho Sale — quyền đó gác ~8 màn quản lý khác;
   *  • giữ `leads:view-all` trong ô này để Quản lý cơ sở/Marketing KHÔNG mất màn
   *    trong khoảng giữa "merge vào main" và "bấm chạy seed-prod-roles.yml" (RBAC v2
   *    enforce trên prod đọc quyền từ DB) — trắng màn không kèm lỗi, không tái hiện
   *    được ở local vì local chạy v1 tĩnh.
   *
   * ⚠️ Key MỚI ⇒ sau khi merge `test` → `main` PHẢI chạy `seed-prod-roles.yml`, nếu
   * không Sale trên prod vẫn bị đá ra đúng như trước khi vá.
   * ⚠️ Vào được TRANG ≠ xem được mọi cơ sở: phạm vi do `rotationBoardScope`
   * (lib/lead/rotation.ts) chặn — Sale chỉ thấy sổ cơ sở mình.
   */
  "/leads/so-luot": ["leads:view-all", "leads:rotation-view"],

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

  /** Tra cứu danh mục — bảng giá khoá/học cụ + lớp còn chỗ. CHỈ ĐỌC.
   *  Hai action đều là quyền Sale vốn đã có và đều GLOBAL. Vào được bằng MỘT
   *  trong hai; trang tự quyết khối nào hiện, không đá ai ra vì thiếu một quyền. */
  "/sale/tra-cuu": ["products:view", "classes:view-all"],

  /** Chốt đơn — tạo đơn cho khách của mình. `orders:create` là action HẸP mở ở
   *  Đợt 0 (G-A), KHÔNG phải `orders:manage` (mở/huỷ/hoàn toàn hệ thống).
   *  Phạm vi "chỉ đơn gắn khách của mình" do `checkOrderCreateOwnership()` gác
   *  trong chính action — gate trang chỉ chặn sớm cho đỡ phí một vòng gọi. */
  "/sale/chot-don": ["orders:create"],

  /** Khách của tôi — danh sách + chi tiết + ghi hoạt động + việc follow-up.
   *  `leads:view-own` là quyền Sale vốn đã có. KHÔNG dùng `leads:view-all`: đó
   *  là quyền của quản lý, và trang này cố ý chỉ trả lời "khách nào của tôi". */
  "/sale/khach-cua-toi": ["leads:view-own"],

  /**
   * Hộp thư đa kênh — hội thoại của khách trên Zalo OA / Messenger.
   *
   * `inbox:view` là KEY MỚI, cố ý không mượn key sẵn có:
   *  • `chat:read` seed non-GLOBAL (OWN cho Sale, ASSIGNED cho GV, CENTER cho QLCS)
   *    nên cổng trang gọi trần sẽ luôn FALSE trên prod — đúng bẫy đã suýt khoá cửa
   *    /tin-nhan. Và nó là chat NỘI BỘ, khác hẳn hội thoại với khách ngoài hệ.
   *  • `leads:view-own` thì mở cửa cho đúng người nhưng nói sai việc: hộp thư có
   *    hội thoại MỒ CÔI chưa gắn lead nào, tức có nội dung nằm ngoài phạm vi "lead
   *    của tôi". Mượn key đó là để lộ một tập dữ liệu mà cái tên quyền không mô tả.
   *
   * ⚠️ Key MỚI ⇒ sau khi merge `test` → `main` PHẢI chạy `seed-prod-roles.yml`,
   * nếu không người mở trang trên prod bị đá ra, KHÔNG kèm lỗi, và không tái hiện
   * được ở local (local chạy RBAC v1 tĩnh).
   * ⚠️ Vào được TRANG ≠ thấy mọi cơ sở: phạm vi do `inboxOrgScopeWhere`
   * (`lib/inbox/scope.ts`) chặn — `scopedDb` KHÔNG che ba bảng này.
   */
  "/sale/hop-thu": ["inbox:view"],

  /** Biểu mẫu nhập khách hàng, bản đứng TRÊN site Sale.
   *  Cùng action với bản `/nhap-khach-hang` bên admin — cùng một việc, cùng một
   *  đường ghi (`ingestIntakeLead`), chỉ khác chỗ đứng. Trước 23/08 Sale gõ địa
   *  chỉ này bị 307 sang admin host, tức nhập khách là bị đá khỏi site của mình. */
  "/sale/nhap-khach-hang": ["leads:create"],

  /** Ba báo cáo đào tạo. BGĐ chốt 10/07: "báo cáo của chức năng nào thì role chức năng
   *  đó xem". Trước đây gác `classes:view-all` ∨ `training:manage` ⇒ HR/Kế toán/Marketing
   *  mở được bằng URL (menu thì khai `courses:create`, nên giấu). Nay: Đào tạo + QL cơ sở. */
  /**
   * B-01 — Doanh thu vs mục tiêu. Trước đây cả menu lẫn trang gác bằng `payments:manage`
   * ⇒ Quản lý cơ sở, đúng người mà màn này viết cho, KHÔNG mở được: quyền đó là thao tác
   * TIỀN (mở/huỷ/hoàn, phương thức thanh toán, hoa hồng) và cố ý không nằm ở vai đó.
   *
   * Thêm `revenue_targets:manage` (key riêng) thay vì nới `payments:manage`. Giữ luôn
   * `payments:manage` trong ô này để kế toán không mất đường vào. Cả hai đều GLOBAL ở
   * mọi RoleDef giữ chúng — bắt buộc, vì gate gọi `checkAnyPermission` KHÔNG có target.
   */
  "/bao-cao/doanh-thu": ["payments:manage", "revenue_targets:manage"],

  /**
   * C-01 — Chỉ tiêu lead theo tháng × cơ sở. Màn này CHỈ để đặt/sửa con số, nên gác
   * bằng đúng quyền ghi: ai không đặt được thì vào cũng không có việc gì làm ở đây
   * (số liệu thực-vs-chỉ-tiêu nằm ở tab Kinh doanh của dashboard, gác riêng).
   *
   * KHÔNG kèm `leads:view-all`: action đó seed GLOBAL nên gate sẽ nhận, nhưng như vậy
   * là mở màn ĐẶT chỉ tiêu cho cả Sale/Marketing — người bị đo, không phải người đặt.
   * `lead_targets:manage` GLOBAL ở mọi RoleDef giữ nó (bắt buộc: gate gọi
   * `checkAnyPermission` KHÔNG có target).
   */
  "/bao-cao/muc-tieu-lead": ["lead_targets:manage"],

  /**
   * D-02 — Chỉ tiêu ngân sách quảng cáo theo tháng × cơ sở. Cùng luật với màn C-01 ở
   * trên: màn CHỈ để đặt/sửa con số nên gác bằng đúng quyền ghi.
   *
   * KHÔNG kèm `leads:view-all`: action đó seed GLOBAL nên gate sẽ nhận, nhưng nó đang
   * gác `/admin/marketing/funnel` cho cả QLCS lẫn Marketing ⇒ mượn là mở màn ĐẶT chỉ
   * tiêu cho người mà chỉ tiêu đó dùng để đo. `ads_budget_targets:manage` GLOBAL ở mọi
   * RoleDef giữ nó (bắt buộc: gate gọi `checkAnyPermission` KHÔNG có target).
   */
  "/bao-cao/ngan-sach-quang-cao": ["ads_budget_targets:manage"],

  "/bao-cao/dao-tao": ["reports:training"],
  "/bao-cao/hieu-suat-gv": ["reports:training"],
  "/bao-cao/cohort": ["reports:training"],

  /**
   * A-02 — Dashboard QLCS 4 tab (Tài chính · Kinh doanh · Chi phí Marketing · Tương tác
   * KH). Gác bằng MỘT key riêng `dashboard:view` (chốt kỹ thuật 24/08/2026, E/OQ-4).
   *
   * Vì sao không mượn key sẵn có:
   *  • `chat:read` — ứng viên đầu tiên cho tab E — seed scope CENTER (QLCS) / ASSIGNED
   *    (GV). Gate cấp trang gọi `checkAnyPermission` KHÔNG có target, mà `scopeMatches`
   *    đòi target với các scope đó ⇒ luôn false trên prod (v2), xanh ở local (v1). Đây
   *    đúng cái bẫy đã suýt dính ở `/tin-nhan`.
   *  • `payments:*` / `leads:view-all` gác được đúng MỘT tab. Đặt vào ô này là hoặc
   *    khoá cửa của người chỉ cần tab kia, hoặc mở kèm năng lực không ai định trao.
   *
   * ⚠️ Vào được TRANG ≠ xem được mọi tab. Gate từng tab (B → `payments:view` ·
   * C → `leads:view-all` · D/E → `dashboard:view`) đi kèm nội dung của tab đó; khung
   * này chưa có số liệu nên chưa có gì để lọc.
   * ⚠️ Key MỚI ⇒ sau khi merge `test` → `main` phải chạy `seed-prod-roles.yml`, nếu
   * không prod hiện MÀN TRẮNG không kèm lỗi và không tái hiện được ở local (local v1).
   */
  "/dashboard-qlcs": ["dashboard:view"],
} as const satisfies Record<string, readonly Action[]>;

export type GatedHref = keyof typeof PAGE_GATES;

/**
 * CHƯA đưa vào bảng — gate và menu vẫn lệch, có chủ đích, chờ BGĐ chốt:
 *
 *   /cham-cong/lich-ca-nhan-vien
 *     menu: hr_attendance:view   ·   gate: view(cơ-sở-đang-xem) ∨ checkin(cơ-sở-của-mình)
 *     Gate có TARGET (centerId) nên không quy về so-sánh-tập-hợp: nhân viên thường xem
 *     được bảng ca của chính cơ sở mình, đó là thiết kế. Giữ nguyên, không coi là lệch.
 *
 * `page-gates.test.ts` giữ danh sách này làm ngoại lệ tường minh — thêm route mới vào
 * đây phải kèm lý do, không được im lặng.
 */
export const GATE_MISMATCH_ALLOWLIST: readonly string[] = [
  "/cham-cong/lich-ca-nhan-vien",
  // Ghi danh trên site Sale (`app/(sale)/sale/ghi-danh/[leadId]`).
  //
  // Bảng trên dùng phép HOẶC (`checkAnyPermission`), mà chốt lead đòi CẢ HAI
  // quyền: `students:create` VÀ `enrollments:create`. Hai quyền đó tách nhau có
  // chủ đích — Marketing giữ một mà không giữ cái kia — nên gộp vào bảng bằng
  // phép HOẶC sẽ MỞ CỬA cho người chỉ có một nửa. `submitConvertV2` cũng kiểm
  // đúng phép VÀ đó, nên trang và action nói cùng một câu; cái lệch duy nhất là
  // với BẢNG, và đó là lệch có chủ đích.
  //
  // Không có mục menu nào cho route này (vào từ hồ sơ khách) nên cũng không có
  // nguy cơ menu-và-cổng nói khác nhau — thứ mà bảng sinh ra để chặn.
  "/sale/ghi-danh",
];
