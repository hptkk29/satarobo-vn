// lib/db-scope.ts — A0-04: scopedDb(actor) ép cách ly cơ sở ở TẦNG truy vấn (P3, Doc 15 §4.4).
// CỔNG AN TOÀN DỮ LIỆU. Tự inject `centerId IN visibleCenterIds` cho SCOPED_MODELS.
//
// ⚠️ GIỚI HẠN: Prisma client extension chỉ chạy cho query TOP-LEVEL. Nested `include`
// KHÔNG được auto-scope → khi include model scoped khác, PHẢI tự thêm `where` (xem AC7).
import { db } from "@/lib/db";
import { logRbacAudit } from "@/lib/audit/log";
import type { Actor } from "@/lib/auth/actor";

/** Model (PascalCase) có centerId VÀ phải cách ly theo cơ sở. */
export const SCOPED_MODELS = new Set<string>([
  "Lead", "Order", "Student", "Class", "ClassGroup", "TrialClass", "Room", "Holiday",
  "InventoryAudit", "StockBalance", "StockMovement", "Employee", "EmployeeCheckin",
  "CenterDayChecklist", "MakeupNeed", "Notification", "ShiftRegistration",
  "SataCoinTransaction", "StudentCareTask", "StudentCenterHistory", "StudentRiskAlert",
  "Survey", "SurveyResponse", "TimesheetAdjustmentRequest",
  "MessengerConversation", // R1-01 — hội thoại CRM theo cơ sở
  "Payment", // R7-04 — khoản thanh toán theo cơ sở
  "TrialClassV2", // R7-02 — lớp trải nghiệm theo cơ sở
  "LeadTrialHistory", // FL-R2 — lịch sử học thử theo cơ sở
  // FL3-02 (W5f phase B) — centerId backfilled (denormalized từ class). Flip EXEMPT→SCOPED.
  // ⚠️ DEPLOY-GATE: chỉ an toàn sau khi backfill Enrollment/ClassSession.centerId = 100%
  // (centerId null sẽ bị inject `centerId IN [...]` → ẨN NHẦM record). Xem e2e cách ly.
  "Enrollment", // FL3-02 — đăng ký học theo cơ sở (trước scope tay qua class.centerId)
  "ClassSession", // FL3-02 — buổi học theo cơ sở; vẫn ∈ MAKEUP_EXCEPTION_MODELS (đọc chéo khi học bù)
  // #04 (08/07) — flip EXEMPT→SCOPED. Điều kiện đã đạt: centerId backfill prod = 0 null +
  // mọi đường tạo Attendance set centerId (attendance/_actions, parent-requests,
  // recordAttendance — commit 6a8ba7a). Cách ly: HO/SUPER thấy toàn bộ; center-actor chỉ
  // cơ sở mình. Reads bị scope = sdb.attendance (marking/báo cáo/sessions). Makeup đọc
  // Attendance qua raw db (KHÔNG qua scopedDb) → KHÔNG cần MAKEUP_EXCEPTION.
  "Attendance",
  // #03 Pha B (10/07) — flip sau khi PROD xác nhận 0 null (msg_null=rc_null=enr_null=0).
  // Pha A đã thêm cột + backfill + ép mọi đường tạo set centerId.
  "ReportCard", // học bạ theo cơ sở (centerId denormalize từ Enrollment)
  "ConversationMessage", // tin nhắn PH↔nhân viên theo cơ sở
  "EvaluationRound", // ⚠️ centerId null = vòng TOÀN HỆ THỐNG → xem NULL_IS_GLOBAL_MODELS
]);

/**
 * Model mà `centerId = NULL` mang nghĩa "bản ghi TOÀN HỆ THỐNG", không phải "chưa gán".
 *
 * Với các model này, inject `centerId IN (...)` trần sẽ ẩn nhầm bản ghi chung — đó là lý
 * do `Survey` và `EvaluationRound` trước đây phải scope tay / nằm ngoài scopedDb. Nay
 * scopedDb hiểu semantics đó: `centerId IS NULL OR centerId IN (...)`.
 *
 * KHÔNG thêm model thường vào đây: với chúng, centerId null = dữ liệu chưa backfill và
 * PHẢI bị chặn, không được biến thành "ai cũng thấy".
 */
