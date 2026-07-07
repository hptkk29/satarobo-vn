// AUTO-GENERATED (R6-F1) — whitelist file app/(admin|portal) con import @/lib/db tran.
// Muc tieu: whitelist -> 0. Moi file migrate sang scopedDb(actor) thi XOA entry o day.
// KHONG them file MOI vao day — code moi phai dung scopedDb (ESLint chan).
// Brackets dung glob char-class de match literal [id], [slug]...
export const DB_IMPORT_ALLOWLIST = [
  "app/(admin)/admin/assignments/page.tsx",
  "app/(admin)/admin/canh-bao-rui-ro/page.tsx",
  "app/(admin)/admin/cham-soc-hv/page.tsx",
  "app/(admin)/admin/chuyen-lop/page.tsx",
  "app/(admin)/admin/class-groups/[[]id[]]/edit/page.tsx",
  "app/(admin)/admin/class-groups/[[]id[]]/page.tsx",
  "app/(admin)/admin/class-groups/new/page.tsx",
  "app/(admin)/admin/class-groups/page.tsx",
  "app/(admin)/admin/classes/[[]id[]]/edit/page.tsx",
  "app/(admin)/admin/classes/page.tsx",
  "app/(admin)/admin/enrollments/new/page.tsx",
  "app/(admin)/admin/exams/page.tsx",
  "app/(admin)/admin/hoan-thanh-khoa/page.tsx",
  "app/(admin)/admin/hoc-ba/page.tsx",
  "app/(admin)/admin/hoc-bu/page.tsx",
  "app/(admin)/admin/holidays/new/page.tsx",
  "app/(admin)/admin/holidays/page.tsx",
  "app/(admin)/admin/inventory/audit/new/page.tsx",
  "app/(admin)/admin/jobs/[[]id[]]/edit/page.tsx",
  "app/(admin)/admin/jobs/actions.ts",
  "app/(admin)/admin/jobs/page.tsx",
  // Batch C2 — GIỮ CHỦ ĐÍCH: Survey ∈ SCOPED_MODELS nhưng có record centerId=null hợp
  // lệ (khảo sát chung toàn hệ thống); query list cần "null OR visible" — sdb auto-inject
  // sẽ ẩn nhầm. Đã scope thủ công trong file; chỉ 1 query dùng db trần (xem comment file).
  "app/(admin)/admin/khao-sat/page.tsx",
  "app/(admin)/admin/leads/actions.ts",
  "app/(admin)/admin/leads/page.tsx",
  "app/(admin)/admin/marketing/page.tsx",
  "app/(admin)/admin/nhan-su/[[]id[]]/schedule/page.tsx",
  "app/(admin)/admin/notifications/page.tsx",
  "app/(admin)/admin/parent-requests/bao-vang/_actions.ts",
  "app/(admin)/admin/parent-requests/bao-vang/page.tsx",
  "app/(admin)/admin/rooms/new/page.tsx",
  "app/(admin)/admin/rooms/page.tsx",
  "app/(admin)/admin/satacoin/page.tsx",
  "app/(admin)/admin/sessions/[[]id[]]/edit/page.tsx",
  "app/(admin)/admin/settings/actions.ts",
  "app/(admin)/admin/settings/page.tsx",
  // PORTAL (ownership-scoped, KHÔNG center-scoped) — audit 07/07: mọi read/write đều
  // neo studentId/parentUserId đã verify (requireActiveStudent / assertOwnsStudent /
  // where parentUserId). Actor PARENT không có UserOrgRole → visibleCenterIds = [] →
  // scopedDb trên model SCOPED (Student/Enrollment/ClassSession/Survey/MakeupNeed/
  // StudentCareTask...) sẽ inject `centerId IN []` = PH MẤT SẠCH dữ liệu con. Các file
  // dưới đều chạm ≥1 model SCOPED → GIỮ db trần có chủ đích, KHÔNG swap máy móc.
  "app/(portal)/portal/bai-tap/actions.ts",
  "app/(portal)/portal/bai-thi/[[]examId[]]/page.tsx",
  "app/(portal)/portal/bai-thi/actions.ts",
  "app/(portal)/portal/hinh-anh/page.tsx",
  "app/(portal)/portal/ho-so-con/page.tsx",
  "app/(portal)/portal/ho-so/actions.ts",
  "app/(portal)/portal/khao-sat/_actions.ts",
  "app/(portal)/portal/khao-sat/page.tsx",
  "app/(portal)/portal/yeu-cau/actions.ts",
  "app/(portal)/portal/yeu-cau/page.tsx",
  // R7-15/R7-16 (tech-debt): ReportCard/Eval* KHÔNG thuộc SCOPED_MODELS (scopedDb
  // pass-through) + đã có scope-check thủ công; migrate sang scopedDb khi model được
  // center-scope. Portal dùng ownership (requireActiveStudent), không center-scope.
  "app/(admin)/admin/evaluations/page.tsx",
  "app/(admin)/admin/evaluations/results/[[]roundId[]]/page.tsx",
  "app/(admin)/admin/report-cards/page.tsx",
  "app/(admin)/admin/report-cards/_actions.ts",
  "app/(admin)/admin/report-cards/criteria/page.tsx",
  "app/(admin)/admin/report-cards/[[]enrollmentId[]]/page.tsx",
  "app/(portal)/portal/danh-gia-gv/page.tsx",
  "app/(portal)/portal/danh-gia-gv/_actions.ts",
  "app/(portal)/portal/khao-sat/_eval-actions.ts",
  // LMS-15 (W5c) — ConversationMessage KHÔNG có centerId (không auto-scope được);
  // cách ly đi qua quan hệ enrollment→class + ownership thủ công (assertOwnsStudent /
  // staffOwnsEnrollment qua assignedClassIds + scopedDb.class). Cùng kiểu ReportCard/Eval.
  "app/(admin)/admin/tin-nhan/page.tsx",
  "app/(admin)/admin/tin-nhan/_actions.ts",
  "app/(portal)/portal/tin-nhan/page.tsx",
  "app/(portal)/portal/tin-nhan/actions.ts",
];
