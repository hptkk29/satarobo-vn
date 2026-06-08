// lib/auth/can.ts — A0-03: can() v2 (Doc 15 §2.4, OI-7 ALLOW-wins, KHÔNG DENY).
// THUẦN: nhận Actor (đã resolve) + action + target → boolean. Test ma trận không cần DB.
import type { Actor, PermEntry, Target } from "@/lib/auth/actor";

export class PermissionError extends Error {
  readonly code = "PERMISSION_DENIED";
  constructor(message = "Không có quyền thực hiện thao tác này.") {
    super(message);
    this.name = "PermissionError";
  }
}

function scopeMatches(p: PermEntry, actor: Actor, target?: Target): boolean {
  switch (p.scopeType) {
    case "GLOBAL":
      return true;
    case "CENTER":
      if (!target?.centerId) return false; // target thiếu scope → an toàn = false
      return (
        p.centerScope === "ALL" ||
        (Array.isArray(p.centerScope) && p.centerScope.includes(target.centerId))
      );
    case "OWN":
      return !!target?.createdById && target.createdById === actor.userId;
    case "CHILDREN":
      return !!target?.parentUserId && target.parentUserId === actor.userId;
    case "CLASS":
    case "ASSIGNED":
      return !!target?.classId && actor.assignedClassIds.has(target.classId);
    default:
      return false;
  }
}

/**
 * ALLOW-wins: true nếu SUPER_ADMIN, hoặc grant ALLOW, hoặc BẤT KỲ role nào có
 * action với scope khớp target. KHÔNG có DENY override (OI-7, giai đoạn này).
 */
export function can(actor: Actor, action: string, target?: Target): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.grantsAllow.has(action)) return true;
  for (const p of actor.permissions) {
    if (p.action === action && scopeMatches(p, actor, target)) return true;
  }
  return false;
}

export function assertCan(actor: Actor, action: string, target?: Target): void {
  if (!can(actor, action, target)) throw new PermissionError();
}

/** Tập centerId actor nhìn thấy (nền scopedDb A0-04). */
export function getVisibleCenterIds(actor: Actor): string[] {
  return actor.visibleCenterIds;
}

/** Tập action actor có (bỏ qua scope) — cho UI ẩn/hiện nhanh. */
export function getEffectivePermissions(actor: Actor): Set<string> {
  const s = new Set<string>(actor.grantsAllow);
  for (const p of actor.permissions) s.add(p.action);
  return s;
}
