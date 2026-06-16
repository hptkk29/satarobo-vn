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
]);

function bypassesScope(actor: Actor): boolean {
  return actor.isSuperAdmin || actor.isHoLevel;
}

/** Inject filter centerId vào args (THUẦN — test được). Không scope → trả nguyên args. */
export function injectScope<A>(model: string, args: A, actor: Actor): A {
  if (!SCOPED_MODELS.has(model) || bypassesScope(actor)) return args;
  const a = (args ?? {}) as { where?: unknown };
  const scopeWhere = { centerId: { in: actor.visibleCenterIds } };
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
  return record.centerId != null && actor.visibleCenterIds.includes(record.centerId);
}

/**
 * Prisma Client mở rộng đã cách ly theo `actor`. Đọc + count/aggregate/groupBy bị scope;
 * findUnique lọc hậu kỳ (IDOR → null). bypass=true (job hạ tầng) → db trần + ghi audit.
 */
export function scopedDb(actor: Actor, opts?: { bypass?: boolean }) {
  const bypass = opts?.bypass ?? false;
  // Cả 2 nhánh đi qua $extends để type đồng nhất; bypass chỉ bỏ bước inject.
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
