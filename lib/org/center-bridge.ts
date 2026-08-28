// lib/org/center-bridge.ts — Nền Hệ thống P1 · US-07: cầu ánh xạ Center ↔ OrgUnit,
// và BẢNG PHÂN LOẠI quyết định bảng nào được backfill kiểu gì.
//
// ĐÂY LÀ NGUỒN SỰ THẬT DUY NHẤT cho cả ba thứ: migration backfill, cơ chế ghi kép
// (lib/org/dual-write.ts) và script đối soát đêm. Ba chỗ đọc CÙNG một bảng dữ liệu —
// nếu tách ra thì đến ngày lệch nhau không ai biết chỗ nào đúng.

/**
 * Nghĩa của `centerId = NULL` KHÁC NHAU theo từng bảng. Backfill mù là hỏng dữ liệu, và
 * đối soát mù là báo giả hàng loạt cho tới lúc cả đội quen bỏ qua alert.
 *
 * ⚠️ ĐỪNG dùng `NULL_IS_GLOBAL_MODELS` của `lib/db-scope.ts` làm định nghĩa nhóm này.
 * Tập đó gộp `BankTransaction` chung rổ với `Survey`/`EvaluationRound` dù ngữ nghĩa hoàn
 * toàn khác: khảo sát null = "áp cho mọi cơ sở", còn giao dịch ngân hàng null = "TIỀN VỀ
 * CHƯA ĐỐI KHỚP, đang chờ người xử lý".
 */
export type CenterNullMeaning =
  /** centerId luôn phải có giá trị ⇒ orgUnitId cũng phải đủ. Lệch = lỗi thật. */
  | "BAT_BUOC"
  /** null = ÁP DỤNG TOÀN HỆ THỐNG. Phải GIỮ null, không được "điền cho đủ". */
  | "NULL_TOAN_HE_THONG"
  /** null = CHƯA KHỚP, chờ người xử lý. Giữ null, nhưng đếm riêng để nhìn thấy tồn đọng. */
  | "NULL_CHUA_KHOP"
  /**
   * Bảng của PR-A (15/06) chưa ai rà xem NULL nghĩa là gì. ĐẾM và HIỆN, nhưng "thiếu
   * orgUnitId" KHÔNG tính là lệch — chỉ "sai ánh xạ" mới tính. Rà xong thì chuyển sang
   * một trong ba nhóm trên kèm bằng chứng.
   */
  | "CHUA_RA_SOAT";

export type BackfillSpec = {
  /** Tên model Prisma = tên bảng (repo này không dùng @@map). */
  model: string;
  nullMeaning: CenterNullMeaning;
  /** Có nằm trong SCOPED_MODELS của lib/db-scope.ts không — dòng NULL sẽ TÀNG HÌNH ở P4. */
  scoped: boolean;
  /** Ghi chú nghiệp vụ: vì sao xếp nhóm này (bằng chứng, không phải phỏng đoán). */
  vi: string;
};

/**
 * 24 bảng có `centerId` mà CHƯA có `orgUnitId` (đo trên schema 11/08/2026).
 * 28 bảng còn lại đã có cột từ migration `20260615083728_pr_a_add_orgunitid` (15/06).
 */
