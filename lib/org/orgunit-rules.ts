// lib/org/orgunit-rules.ts — Validation rules THUẦN cho OrgUnit (ticket A0-01 §3 V1–V8).
// Không phụ thuộc Prisma/DB → unit-test trực tiếp. Service DB-backed gọi lại các rule này.

import { OrgRuleError, type OrgUnitNode, type OrgUnitType } from "./types";

/** V2 — code: 2–20 ký tự A–Z, 0–9, gạch dưới (sau khi chuẩn hóa uppercase). */
export const ORG_CODE_RE = /^[A-Z0-9_]{2,20}$/;

/** Chuẩn hóa code: trim + uppercase. */
export function normalizeCode(raw: string): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * V2 — Validate + chuẩn hóa code. Trả code đã chuẩn hóa hoặc ném OrgRuleError.
 */
export function validateCode(raw: string): string {
  const code = normalizeCode(raw);
  if (code.length === 0) {
    throw new OrgRuleError("ORG_CODE_REQUIRED", "Mã đơn vị không được để trống.", "code");
  }
  if (!ORG_CODE_RE.test(code)) {
    throw new OrgRuleError(
      "ORG_CODE_INVALID",
      "Mã đơn vị chỉ gồm 2–20 ký tự A–Z, 0–9 hoặc gạch dưới.",
      "code",
    );
  }
  return code;
}

/**
 * V3 — ROOT là duy nhất và có parentId = null; non-ROOT bắt buộc có parentId.
 * `existingRootId` = id ROOT hiện có trong hệ thống (nếu đã có), `selfId` để cho phép update chính ROOT đó.
 */
export function validateRootRule(input: {
  type: OrgUnitType;
  parentId: string | null;
  existingRootId?: string | null;
  selfId?: string | null;
}): void {
  const { type, parentId, existingRootId, selfId } = input;
  if (type === "ROOT") {
    if (parentId !== null) {
      throw new OrgRuleError("ORG_ROOT_HAS_PARENT", "ROOT không được có đơn vị cha.", "parentId");
    }
    if (existingRootId && existingRootId !== selfId) {
      throw new OrgRuleError("ORG_MULTIPLE_ROOT", "Hệ thống chỉ được có một ROOT.", "type");
    }
  } else if (!parentId) {
    throw new OrgRuleError(
      "ORG_PARENT_REQUIRED",
      "Đơn vị không phải ROOT bắt buộc có đơn vị cha.",
      "parentId",
    );
  }
}

/** V7 — centerId chỉ set cho type CENTER. */
export function validateCenterId(type: OrgUnitType, centerId: string | null | undefined): void {
  if (centerId != null && type !== "CENTER") {
    throw new OrgRuleError(
      "ORG_CENTERID_NOT_CENTER",
      "Chỉ đơn vị loại CENTER mới được gắn centerId.",
      "centerId",
    );
  }
}

/**
 * V5 + V6 — Đặt parent cho `nodeId` thành `newParentId` có tạo vòng (cycle) không.
 * True nếu: tự làm cha chính nó (V6), hoặc newParentId là hậu duệ của nodeId (V5).
 */
export function wouldCreateCycle(
  nodes: OrgUnitNode[],
  nodeId: string,
  newParentId: string | null,
): boolean {
  if (newParentId == null) return false;
  if (newParentId === nodeId) return true; // V6 — self parent
  // Cycle nếu nodeId là tổ tiên của newParentId (đặt parent = hậu duệ của mình).
  return isAncestorOf(nodes, nodeId, newParentId);
}

/** a có là tổ tiên (strict, không tính chính nó) của b không — đi theo parent chain của b. */
export function isAncestorOf(nodes: OrgUnitNode[], a: string, b: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(b)?.parentId ?? null;
  const guard = new Set<string>();
  while (cur != null) {
    if (cur === a) return true;
    if (guard.has(cur)) break; // chống vòng dữ liệu bẩn
    guard.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return false;
}
