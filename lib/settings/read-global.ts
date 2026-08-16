// lib/settings/read-global.ts — đọc MỘT setting cấp GLOBAL, không kéo theo gì khác.
//
// ── VÌ SAO TÁCH KHỎI `service.ts` ──────────────────────────────────────────────────
// `service.ts` có cả đường GHI, mà đường ghi cần `Actor` (guard quyền) và `writeAudit`.
// Nên `service.ts` → `actor.ts`. Khi `actor.ts` cần đọc một cờ, import ngược lại thành
// VÒNG: actor → service → actor (và vòng dài hơn qua audit-log). `lint:boundaries` chặn
// đúng chỗ đó, và chặn đúng: vòng import làm hai module không tách/test rời được.
//
// File này chỉ có đường ĐỌC cấp GLOBAL nên không cần Actor, không cần audit. Nó dùng
// chung `registry` + `resolve` + cache tag với `service.ts`, nên ghi qua `service.ts`
// vẫn xoá cache của đây — KHÔNG có nguồn sự thật thứ hai.
import { safeCache } from "@/lib/cache/safe-cache";
import { db } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { getSettingDef, type SettingDef } from "./registry";
import { resolveSettingValue } from "./resolve";

const doc = safeCache(
  async (key: string): Promise<unknown> => {
    const def = getSettingDef(key) as SettingDef | undefined;
    if (!def) throw new Error(`Unknown setting key: ${key}`);
    const globalRow = await db.systemSetting.findUnique({ where: { key } });
    return resolveSettingValue({ def, centerRow: null, globalRow });
  },
  ["setting-global"],
  { tags: [CACHE_TAGS.settings], revalidate: 300 },
);

/**
 * Giá trị GLOBAL của một key (bỏ qua override theo cơ sở).
 *
 * Dùng cho cờ hệ thống — thứ KHÔNG được phép lệch nhau giữa các cơ sở. Cần xét override
 * theo cơ sở thì dùng `getSetting` trong `service.ts`.
 */
export async function getGlobalSetting(key: string): Promise<unknown> {
  return doc(key);
}