export const BACKFILL_SPECS: readonly BackfillSpec[] = [
  // ── Vận hành lõi: centerId suy từ lớp/học viên, luôn phải có ────────────────
  {
    model: "Enrollment",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "ghi danh — suy từ class.centerId",
  },
  {
    model: "ClassSession",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "buổi học — suy từ class.centerId",
  },
  {
    model: "Attendance",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "điểm danh — session→class.centerId",
  },
  {
    model: "ReportCard",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "học bạ — enrollment.centerId",
  },
  {
    model: "CourseCompletionRequest",
    nullMeaning: "BAT_BUOC",
    scoped: false,
    vi: "hoàn thành khoá — enrollment→class.centerId",
  },
  {
    model: "StudentBirthdayGreeting",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "chúc sinh nhật — student.centerId",
  },
  {
    model: "TrialClassV2",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "lớp trải nghiệm V2 — có centerId trực tiếp",
  },
  {
    model: "LeadTrialHistory",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "lịch sử học thử — trialClass.centerId",
  },
  {
    model: "ConversationMessage",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "hệ chat CŨ — enrollment.centerId",
  },
  {
    model: "LeadAssignmentConfig",
    nullMeaning: "BAT_BUOC",
    scoped: false,
    vi: "centerId là String @unique NOT NULL — comment ở db-scope.ts nói null=toàn hệ thống là SAI so với schema",
  },

  // ── Tiền: mọi dòng đều thuộc một cơ sở, và đây là nhóm sai một dòng là lệch sổ ─
  {
    model: "Payment",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "phiếu thu — order.centerId",
  },
  {
    model: "PaymentRequest",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "yêu cầu thu — order.centerId",
  },
  {
    model: "PaymentAllocation",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "phân bổ — paymentRequest→order.centerId",
  },
  {
    model: "CreditBalance",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "số dư — order.centerId",
  },
  {
    model: "RefundRequest",
    nullMeaning: "BAT_BUOC",
    scoped: false,
    vi: "hoàn tiền — enrollment→class.centerId",
  },
  {
    model: "QrSession",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "phiên QR — paymentRequest.centerId",
  },

  // ── null = TOÀN HỆ THỐNG: điền vào là HỎNG NGHĨA ───────────────────────────
  {
    model: "Affiliate",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: false,
    vi: "mã ?ref= dùng chung — điền cơ sở là khoá mã về 1 cơ sở",
  },
  {
    model: "EvaluationRound",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: true,
    vi: "vòng đánh giá SYSTEM/TEACHER_EVAL — điền vào thành vòng của 1 cơ sở",
  },
  {
    model: "RevenueTarget",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: false,
    vi: "mục tiêu doanh thu cấp HO/toàn hệ thống",
  },
  {
    model: "SataCoinRule",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: false,
    vi: "quy tắc điểm mặc định toàn hệ thống",
  },
  {
    model: "WorkShiftConfig",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: false,
    vi: "ca làm mặc định toàn hệ thống",
  },
  {
    model: "FacebookPageMapping",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: false,
    vi: "scopeType=HO thì centerId null có nghĩa",
  },

  // ── null = CHƯA KHỚP: giữ null nhưng phải NHÌN THẤY tồn đọng ────────────────
  {
    model: "BankTransaction",
    nullMeaning: "NULL_CHUA_KHOP",
    scoped: true,
    vi: "tiền về CHƯA đối khớp (payos-ingest tạo dòng không set centerId; khớp xong mới điền). Nếu P4 lật scope sang orgUnitId mà quên chép luật OR-null thì tiền vừa về TÀNG HÌNH.",
  },
  {
    model: "WorkRequest",
    nullMeaning: "NULL_CHUA_KHOP",
    scoped: false,
    vi: "đơn từ chưa gắn cơ sở — suy được từ người gửi nhưng không đoán thay người dùng",
  },

  // ── Rà 12/08/2026: 8 bảng chuyển từ PR_A_MODELS sang đây, có BẰNG CHỨNG ĐO ─────
  // Tiêu chí chuyển (cả bốn phải đạt, đo trên DB dev bằng SQL trực tiếp):
  //   ① bảng CÓ dữ liệu (bảng rỗng thì chưa kết luận được gì)
  //   ② 0 dòng `centerId IS NULL`  ⇒ cột này thực sự bắt buộc, không phải "chưa khớp"
  //   ③ 0 dòng có centerId mà thiếu orgUnitId ⇒ backfill đã phủ hết
  //   ④ 0 dòng ánh xạ lệch          ⇒ ghi kép đang chạy đúng
  // Hai mươi bảng còn lại vẫn ở PR_A_MODELS: 8 bảng RỖNG và 12 bảng CÓ dòng
  // `centerId = NULL` — cái sau cần người hiểu nghiệp vụ trả lời "NULL ở đây nghĩa
  // là gì", đo không thay được. Xem số liệu trong docs/nen-he-thong/RUNBOOK-P1.md.
  {
    model: "Class",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "lớp học — 36 dòng, 0 NULL (đo 12/08)",
  },
  {
    model: "Room",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "phòng học — 11 dòng, 0 NULL; phòng luôn thuộc một cơ sở",
  },
  {
    model: "ClassGroup",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "nhóm lớp — 8 dòng, 0 NULL",
  },
  {
    model: "EmployeeCheckin",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "chấm công — 10 dòng, 0 NULL; luôn chấm tại một cơ sở",
  },
  {
    model: "CenterDayChecklist",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "checklist ngày của cơ sở — 2 dòng, 0 NULL; tên bảng đã nói rõ",
  },
  {
    model: "MakeupNeed",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "nhu cầu học bù — 8 dòng, 0 NULL; suy từ buổi vắng",
  },
  {
    model: "TimesheetAdjustmentRequest",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "đề nghị chỉnh công — 4 dòng, 0 NULL; gắn ca làm tại cơ sở",
  },
  {
    model: "SataCoinTransaction",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "giao dịch SataCoin — 3 dòng, 0 NULL; gắn học viên của cơ sở",
  },

  // ── G.2 + B.8 (28/08/2026) — ba bảng mới của khu vực C và B ─────────────────
  {
    model: "LeadChild",
    nullMeaning: "BAT_BUOC",
    scoped: true,
    vi: "con của lead — SL-08, centerId backfill từ Lead cha; NULL = lead chưa gán cơ sở",
  },
  {
    model: "CostEntry",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: true,
    vi: "khoản chi — NULL = chi phí CẤP CÔNG TY (thuê VP hội sở, lương HO), không phân bổ ở v1",
  },
  {
    model: "LeadTarget",
    nullMeaning: "NULL_TOAN_HE_THONG",
    scoped: false,
    vi: "chỉ tiêu lead cấp toàn hệ thống — song sinh RevenueTarget",
  },
] as const;