export const NULL_IS_GLOBAL_MODELS = new Set<string>([
  "Survey", // khảo sát chung (không gắn cơ sở)
  "SurveyResponse", // phản hồi của khảo sát chung
  "EvaluationRound", // vòng đánh giá scope SYSTEM / TEACHER_EVAL
]);

// FIX-C3 (B1) — soft-delete đã chuyển lên TẦNG base `db` (lib/soft-delete.ts + lib/db.ts)
// để bắt cả read `db` trần. Re-export để call-site/test import từ đây vẫn chạy.
export { SOFT_DELETE_MODELS, injectSoftDelete } from "@/lib/soft-delete";

/** Có centerId nhưng KHÔNG scope (lý do rõ) — để introspection không báo "miss model". */
export const SCOPE_EXEMPT = new Set<string>([
  "OrgUnit", // centerId = link Center cũ (hạ tầng tổ chức)
  "User", // identity/auth — đọc toàn cục
  "LeadAssignmentConfig", // config, centerId null = quy tắc toàn hệ thống
  "SataCoinRule", // config, centerId null = áp mọi cơ sở
  "FacebookPageMapping", // mapping Page→center (cấu hình hạ tầng, không phải dữ liệu nghiệp vụ)
  "WorkShiftConfig", // R6-B2 — cấu hình ca per-center, centerId null = mặc định toàn hệ thống
  // LMS-16 — RevenueTarget là config mục tiêu KPI; centerId null = mục tiêu toàn hệ
  // thống; scope tay qua getRevenueTargets. (Trước đây khai báo lặp 2 lần — đã dọn.)
  "RevenueTarget",
  // (#03 Pha B, 10/07 — ReportCard / EvaluationRound / ConversationMessage đã rời khỏi đây
  //  sang SCOPED_MODELS sau khi PROD xác nhận 0 dòng centerId NULL.)
  // W3-1 — RefundRequest scope qua quan hệ enrollment→class (Class là SCOPED_MODEL);
  // centerId chỉ là snapshot nullable (HO/centerId null), inject `centerId IN` sẽ ẩn nhầm.
  "RefundRequest",
  // RBAC-DECISION #5 (06/07) — Center LÀ ranh giới tenant, không tự scope theo chính
  // nó (self-referential, sẽ vỡ mọi thao tác cross-center hợp lệ: HO xem toàn bộ
  // center, branch switcher, super-admin list center). Lớp bảo vệ PHẢI là permission
  // tường minh ở call-site (assertCan/can theo actor.visibleCenterIds), KHÔNG phải
  // auto-filter tầng query. TODO: audit các nơi `db.center.findMany` để đảm bảo
  // non-HO/non-SUPER_ADMIN actor không list được center ngoài visibleCenterIds.
  "Center",
]);

function bypassesScope(actor: Actor): boolean {
  return actor.isSuperAdmin;
}

