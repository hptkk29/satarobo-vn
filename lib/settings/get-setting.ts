// lib/settings/get-setting.ts — R6-A: đọc/ghi SystemSetting (DB) + cache TTL ≤60s.
// US-R6A AC1: đổi value trên UI → có hiệu lực ≤60s không cần restart.
// US-R6A AC2: key chưa có row → trả default (registry), không lỗi runtime.
import { db } from "@/lib/db";
import {
  parseSetting,
  settingDefault,
  type SettingKey,
  type SettingValue,
} from "./registry";

const TTL_MS = 60_000;

type CacheEntry = { value: unknown; expires: number };
const cache = new Map<SettingKey, CacheEntry>();

/** Đọc 1 setting (typed theo registry). Cache 60s; miss/invalid → default an toàn. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.value as SettingValue<K>;
  }
  let parsed: SettingValue<K>;
  try {
    const row = await db.systemSetting.findUnique({ where: { key } });
    parsed = row ? parseSetting(key, row.value) : settingDefault(key);
  } catch {
    // DB lỗi → vẫn chạy bằng default (AC2 — không chặn nghiệp vụ).
    parsed = settingDefault(key);
  }
  cache.set(key, { value: parsed, expires: Date.now() + TTL_MS });
  return parsed;
}

/** Ghi 1 setting (validate qua registry). Trả về giá trị đã chuẩn hóa. */
export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  updatedById?: string,
): Promise<SettingValue<K>> {
  const normalized = parseSetting(key, value);
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value: normalized as object, updatedById: updatedById ?? null },
    update: { value: normalized as object, updatedById: updatedById ?? null },
  });
  cache.set(key, { value: normalized, expires: Date.now() + TTL_MS });
  return normalized;
}

/** Xóa cache (dùng khi cần đọc tức thì sau khi ghi ngoài luồng setSetting). */
export function invalidateSettingCache(key?: SettingKey): void {
  if (key) cache.delete(key);
  else cache.clear();
}
