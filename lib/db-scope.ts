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
  // R7-15/R7-16 (tech-debt — xem db-import-allowlist): ReportCard/EvaluationRound dùng
  // bare db + manual scope-check (ownership/center) trong lib/lms/* + lib/eval/*. CHƯA
  // auto-scope: ReportCard.centerId nullable, EvaluationRound có round TEACHER_EVAL
  // centerId=null (toàn hệ thống) → inject `centerId IN ...` sẽ ẩn nhầm. TODO: chuyển
  // sang SCOPED_MODELS + scopedDb khi 2 model này center-scope hẳn.
  "ReportCard",
  "EvaluationRound",
  // W3-1 — RefundRequest scope qua quan hệ enrollment→class (Class là SCOPED_MODEL);
  // centerId chỉ là snapshot nullable (HO/centerId null), inject `centerId IN` sẽ ẩn nhầm.
  "RefundRequest",
  // LMS-16 — RevenueTarget là config mục tiêu; centerId null = toàn hệ thống.
  "RevenueTarget",
  // LMS-18 (W5f phase A) — centerId ĐÃ thêm + backfill nhưng CHƯA flip sang SCOPED_MODELS.
  // Cách ly hiện vẫn qua classId IN scopedClassIds (manual) — giữ EXEMPT để KHÔNG đổi hành vi
  // đọc. Phase B (shadow-rollout + e2e cách ly) sẽ chuyển 3 model này sang SCOPED_MODELS.
  "ClassSession",
  "Attendance",
  "Enrollment",
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
  const scopeWhere = { centerId: { in: visibleCenters } };
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

  return record.centerId != null && visibleCenters.includes(record.centerId);
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
  "ClassSession", // buổi ứng viên (vốn không scoped, liệt kê để rõ ý định)
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