/** Trả về danh sách tiền tố action (prefix) liên quan đến model. */
export function getModelPrefixes(model: string): string[] {
  switch (model) {
    case "Lead":
    case "MessengerConversation":
      return ["leads:"];
    case "Order":
      return ["orders:"];
    case "Payment":
      return ["payments:"];
    case "Student":
    case "StudentCareTask":
    case "StudentCenterHistory":
    case "StudentRiskAlert":
      return ["students:"];
    case "Class":
    case "ClassGroup":
      return ["classes:", "class_group:"];
    case "ReportCard":
      // Học bạ gắn ghi danh. TRAINING@HO (report-cards:* GLOBAL, centerScope ALL) → cả 2
      // cơ sở, đúng câu 55 (Toại duyệt học bạ liên cơ sở). CM@CS1 → chỉ CS1.
      return ["report-cards:", "enrollments:"];
    case "ConversationMessage":
      // Tin nhắn PH↔nhân viên gắn ghi danh/lớp. GV (classes:view-own @center) chỉ thấy cơ
      // sở mình; Đào tạo/HO thấy cross-center giống lớp & học viên.
      return ["classes:", "enrollments:"];
    case "EvaluationRound":
      return ["evaluations:"];
    case "Enrollment":
      // report-cards: cũng map vào đây — học bạ gắn với enrollment. Nhờ vậy TRAINING@HO
      // (report-cards:* + students/classes:view-all) đọc được ghi danh cả 2 cơ sở để làm
      // học bạ, còn CENTER_MANAGER@CS1 (enrollments:* @CS1) vẫn chỉ thấy CS1.
      return ["enrollments:", "report-cards:"];
    case "Attendance":
      // #04 flip EXEMPT→SCOPED nhưng QUÊN map prefix → rơi vào fallback `isHoLevel ? ALL`,
      // tức bất kỳ ai có 1 role HO đều thấy điểm danh toàn hệ thống bất kể chức năng.
      // Điểm danh là dữ liệu đào tạo: bám attendance:/classes: giống ClassSession.
      return ["attendance:", "classes:"];
    case "LeadTrialHistory":
      // Dữ liệu LEAD (lịch sử học thử của lead) — KHÔNG phải dữ liệu đào tạo. Thiếu map
      // → fallback ALL → Đào tạo/HO nhìn thấy lead cơ sở khác. Bám đúng `leads:`.
      return ["leads:"];
    case "ClassSession":
      // Buổi học gắn lớp → map cả action sessions: lẫn classes: (ai quản lý lớp ở cơ sở
      // nào thì thấy buổi cơ sở đó). GV có classes:view-own/sessions:view → scope cơ sở mình.
      return ["sessions:", "classes:"];
    case "TrialClass":
    case "TrialClassV2":
    case "MakeupNeed":
      return ["trials:", "completions:", "classes:"];
    case "Room":
      return ["rooms:", "centers:"];
    case "Holiday":
      return ["holidays:", "centers:"];
    case "InventoryAudit":
    case "StockBalance":
    case "StockMovement":
      return ["inventory:"];
    case "Employee":
      return ["employees:"];
    case "EmployeeCheckin":
    case "ShiftRegistration":
    case "TimesheetAdjustmentRequest":
      return ["hr_attendance:"];
    case "CenterDayChecklist":
      return ["centers:", "hr_attendance:"];
    case "Notification":
      return ["notifications:"];
    case "SataCoinTransaction":
      return ["satacoin:"];
    case "Survey":
    case "SurveyResponse":
      return ["parent-feedback:", "khao-sat:"];
    default:
      return [];
  }
}

/** Trả về danh sách centerId được phép hoặc "ALL" cho model cụ thể của actor. */
export function getModelVisibleCenterIds(model: string, actor: Actor): "ALL" | string[] {
  if (actor.isSuperAdmin) return "ALL";

  const prefixes = getModelPrefixes(model);
  if (prefixes.length === 0) {
    // Nếu model không được map prefix, fallback về cách xử lý cũ: HO-level xem tất cả, center-level theo visibleCenterIds.
    return actor.isHoLevel ? "ALL" : actor.visibleCenterIds;
  }

  const allowedCenters = new Set<string>();
  let hasAll = false;
  let hasAnyPermissionForModel = false;

  for (const p of actor.permissions) {
    if (prefixes.some((prefix) => p.action.startsWith(prefix))) {
      hasAnyPermissionForModel = true;
      if (p.centerScope === "ALL") {
        hasAll = true;
        break;
      } else if (Array.isArray(p.centerScope)) {
        p.centerScope.forEach((c) => allowedCenters.add(c));
      }
    }
  }

  // Check grantsAllow (per-user overrides)
  for (const action of actor.grantsAllow) {
    if (prefixes.some((prefix) => action.startsWith(prefix))) {
      hasAnyPermissionForModel = true;
      hasAll = true; // per-user grants are global exceptions
      break;
    }
  }

  if (hasAll) return "ALL";
  if (!hasAnyPermissionForModel) {
    // scopedDb là cổng CÁCH LY CƠ SỞ (data isolation), KHÔNG phải cổng phân quyền
    // action — việc cho/cấm action do can() lo. Thiếu action model-specific KHÔNG đồng
    // nghĩa "không thấy gì"; vẫn lọc theo tầm nhìn cơ sở từ cây OrgUnit:
    // HO/ROOT → cross-center (ALL); center-level → visibleCenterIds.
    return actor.isHoLevel ? "ALL" : actor.visibleCenterIds;
  }
  return Array.from(allowedCenters);
}