/** Model → spec, tra nhanh. */
export const BACKFILL_SPEC_BY_MODEL: ReadonlyMap<string, BackfillSpec> =
  new Map(BACKFILL_SPECS.map((s) => [s.model, s]));

/**
 * 28 bảng ĐÃ có sẵn cả hai cột từ migration PR-A (15/06) — đo lại bằng `information_schema`
 * ngày 11/08, KHÔNG chép tay (bản chép tay đầu tiên sai 11 tên và bị [US-07-IT-09] bắt).
 *
 * Chúng CHƯA được rà nghiệp vụ để biết `centerId = NULL` ở đó nghĩa là gì, nên xếp riêng
 * `CHUA_RA_SOAT` thay vì gán bừa `BAT_BUOC`. Khác biệt thực tế: với nhóm này, "thiếu
 * orgUnitId" được ĐẾM và HIỆN trong báo cáo nhưng KHÔNG tính là lệch — kêu sói mỗi đêm
 * trên 28 bảng chưa ai duyệt là cách nhanh nhất khiến cả đội thôi đọc alert. Riêng "sai
 * ánh xạ" thì luôn là lỗi, không phụ thuộc nhóm.
 *
 * Rà xong bảng nào thì CHUYỂN nó sang BACKFILL_SPECS với bằng chứng — đó là cách nợ này
 * giảm dần thay vì nằm im.
 */
export const PR_A_MODELS: readonly string[] = [
  // ── 8 bảng RỖNG: chưa có dòng nào nên không suy ra được `NULL` nghĩa là gì ────
  "ConversationMembershipDrift",
  "InventoryAudit",
  "MessengerConversation",
  "StockBalance",
  "StockMovement",
  "StudentCenterHistory",
  "StudentRiskAlert",
  "SurveyResponse",
  // ── 12 bảng CÓ dòng `centerId = NULL` (số trong ngoặc, đo 12/08) ─────────────
  //    Đây mới là phần cần NGƯỜI trả lời: NULL là "toàn hệ thống" (như ngày lễ
  //    quốc gia) hay "chưa khớp được cơ sở" (như lead mới về)? Hai nghĩa đó dẫn
  //    tới hai cách xử lý ngược nhau ở P4, nên không đoán.
  "User", // 15 NULL — tài khoản không thuộc cơ sở nào (quản trị, phụ huynh)?
  "Lead", // 20 NULL — lead chưa phân cơ sở?
  "Student", //  6 NULL
  "Holiday", //  6 NULL — nghỉ lễ toàn hệ thống?
  "Order", //  3 NULL
  "Employee", //  2 NULL — nhân sự Hội sở?
  "TrialClass", //  2 NULL
  "Survey", //  2 NULL
  "StudentCareTask", //  2 NULL
  "ShiftRegistration", //  1 NULL
  "Conversation", //  1 NULL
  "Notification", //  1 NULL
] as const;

/**
 * MỌI model phải ghi kép `centerId` → `orgUnitId`.
 * = 24 bảng US-07 vừa thêm cột + 28 bảng PR-A đã có cột.
 */
export const DUAL_WRITE_MODELS: ReadonlySet<string> = new Set<string>([
  ...BACKFILL_SPECS.map((s) => s.model),
  ...PR_A_MODELS,
]);

/**
 * Câu SQL suy `orgUnitId` từ `centerId` — dùng CHUNG cho migration backfill và script
 * đối soát, để hai bên không bao giờ trả lời khác nhau.
 *
 * HAI nhánh, và nhánh thứ hai là thứ bắt buộc phải có:
 *  1. `OrgUnit.centerId = <centerId>` — đường thường.
 *  2. `OrgUnit.code = Center.code` — CẦU CHO CENTER MỒ CÔI. Center "hoi-so" (code "HO")
 *     không được OrgUnit nào trỏ tới, vì luật V7 cấm đơn vị HO mang `centerId`. Đã thử
 *     nới luật đó ở US-05 và phải GỠ: nó làm màn nhân sự neo vai của người Hội sở TẠI HO
 *     ⇒ `isHoLevel` ⇒ thấy mọi cơ sở (xem ghi chú dài ở lib/org/orgunit-rules.ts).
 *     Cầu theo `code` giải đúng bài toán ánh xạ mà KHÔNG nạp thêm nghĩa cho cột `centerId`,
 *     và không đường quyền nào đọc hàm này.
 */
export const ORG_UNIT_FOR_CENTER_SQL = `
  SELECT ou."id"
  FROM "OrgUnit" ou
  WHERE ou."deletedAt" IS NULL AND ou."centerId" = c."id"
  UNION ALL
  SELECT ou2."id"
  FROM "OrgUnit" ou2
  WHERE ou2."deletedAt" IS NULL
    AND ou2."centerId" IS NULL
    AND c."code" IS NOT NULL
    AND ou2."code" = c."code"
  LIMIT 1
`;
