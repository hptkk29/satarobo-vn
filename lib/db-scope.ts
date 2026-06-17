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
    // Nếu không có quyền nào với model này, trả về danh sách rỗng (không thấy gì)
    return [];
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
