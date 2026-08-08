// lib/permissions/can.ts — Nền Hệ thống P0 · US-02: engine can() hợp nhất (TS-02 phần ROLE).
//
// PURE + SYNC: chỉ đọc grant ĐÃ NẠP SẴN trên Actor (actor.permissionGrants — bảng
// PermissionGrant MỚI). TUYỆT ĐỐI không đọc UserPermissionGrant cũ — DENY của bảng cũ
// phải tiếp tục bị bỏ qua (test ghim [A0-03-T6-02] xanh nguyên trạng).
//
// Chuỗi resolve (thiết kế duyệt 09/08/2026):
//   1. SUPER_ADMIN → bỏ qua grant (hit:false — chống tự khoá admin bằng DENY nhầm).
//   2. Gom grant khớp key với subjectId ∈ actor.roleIds (ROLE) ∪ actor.groupIds (GROUP,
//      rỗng tới US-03). Không có grant khớp → hit:false → fallback NGUYÊN TRẠNG canV2.
//   3. DENY fieldMask RỖNG + scope khớp target → chặn hẳn action (DENY > ALLOW).
//   4. DENY fieldMask KHÁC rỗng = DENY cấp trường: không chặn action, chỉ góp mask.
//   5. ALLOW: grant ĐÃ nói về key thì nó là nguồn sự thật — scope thoả → true (+mask),
//      scope KHÔNG thoả → false, KHÔNG rơi xuống đường cũ.
import type { Actor, Target } from "@/lib/auth/actor";
import { can as canV2, PermissionError } from "@/lib/auth/can";

/** 1 dòng bảng PermissionGrant đã nạp lên Actor (shape đông cứng — permissions.md AS-BUILT US-01). */
export type GrantRow = {
  subjectType: "ROLE" | "GROUP";
  /** RoleDef.id khi ROLE · UserGroup.id khi GROUP (US-03). */
  subjectId: string;
  permissionKey: string;
  effect: "ALLOW" | "DENY";
  dataScope: "ALL" | "UNIT_AND_BELOW" | "UNIT_ONLY" | "OWN";
  /** Rỗng = toàn action; khác rỗng (DENY) = chỉ che các trường này, không chặn action. */
  fieldMask: string[];
};

export type GrantDecision =
  | { hit: true; allowed: boolean; fieldMask: string[] }
  | { hit: false };

/**
 * dataScope khớp target? — AC3: trước P1 fallback theo centerId hiện hành.
 * - ALL: không lọc (target null vẫn true).
 * - UNIT_AND_BELOW / UNIT_ONLY: target.centerId ∈ roleCenterScope[grant.subjectId] —
 *   PER-ROLE cả hai (review 09/08: neo UNIT_AND_BELOW vào union visibleCenterIds toàn
 *   actor làm grant của role CS1 vươn NGANG sang CS2 qua role kiêm nhiệm không liên
 *   quan). "ALL" = mọi centerId nhưng target null vẫn false; thiếu mapping (vd GROUP
 *   trước US-03) → false. Pre-P1 roleCenterScope đã là subtree-centers nên hai mức
 *   trùng nhau khi role gán tại CENTER; khác biệt thật xuất hiện ở P1 (OrgUnit.path).
 * - OWN: target.createdById === actor.userId (target null → false).
 */
function scopeSatisfied(grant: GrantRow, actor: Actor, target?: Target): boolean {
  switch (grant.dataScope) {
    case "ALL":
      return true;
    case "UNIT_AND_BELOW":
    case "UNIT_ONLY": {
      if (!target?.centerId) return false;
      const scope = actor.roleCenterScope?.[grant.subjectId];
      if (scope == null) return false; // thiếu mapping → an toàn = false
      return scope === "ALL" || scope.includes(target.centerId);
    }
    case "OWN":
      return !!target?.createdById && target.createdById === actor.userId;
    default:
      return false;
  }
}

/**
 * Row ALLOW mang fieldMask khác rỗng là dữ liệu VÔ NGHĨA với engine (mask chỉ dành
 * cho DENY cấp trường — BA §2.5). Bỏ qua row + warn 1 lần/process để không mở quyền
 * RỘNG HƠN ý người cấp một cách im lặng (review 09/08). US-03 sẽ chặn cứng ở write path.
 */
