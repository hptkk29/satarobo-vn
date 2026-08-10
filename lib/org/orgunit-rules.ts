// lib/org/orgunit-rules.ts — Validation rules THUẦN cho OrgUnit (ticket A0-01 §3 V1–V8).
// Không phụ thuộc Prisma/DB → unit-test trực tiếp. Service DB-backed gọi lại các rule này.

import { ORG_PARENT_RULES, OrgRuleError, type OrgUnitNode, type OrgUnitType } from "./types";

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
 * V3 — ROOT là duy nhất và có parentId = null; non-ROOT bắt buộc có parentId… TRỪ HO.
 *
 * NỚI Ở P1 · US-05: hình cây chốt 11/08 đặt HO ở GỐC (BA 08/08 §1.1), tức HO hợp lệ khi
 * parentId = null. Node ROOT "SATAROBO" cũ vẫn được luật chấp nhận để cây trên DB đang
 * chạy không bị coi là sai trong lúc chưa dời (script reshape chạy tay).
 *
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
  } else if (!parentId && type !== "HO") {
    throw new OrgRuleError(
      "ORG_PARENT_REQUIRED",
      "Đơn vị không phải ROOT/HO bắt buộc có đơn vị cha.",
      "parentId",
    );
  }
}

/**
 * V7 — centerId chỉ set cho CENTER… và HO.
 *
 * NỚI Ở P1 · US-05, có chủ đích. Hệ đang chạy có bản ghi `Center` id="hoi-so" (prisma/seed.ts:47)
 * mà KHÔNG OrgUnit nào trỏ tới, vì luật cũ cấm HO mang centerId. Hệ quả đo được: mọi bản
 * ghi gắn HO đi qua `orgUnitIdForCenter('hoi-so')` đều nhận NULL âm thầm ⇒ khi P4 lật
 * scopedDb sang orgUnitId thì TOÀN BỘ dữ liệu HO biến mất. Cho HO mang centerId là cách
 * rẻ nhất bịt lỗ đó mà không đụng 73 call-site đang đọc bảng Center.
 *
 * KHÔNG kéo theo việc HO thành "một cơ sở": `getSubtreeCenterIds`/`allCenterIds` vẫn lọc
 * đúng `type === "CENTER"`, nên centerId của HO không lọt vào phạm vi cơ sở của ai cả.
 * Chỗ duy nhất dùng tới nó là cầu ánh xạ 2 chiều Center ↔ OrgUnit của US-07.
 */
export function validateCenterId(type: OrgUnitType, centerId: string | null | undefined): void {
  if (centerId != null && type !== "CENTER" && type !== "HO") {
    throw new OrgRuleError(
      "ORG_CENTERID_NOT_CENTER",
      "Chỉ đơn vị loại CENTER (hoặc HO — bản ghi Center 'hoi-so' cũ) mới được gắn centerId.",
      "centerId",
    );
  }
}

/**
 * V9 (P1 · US-05 AC3) — loại đơn vị cha có hợp lệ với loại con không.
 * Luật được AC gọi tên: **CENTER không được làm cha của REGION**.
 * Bảng luật ở `ORG_PARENT_RULES` (lib/org/types.ts) — thêm loại mới là thêm 1 dòng dữ liệu,
 * không phải thêm một nhánh if.
 */
export function validateParentType(
  type: OrgUnitType,
  parentType: OrgUnitType | null | undefined,
): void {
  const allowed = ORG_PARENT_RULES[type] ?? [];
  if (parentType == null) {
    // Không cha = đứng gốc. Chỉ loại KHÔNG có cha hợp lệ nào mới được đứng gốc…
    // …hoặc HO, vốn là gốc thật của cây theo BA §1.1.
    if (type === "ROOT" || type === "HO") return;
    throw new OrgRuleError(
      "ORG_PARENT_REQUIRED",
      `Đơn vị loại ${type} bắt buộc có đơn vị cha.`,
      "parentId",
    );
  }
  if (!allowed.includes(parentType)) {
    throw new OrgRuleError(
      "ORG_PARENT_TYPE_INVALID",
      `Đơn vị loại ${parentType} không được làm cha của đơn vị loại ${type}.`,
      "parentId",
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
