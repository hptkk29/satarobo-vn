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
   *  phân công (teacherClassIds). Đào tạo/HR/Kế toán/Marketing bị cắt. */
  "/tin-nhan": ["parent-requests:manage", "classes:view-own"],

  /** Cảnh báo rủi ro HV. GV KHÔNG vào: trang không có lọc theo lớp, cho GV vào là
   *  mở toàn cơ sở — đúng thứ câu 19 cấm. */
  "/canh-bao-rui-ro": ["parent-requests:manage"],

  /** Ghi chú chăm sóc HV. Cùng lý do /canh-bao-rui-ro. Sale vào bằng chính
   *  parent-requests:manage (thay hack `hasRole(SALES_CSM)` cũ trong page.tsx). */
  "/cham-soc-hv": ["parent-requests:manage"],

  /** Nội dung website. Trước 10/07 gác nhầm bằng `honors:settings` ⇒ Marketing thấy
   *  menu mà không vào được. Sau flip nó tự hết đau do HO_MARKETING tình cờ giữ cả hai
   *  — tức đúng do may, không do thiết kế. */
  "/site-content": ["site-content:view"],

  /** Tracking lead. Gác bằng leads:view-all từ đầu; sidebar khai nhầm site-content:view. */
  "/marketing": ["leads:view-all"],

  /** Chuyển lớp/cơ sở. Sale TẠO yêu cầu, QL cơ sở DUYỆT (enrollments:transfer chỉ điều
   *  khiển nút duyệt trong trang). Menu cũ khai `enrollments:transfer` ⇒ Sale không thấy
   *  đường vào chính việc của mình. Đây là lỗi giấu-tính-năng, không phải hở quyền. */
  "/chuyen-lop": ["enrollments:create"],

  /** Thư viện media buổi học. Menu cũ khai thiếu `media:upload` (cùng người giữ ở v1
   *  nên chưa ai đau) — khai đủ để menu ≡ gate. */
  "/media": ["media:view", "media:upload"],
} as const satisfies Record<string, readonly Action[]>;

export type GatedHref = keyof typeof PAGE_GATES;

/**
 * CHƯA đưa vào bảng — gate và menu vẫn lệch, có chủ đích, chờ BGĐ chốt:
 *
 *   /bao-cao/dao-tao · /bao-cao/hieu-suat-gv · /bao-cao/cohort
 *     menu: courses:create   ·   gate: classes:view-all ∨ training:manage
 *     ⇒ HR / Kế toán / Marketing mở được bằng URL (báo cáo tổng hợp, không có PII HV).
 *     Siết gate hay mở menu đều đổi ai-thấy-gì ⇒ cần quyết định nghiệp vụ.
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
  "/bao-cao/dao-tao",
  "/bao-cao/hieu-suat-gv",
  "/bao-cao/cohort",
  "/cham-cong/lich-ca-nhan-vien",
];
