// AUTO-GENERATED (R6-F1) — whitelist file app/(admin|portal) con import @/lib/db tran.
// Muc tieu: whitelist -> chi con exception HOP LE. Moi file migrate sang scopedDb(actor)
// thi XOA entry o day. KHONG them file MOI vao day — code moi phai dung scopedDb (ESLint chan).
// Brackets dung glob char-class de match literal [id], [slug]...
//
// #03 (08/07): dọn 28 entry STALE (file đã migrate) + migrate 5 file jobs/settings
// (JobPosting/Center/User non-scoped → scopedDb pass-through). 58 → 25 entry.
// 25 entry còn lại đều là EXCEPTION HỢP LỆ (không migrate máy móc được):
//   - Loại B cross-center: leads/actions.ts (dedup SĐT toàn hệ thống cố ý).
//   - Portal (PARENT visibleCenterIds=[] → scopedDb ẩn sạch): ownership-scoped tay.
//   - Model KHÔNG có centerId: ReportCard/Evaluation*/ConversationMessage/Survey(null hợp lệ).
// Muốn xuống ≤15 cần: portal ownership-scope + center-scope các model trên (task riêng).
export const DB_IMPORT_ALLOWLIST = [
  // ── Loại B — scope tay + read cross-center CỐ Ý (scopedDb không diễn tả được) ──
  // leads/actions.ts: mọi read Lead đã guard passesScope('Lead',...); NHƯNG createLeadManual
  // + updateLeadFields check trùng SĐT TOÀN HỆ THỐNG (kể cả cơ sở khác) → swap scopedDb sẽ
  // VỠ dedup cross-center. Giữ db trần có chủ đích.
  "app/(admin)/admin/leads/actions.ts",
  // Survey ∈ SCOPED_MODELS nhưng có record centerId=null hợp lệ (khảo sát chung); query list
  // cần "null OR visible" — sdb auto-inject sẽ ẩn nhầm. Đã scope thủ công trong file.
  "app/(admin)/admin/khao-sat/page.tsx",

  // ── PORTAL (ownership-scoped, KHÔNG center-scoped) — audit 07/07: mọi read/write neo
  // studentId/parentUserId đã verify (requireActiveStudent / assertOwnsStudent / where
  // parentUserId). Actor PARENT không có UserOrgRole → visibleCenterIds=[] → scopedDb trên
  // model SCOPED (Student/Enrollment/ClassSession/Survey/MakeupNeed/StudentCareTask...) sẽ
  // inject `centerId IN []` = PH MẤT SẠCH dữ liệu con. Giữ db trần có chủ đích. ──
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
  "app/(portal)/portal/danh-gia-gv/page.tsx",
  "app/(portal)/portal/danh-gia-gv/_actions.ts",
  "app/(portal)/portal/khao-sat/_eval-actions.ts",
  "app/(portal)/portal/tin-nhan/page.tsx",
  "app/(portal)/portal/tin-nhan/actions.ts",

  // ── Model KHÔNG thuộc SCOPED_MODELS (scopedDb pass-through) + đã scope-check thủ công;
  // migrate khi model được center-scope. ReportCard/Eval*: enrollment→class.centerId thủ
  // công. ConversationMessage (LMS-15): không có centerId → ownership/assignedClassIds. ──
  "app/(admin)/admin/evaluations/page.tsx",
  "app/(admin)/admin/evaluations/results/[[]roundId[]]/page.tsx",
  "app/(admin)/admin/report-cards/page.tsx",
  "app/(admin)/admin/report-cards/_actions.ts",
  "app/(admin)/admin/report-cards/criteria/page.tsx",
  "app/(admin)/admin/report-cards/[[]enrollmentId[]]/page.tsx",
  "app/(admin)/admin/tin-nhan/page.tsx",
  "app/(admin)/admin/tin-nhan/_actions.ts",
];
