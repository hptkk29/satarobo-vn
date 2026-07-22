/**
 * R6-A — Service cấu hình 2 tầng (DB + cache + audit + guard quyền).
 *
 * - getSetting(key, { orgUnitId? }) → resolve Center → Global → default (cache TTL 60s).
 * - setGlobalSetting(actor, …) → chỉ SUPER_ADMIN (US-R6A-1 AC1).
 * - setCenterSetting(actor, …) → CENTER_MANAGER của cơ sở đó / SUPER_ADMIN (AC2),
 *   chỉ cho key centerOverridable.
 * Mọi mutation: validate (AC4) + reason bắt buộc + ghi AuditLog (AC3) + clear cache.
 */
import { safeCache, safeUpdateTag } from "@/lib/cache/safe-cache";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit/audit-log";
import { CACHE_TAGS } from "@/lib/cache/tags";
import {
  getSettingDef,
  validateSettingValue,
  SETTINGS,
  type SettingKey,
  type SettingDef,
} from "./registry";
import { resolveSettingValue } from "./resolve";

/** Kiểu giá trị resolve được cho mỗi key (suy từ default trong registry). */
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]["default"];

// ── Cache (REQ-12) ─────────────────────────────────────────────────────────
// safeCache = unstable_cache cross-request/instance + invalidate qua tag (thay Map
// per-process cũ — clearSettingsCache trước chỉ xoá 1 instance serverless → instance
// khác stale ≤60s). safeCache fallback gọi thẳng khi ngoài request context (test/script)
// → không ném incrementalCache. Cache GIÁ TRỊ ĐÃ RESOLVE (JSON) để tránh serialize Date.
const getResolvedSettingCached = safeCache(
  async (key: string, orgUnitId: string | null): Promise<unknown> => {
    const def = getSettingDef(key) as SettingDef | undefined;
    if (!def) throw new Error(`Unknown setting key: ${key}`);
    const [centerRow, globalRow] = await Promise.all([
      orgUnitId && def.centerOverridable
        ? db.centerSetting.findUnique({ where: { orgUnitId_key: { orgUnitId, key } } })
        : Promise.resolve(null),
      db.systemSetting.findUnique({ where: { key } }),
    ]);
    return resolveSettingValue({ def, centerRow, globalRow });
  },
  ["setting-resolve"],
  { tags: [CACHE_TAGS.settings], revalidate: 300 },
);

/** Xoá cache settings (sau mutation + cho test) — invalidate tag toàn hệ thống. */
export function clearSettingsCache(): void {
  safeUpdateTag(CACHE_TAGS.settings);
}

// ── Đọc ───────────────────────────────────────────────────────────────────
/**
 * Lấy giá trị 1 setting. `orgUnitId` = OrgUnit.id của cơ sở (để xét override);
 * bỏ trống = chỉ Global → default.
 */
export async function getSetting<K extends SettingKey>(
  key: K,
  opts?: { orgUnitId?: string | null },
): Promise<SettingValue<K>> {
  const def = getSettingDef(key) as SettingDef | undefined;
  if (!def) throw new Error(`Unknown setting key: ${key}`);
  const orgUnitId = opts?.orgUnitId ?? null;
  return (await getResolvedSettingCached(key, orgUnitId)) as never;
}

/** Lấy nhiều key cùng lúc (cho trang admin). */
export async function getResolvedSettings(
  keys: SettingKey[],
  orgUnitId?: string | null,
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    keys.map(async (k) => [k, await getSetting(k, { orgUnitId })] as const),
  );
  return Object.fromEntries(entries);
}

// ── Ghi ────────────────────────────────────────────────────────────────────
export type SetResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string; field?: string } };

function fail(code: string, message: string, field?: string): SetResult {
  return { ok: false, error: { code, message, field } };
}

const MANAGER_ROLE_CODES = new Set(["CENTER_MANAGER", "SUPER_ADMIN"]);

/** SUPER_ADMIN sửa GLOBAL. */
export async function setGlobalSetting(
  actor: Actor,
  params: { key: string; value: unknown; reason: string; actorName: string },
): Promise<SetResult> {
  if (!actor.isSuperAdmin) {
    return fail("FORBIDDEN", "Chỉ SUPER_ADMIN được sửa cấu hình toàn hệ thống");
  }
  if (!params.reason?.trim()) {
    return fail("VALIDATION", "Lý do thay đổi là bắt buộc", "reason");
  }
  const v = validateSettingValue(params.key, params.value);
  if (!v.ok) return fail("VALIDATION", v.error, params.key);

  const old = await db.systemSetting.findUnique({ where: { key: params.key } });
  await db.systemSetting.upsert({
    where: { key: params.key },
    create: {
      key: params.key,
      valueJson: v.value as never,
      updatedById: actor.userId,
      updatedByName: params.actorName,
    },
    update: {
      valueJson: v.value as never,
      updatedById: actor.userId,
      updatedByName: params.actorName,
    },
  });
  await writeAudit({
    actor: { id: actor.userId, name: params.actorName },
    module: "settings",
    entityType: "SystemSetting",
    entityId: params.key,
    action: old ? "UPDATE" : "CREATE",
    oldValues: old ? { value: old.valueJson } : null,
    newValues: { value: v.value },
    reason: params.reason,
  });
  clearSettingsCache();
  return { ok: true };
}

/** CENTER_MANAGER của cơ sở (hoặc SUPER_ADMIN) override theo cơ sở. */
export async function setCenterSetting(
  actor: Actor,
  params: { orgUnitId: string; key: string; value: unknown; reason: string; actorName: string },
): Promise<SetResult> {
  const allowed =
    actor.isSuperAdmin ||
    actor.orgRoles.some(
      (r) => r.orgUnitId === params.orgUnitId && MANAGER_ROLE_CODES.has(r.roleCode),
    );
  if (!allowed) {
    return fail("FORBIDDEN", "Không có quyền sửa cấu hình cơ sở này");
  }
  const def = getSettingDef(params.key);
  if (!def) return fail("VALIDATION", `Key cấu hình không hợp lệ: ${params.key}`, params.key);
  if (!def.centerOverridable) {
    return fail("VALIDATION", "Key này chỉ cấu hình ở cấp toàn hệ thống", params.key);
  }
  if (!params.reason?.trim()) {
    return fail("VALIDATION", "Lý do thay đổi là bắt buộc", "reason");
  }
  const v = validateSettingValue(params.key, params.value);
  if (!v.ok) return fail("VALIDATION", v.error, params.key);

  const old = await db.centerSetting.findUnique({
    where: { orgUnitId_key: { orgUnitId: params.orgUnitId, key: params.key } },
  });
  await db.centerSetting.upsert({
    where: { orgUnitId_key: { orgUnitId: params.orgUnitId, key: params.key } },
    create: {
      orgUnitId: params.orgUnitId,
      key: params.key,
      valueJson: v.value as never,
      updatedById: actor.userId,
      updatedByName: params.actorName,
    },
    update: {
      valueJson: v.value as never,
      updatedById: actor.userId,
      updatedByName: params.actorName,
    },
  });
  await writeAudit({
    actor: { id: actor.userId, name: params.actorName },
    module: "settings",
    entityType: "CenterSetting",
    entityId: `${params.orgUnitId}:${params.key}`,
    action: old ? "UPDATE" : "CREATE",
    oldValues: old ? { value: old.valueJson } : null,
    newValues: { value: v.value },
    reason: params.reason,
    orgUnitId: params.orgUnitId,
  });
  clearSettingsCache();
  return { ok: true };
}