/** Inject filter centerId vào args (THUẦN — test được). Không scope → trả nguyên args. */
export function injectScope<A>(model: string, args: A, actor: Actor): A {
  if (!SCOPED_MODELS.has(model) || bypassesScope(actor)) return args;

  const visibleCenters = getModelVisibleCenterIds(model, actor);
  if (visibleCenters === "ALL") return args;

  const a = (args ?? {}) as { where?: unknown };
  // #03 Pha B — với NULL_IS_GLOBAL_MODELS, `centerId = NULL` nghĩa là "toàn hệ thống",
  // KHÔNG phải "chưa gán". Inject `centerId IN (...)` trần sẽ ẩn nhầm bản ghi chung
  // (khảo sát chung, vòng đánh giá SYSTEM/TEACHER_EVAL) → dùng OR-null.
  const scopeWhere = NULL_IS_GLOBAL_MODELS.has(model)
    ? { OR: [{ centerId: null }, { centerId: { in: visibleCenters } }] }
    : { centerId: { in: visibleCenters } };
  return { ...a, where: a.where ? { AND: [a.where, scopeWhere] } : scopeWhere } as A;
}

/** Record đọc được (findUnique) có nằm trong scope của actor không (chống IDOR). */
export function passesScope(
  model: string,
  record: { centerId?: string | null } | null | undefined,
  actor: Actor,
): boolean {
  if (!record) return false;
  if (!SCOPED_MODELS.has(model) || bypassesScope(actor)) return true;

  const visibleCenters = getModelVisibleCenterIds(model, actor);
  if (visibleCenters === "ALL") return true;

  // Bản ghi "toàn hệ thống" (centerId null hợp lệ) → ai cũng đọc được. Với model thường,
  // centerId null = dữ liệu hỏng/chưa backfill → CHẶN (an toàn), giữ nguyên hành vi cũ.
  if (record.centerId == null) return NULL_IS_GLOBAL_MODELS.has(model);

  return visibleCenters.includes(record.centerId);
}

/**
 * Prisma Client mở rộng đã cách ly theo `actor`. Đọc + count/aggregate/groupBy bị scope;
 * findUnique lọc hậu kỳ (IDOR → null). bypass=true (job hạ tầng) → db trần + ghi audit.
 */
export function scopedDb(actor: Actor, opts?: { bypass?: boolean }) {
  const bypass = opts?.bypass ?? false;
  // Chỉ lo SCOPE (cách ly cơ sở). Soft-delete đã được base `db` xử lý cho mọi model
  // SOFT_DELETE_MODELS (kể cả qua $extends này), nên KHÔNG lặp lại ở đây.
  return db.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          return query(bypass ? args : injectScope(model, args, actor));
        },
        async findFirst({ model, args, query }) {
          return query(bypass ? args : injectScope(model, args, actor));
        },
        async count({ model, args, query }) {
          return query(bypass ? args : injectScope(model, args, actor));
        },
        async aggregate({ model, args, query }) {
          return query(bypass ? args : injectScope(model, args, actor));
        },
        async groupBy({ model, args, query }) {
          return query(bypass ? args : injectScope(model, args, actor));
        },
        async findUnique({ model, args, query }) {
          // Soft-delete null-filter do base `db` lo; ở đây chỉ chống IDOR theo scope.
          const r = await query(args);
          if (bypass) return r;
          return passesScope(model, r as { centerId?: string | null } | null, actor)
            ? r
            : null;
        },
        async findFirstOrThrow({ model, args, query }) {
          return query(bypass ? args : injectScope(model, args, actor));
        },
      },
    },
  });
}

