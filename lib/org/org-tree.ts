// lib/org/org-tree.ts — Thuật toán cây OrgUnit THUẦN (ticket A0-01 §3 helper).
// Quan trọng (Doc 15 OI-1): ROOT → HO, CS1, CS2 là các node ĐỘC LẬP NGANG HÀNG.
// => getSubtreeCenterIds(HO) = [] (HO không phải cha của CS1/CS2). Quyền cross-center
//    của role HO KHÔNG đến từ subtree của HO mà do ActorResolver xử lý riêng (ticket A0-03).

import type { OrgUnitNode } from "./types";

const isLive = (n: OrgUnitNode): boolean => n.deletedAt == null && n.isActive !== false;

function indexBy(nodes: OrgUnitNode[]): Map<string, OrgUnitNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Con trực tiếp (mặc định chỉ node còn sống). */
export function getChildren(
  nodes: OrgUnitNode[],
  id: string,
  opts: { includeDeleted?: boolean } = {},
): OrgUnitNode[] {
  return nodes.filter(
    (n) => n.parentId === id && (opts.includeDeleted || isLive(n)),
  );
}

/** Toàn bộ hậu duệ (BFS, không gồm chính nó; mặc định chỉ node còn sống). */
export function getDescendants(
  nodes: OrgUnitNode[],
  id: string,
  opts: { includeDeleted?: boolean } = {},
): OrgUnitNode[] {
  const out: OrgUnitNode[] = [];
  const queue = [...getChildren(nodes, id, opts)];
  const seen = new Set<string>();
  while (queue.length) {
    const n = queue.shift()!;
    if (seen.has(n.id)) continue; // chống vòng dữ liệu bẩn
    seen.add(n.id);
    out.push(n);
    queue.push(...getChildren(nodes, n.id, opts));
  }
  return out;
}

/**
 * Mọi centerId thuộc subtree của `id` (gồm chính nó nếu là CENTER).
 * Dùng cho scopedDb (ticket A0-04): visibleCenterIds của role tại 1 OrgUnit.
 */
export function getSubtreeCenterIds(
  nodes: OrgUnitNode[],
  id: string,
  opts: { includeDeleted?: boolean } = {},
): string[] {
  const self = indexBy(nodes).get(id);
  const scope = self ? [self, ...getDescendants(nodes, id, opts)] : getDescendants(nodes, id, opts);
  const ids: string[] = [];
  for (const n of scope) {
    if (!opts.includeDeleted && !isLive(n)) continue;
    if (n.type === "CENTER" && n.centerId) ids.push(n.centerId);
  }
  return ids;
}

/** Đường đi từ node lên ROOT, GỒM chính nó: [self, parent, ..., root]. */
export function getAncestors(nodes: OrgUnitNode[], id: string): OrgUnitNode[] {
  const byId = indexBy(nodes);
  const out: OrgUnitNode[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur != null) {
    const node = byId.get(cur);
    if (!node || seen.has(cur)) break;
    seen.add(cur);
    out.push(node);
    cur = node.parentId;
  }
  return out;
}

/** a có là tổ tiên (strict) của b không. */
export function isAncestor(nodes: OrgUnitNode[], a: string, b: string): boolean {
  if (a === b) return false;
  return getAncestors(nodes, b)
    .slice(1) // bỏ chính b
    .some((n) => n.id === a);
}
