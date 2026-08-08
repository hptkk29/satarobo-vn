// TS-03 — GRANDFATHER no-inline-authz: file hiện trạng còn kiểm quyền inline
// (so role/centerId, hasRole, .roles.includes) hoặc action ghi mà THÂN function
// không gọi trực tiếp can(/assertCan(/checkPermission(/assertPermission(...
// (phần lớn nhóm sau đi qua wrapper cục bộ kiểu `ensurePermission()` — hợp lệ về
// nghiệp vụ nhưng heuristic tầng (b) không nhìn xuyên wrapper, grandfather chờ
// migrate sang can() trực tiếp).
//
// Đo bằng LINT THẬT 09/08/2026 (đo LẠI sau review đối kháng cùng ngày — scope glob
// mở rộng phủ `_*actions*.ts` + `_*-core.ts` + `_actions/**`, rule (b) chuyển AST,
// selector (a) loại trừ so sánh undefined/null): bật cưỡng bức 2 rule trên TOÀN scope,
// KHÔNG có block off → 71 file vi phạm (67 msg tầng a + 190 msg tầng b) trên 113 file
// quét. So bản đo đầu: +6 file action thật mà glob cũ bỏ sót (active-role, _curriculum/
// _schedule-actions, _qr-core, _feedback-core, _eval-actions); 0 file được xoá — 2 file
// portal tưởng "sạch nhờ bớt bắt oan" hoá ra vẫn so `role !== "PARENT"` (string literal).
//
// LUẬT: trả nợ dần → 0, CẤM thêm file MỚI vào đây — code mới kiểm quyền qua
// can(actor, permissionKey, target) từ lib/permissions/can. File dọn xong inline-authz
// thì XOÁ entry (test freshness trong inline-authz.test.ts sẽ đỏ nếu quên xoá).
// Brackets dùng glob char-class để match literal [id], [slug]... (như db-import-allowlist).
export const INLINE_AUTHZ_ALLOWLIST = [
  "app/(admin)/admin/_actions/active-role.ts",
  "app/(admin)/admin/affiliates/_actions.ts",
  "app/(admin)/admin/assignments/_actions.ts",
  "app/(admin)/admin/assignments/templates/_actions.ts",
  "app/(admin)/admin/attendance/_actions.ts",
  "app/(admin)/admin/audit-log/_actions.ts",
  "app/(admin)/admin/canh-bao-rui-ro/_actions.ts",
  "app/(admin)/admin/centers/_actions.ts",
  "app/(admin)/admin/cham-cong/checklist-co-so/_actions.ts",
  "app/(admin)/admin/cham-cong/chinh-cong/_actions.ts",
  "app/(admin)/admin/cham-cong/duyet-ca/_actions.ts",
  "app/(admin)/admin/class-groups/_actions.ts",
  "app/(admin)/admin/classes/[[]id[]]/_actions.ts",
  "app/(admin)/admin/classes/[[]id[]]/_curriculum-actions.ts",
  "app/(admin)/admin/classes/[[]id[]]/_schedule-actions.ts",
  "app/(admin)/admin/classes/[[]id[]]/students/_actions.ts",
  "app/(admin)/admin/classes/_actions.ts",
  "app/(admin)/admin/convert-conflicts/actions.ts",
  "app/(admin)/admin/course-packages/_actions.ts",
  "app/(admin)/admin/course-prerequisites/_actions.ts",
  "app/(admin)/admin/courses/[[]id[]]/_actions.ts",
  "app/(admin)/admin/crm/commission/actions.ts",
  "app/(admin)/admin/curriculums/_actions.ts",
  "app/(admin)/admin/documents/_actions.ts",
  "app/(admin)/admin/email-templates/_actions.ts",
  "app/(admin)/admin/enrollments/_actions.ts",
  "app/(admin)/admin/exams/_actions.ts",
  "app/(admin)/admin/holidays/_actions.ts",
  "app/(admin)/admin/inventory/audit/_actions.ts",
  "app/(admin)/admin/inventory/items/_actions.ts",
  "app/(admin)/admin/inventory/movements/_actions.ts",
  "app/(admin)/admin/kits/_actions.ts",
  "app/(admin)/admin/leads/actions.ts",
  "app/(admin)/admin/news/_actions.ts",
  "app/(admin)/admin/nhan-su/actions.ts",
  "app/(admin)/admin/orders/_actions.ts",
  "app/(admin)/admin/orders/_qr-core.ts",
  "app/(admin)/admin/payment-methods/_actions.ts",
  "app/(admin)/admin/products/_actions.ts",
  "app/(admin)/admin/questions/_actions.ts",
  "app/(admin)/admin/report-cards/_actions.ts",
  "app/(admin)/admin/rooms/_actions.ts",
  "app/(admin)/admin/satacoin/_actions.ts",
  "app/(admin)/admin/scorm/_actions.ts",
  "app/(admin)/admin/sessions/[[]id[]]/_actions.ts",
  "app/(admin)/admin/sessions/[[]id[]]/_feedback-core.ts",
  "app/(admin)/admin/sessions/_actions.ts",
  "app/(admin)/admin/settings/actions.ts",
  "app/(admin)/admin/sinh-nhat/_actions.ts",
  "app/(admin)/admin/students/[[]id[]]/_actions.ts",
  "app/(admin)/admin/students/_actions.ts",
  "app/(admin)/admin/teachers/_actions.ts",
  "app/(admin)/admin/trial-classes/_actions.ts",
  "app/(admin)/admin/users/[[]id[]]/permissions/_actions.ts",
  "app/(admin)/admin/users/_actions.ts",
  "app/(auth)/doi-mat-khau/_actions.ts",
  "app/(auth)/kich-hoat/_actions.ts",
  "app/(auth)/quen-mat-khau/_actions.ts",
  "app/(portal)/portal/bai-tap/actions.ts",
  "app/(portal)/portal/bai-thi/actions.ts",
  "app/(portal)/portal/danh-gia-gv/_actions.ts",
  "app/(portal)/portal/danh-gia/actions.ts",
  "app/(portal)/portal/ho-so-con/chi-tiet/actions.ts",
  "app/(portal)/portal/ho-so/actions.ts",
  "app/(portal)/portal/khao-sat/_actions.ts",
  "app/(portal)/portal/khao-sat/_eval-actions.ts",
  "app/(portal)/portal/tin-nhan/actions.ts",
  "app/(portal)/portal/yeu-cau/actions.ts",
  "app/(teacher)/teacher/don-tu/_actions.ts",
  "app/(teacher)/teacher/hoan-thanh/_actions.ts",
  "app/(teacher)/teacher/lich/_actions.ts",
];