// =============================================================================
// R7-08 — Makeup cross-center EXCEPTION (QĐ-O2).
// Luồng học bù LIÊN CƠ SỞ cần đọc CHÉO cơ sở (lớp/buổi/nhu cầu bù ở CS khác) để
// gợi ý + xếp bù. Exception này HẸP: chỉ nới scope cho whitelist model dưới đây,
// MỌI model khác (Lead/Order/Student/Payment...) VẪN bị cách ly nguyên vẹn (AC6).
// CHỈ dùng bên trong lib/makeup/service.ts + roster "Học bù" của trang điểm danh.
// =============================================================================

/** Model được ĐỌC CHÉO cơ sở trong luồng makeup. KHÔNG gồm Lead/Order/Student. */
export const MAKEUP_EXCEPTION_MODELS = new Set<string>([
  "Class", // lớp đích ở cơ sở khác (scoped → cần nới để xếp bù chéo)
  "ClassSession", // buổi ứng viên — FL3-02 đã SCOPED, exception nới để xếp bù chéo cơ sở
  "Lesson", // bài giảng (không scoped)
  "MakeupNeed", // nhu cầu bù: GV cơ sở đích đọc HS bù theo makeupSessionId
]);

/** Model `model` có được miễn cách ly trong luồng makeup không? (THUẦN — test). */
export function isMakeupExceptionModel(model: string): boolean {
  return MAKEUP_EXCEPTION_MODELS.has(model);
}

/**
 * scopedDb biến thể cho luồng học bù liên cơ sở: model ∈ MAKEUP_EXCEPTION_MODELS
 * → đọc chéo cơ sở; model khác → scope y như scopedDb(actor) (cách ly nguyên vẹn).
 * Exception là FUNCTION-SCOPED: chỉ client trả về ở đây mới nới — không rò sang
 * scopedDb thường hay query khác (AC6).
 */
export function withMakeupException(actor: Actor) {
  const bypass = bypassesScope(actor); // SUPER_ADMIN/HO vốn cross-center
  const inject = <A>(model: string, args: A): A =>
    bypass || MAKEUP_EXCEPTION_MODELS.has(model) ? args : injectScope(model, args, actor);
  return db.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          return query(inject(model, args));
        },
        async findFirst({ model, args, query }) {
          return query(inject(model, args));
        },
        async count({ model, args, query }) {
          return query(inject(model, args));
        },
        async aggregate({ model, args, query }) {
          return query(inject(model, args));
        },
        async groupBy({ model, args, query }) {
          return query(inject(model, args));
        },
        async findUnique({ model, args, query }) {
          const r = await query(args);
          if (bypass || MAKEUP_EXCEPTION_MODELS.has(model)) return r;
          return passesScope(model, r as { centerId?: string | null } | null, actor)
            ? r
            : null;
        },
        async findFirstOrThrow({ model, args, query }) {
          return query(inject(model, args));
        },
      },
    },
  });
}

/** Ghi AuditLog mỗi lần bypass scope (AC10). Gọi khi dùng scopedDb(actor,{bypass:true}). */
export async function logScopeBypass(actor: Actor, reason: string): Promise<void> {
  await logRbacAudit({
    entity: "ROLE", // tái dùng bảng RbacAuditLog; entityId = userId, action = mô tả bypass
    entityId: actor.userId,
    action: "UPDATE",
    actorId: actor.userId,
    actorName: "scopedDb-bypass",
    reason: `SCOPE_BYPASS: ${reason}`,
  });
}