const warnedInvalidAllow = new Set<string>();
function isValidGrantRow(g: GrantRow): boolean {
  if (g.effect === "ALLOW" && g.fieldMask.length > 0) {
    const k = `${g.subjectType}:${g.subjectId}:${g.permissionKey}`;
    if (!warnedInvalidAllow.has(k)) {
      warnedInvalidAllow.add(k);
      console.warn(
        `[permissions] Bỏ qua grant ALLOW có fieldMask (chỉ DENY được mang mask) — ${k}`,
      );
    }
    return false;
  }
  return true;
}

/** Grant thuộc về actor? — subjectId phải nằm trong roleIds/groupIds actor ĐANG giữ. */
function matchesSubject(grant: GrantRow, actor: Actor): boolean {
  const ids = grant.subjectType === "ROLE" ? actor.roleIds : actor.groupIds;
  return ids != null && ids.includes(grant.subjectId);
}

/**
 * Tra bảng grant MỚI cho (actor, key, target). PURE + SYNC.
 * hit:false = bảng grant KHÔNG nói gì về key này → caller fallback đường cũ.
 * Lưu ý: chỉ có DENY cấp trường (không ALLOW nào cùng key) cũng là hit:false —
 * DENY cấp trường không quyết action, chỉ che trường (đọc qua getFieldMask).
 */
export function resolveGrant(actor: Actor, permissionKey: string, target?: Target): GrantDecision {
  if (actor.isSuperAdmin) return { hit: false };

  const matched = (actor.permissionGrants ?? []).filter(
    (g) => g.permissionKey === permissionKey && matchesSubject(g, actor) && isValidGrantRow(g),
  );
  if (matched.length === 0) return { hit: false };

  // DENY toàn action (fieldMask rỗng) thắng mọi ALLOW cùng key — khi scope khớp target.
  for (const g of matched) {
    if (g.effect === "DENY" && g.fieldMask.length === 0 && scopeSatisfied(g, actor, target)) {
      return { hit: true, allowed: false, fieldMask: [] };
    }
  }

  // DENY cấp trường: góp mask (khi scope khớp), không chặn action.
  const fieldMask: string[] = [];
  for (const g of matched) {
    if (g.effect === "DENY" && g.fieldMask.length > 0 && scopeSatisfied(g, actor, target)) {
      for (const f of g.fieldMask) if (!fieldMask.includes(f)) fieldMask.push(f);
    }
  }

  const allows = matched.filter((g) => g.effect === "ALLOW");
  if (allows.length === 0) return { hit: false }; // chỉ DENY cấp trường → không quyết action

  // Grant là nguồn sự thật về key nó nói: scope fail → false, KHÔNG fallback.
  const allowed = allows.some((g) => scopeSatisfied(g, actor, target));
  return { hit: true, allowed, fieldMask };
}

/**
 * can() hợp nhất (luật cứng #1/#2): bảng grant mới nói gì thì theo đó;
 * không nói gì (hit:false) → fallback NGUYÊN TRẠNG can() v2 hiện hành.
 */
export function can(actor: Actor, permissionKey: string, target?: Target): boolean {
  const decision = resolveGrant(actor, permissionKey, target);
  if (decision.hit) return decision.allowed;
  return canV2(actor, permissionKey, target);
}

/**
 * Danh sách trường bị che cho (actor, key, target) — từ DENY cấp trường khớp scope.
 * Tính ĐỘC LẬP với quyết định action: ALLOW có thể đến từ đường cũ (TS-02 nhóm US-03)
 * mà trường vẫn phải che.
 */
export function getFieldMask(actor: Actor, permissionKey: string, target?: Target): string[] {
  if (actor.isSuperAdmin) return [];
  const mask: string[] = [];
  for (const g of actor.permissionGrants ?? []) {
    if (
      g.permissionKey === permissionKey &&
      g.effect === "DENY" &&
      g.fieldMask.length > 0 &&
      matchesSubject(g, actor) &&
      scopeSatisfied(g, actor, target)
    ) {
      for (const f of g.fieldMask) if (!mask.includes(f)) mask.push(f);
    }
  }
  return mask;
}

/** Bản assert cho Server Action — throw PermissionError (tái dùng từ lib/auth/can). */
export function assertCan(actor: Actor, permissionKey: string, target?: Target): void {
  if (!can(actor, permissionKey, target)) throw new PermissionError();
}
