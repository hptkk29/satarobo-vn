import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// Zalo OA token manager — tự gia hạn access_token (sống ngắn) bằng refresh_token.
//
// Token Zalo OA: access_token hết hạn theo `expires_in`; refresh_token sống ~3
// tháng VÀ XOAY VÒNG mỗi lần refresh (refresh_token cũ chết, phải lưu cái mới).
// → Lưu trạng thái vào IntegrationConfig(provider="ZALO_OA").settings.
//
// Seed lần đầu: lấy refresh_token từ env (ZALO_OA_REFRESH_TOKEN). Sau đó DB là
// nguồn sự thật; env chỉ dùng để mồi + fallback khi DB chưa có.
// =============================================================================

const PROVIDER = "ZALO_OA";
const REFRESH_ENDPOINT = "https://oauth.zaloapp.com/v4/oa/access_token";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh sớm 5 phút trước hạn
const FALLBACK_TTL_SEC = 3600; // nếu thiếu expires_in, coi như 1 giờ

export interface ZaloTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

function readStored(settings: unknown): ZaloTokenState | null {
  if (!settings || typeof settings !== "object") return null;
  const s = settings as Record<string, unknown>;
  if (
    typeof s.accessToken === "string" &&
    typeof s.refreshToken === "string" &&
    typeof s.expiresAt === "number"
  ) {
    return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt };
  }
  return null;
}

async function loadStored(): Promise<ZaloTokenState | null> {
  try {
    const cfg = await db.integrationConfig.findUnique({ where: { provider: PROVIDER } });
    return readStored(cfg?.settings);
  } catch {
    return null;
  }
}

async function persist(state: ZaloTokenState): Promise<void> {
  await db.integrationConfig.upsert({
    where: { provider: PROVIDER },
    update: { isEnabled: true, settings: state as object },
    create: { provider: PROVIDER, isEnabled: true, settings: state as object },
  });
}

/**
 * Gọi endpoint refresh của Zalo, lưu + trả token mới (đã tính expiresAt).
 * null nếu thiếu app creds / refresh_token hoặc Zalo trả lỗi.
 */
export async function refreshZaloToken(
  refreshToken: string,
  now: number = Date.now(),
): Promise<ZaloTokenState | null> {
  const appId = process.env.ZALO_APP_ID;
  const secret = process.env.ZALO_APP_SECRET;
  if (!appId || !secret || !refreshToken) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(REFRESH_ENDPOINT, {
      method: "POST",
      headers: { secret_key: secret, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        app_id: appId,
        grant_type: "refresh_token",
      }).toString(),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as
      | { access_token?: string; refresh_token?: string; expires_in?: string | number; error?: number | string; message?: string }
      | null;

    if (!json || !json.access_token || !json.refresh_token) {
      console.warn(`[zalo:token] refresh thất bại: ${json ? JSON.stringify(json) : "no-response"}`);
      return null;
    }

    const expiresInSec =
      typeof json.expires_in === "string" ? parseInt(json.expires_in, 10) : json.expires_in;
    const ttl = Number.isFinite(expiresInSec) && (expiresInSec as number) > 0 ? (expiresInSec as number) : FALLBACK_TTL_SEC;

    const state: ZaloTokenState = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: now + ttl * 1000,
    };
    await persist(state);
    return state;
  } catch (err) {
    console.warn(`[zalo:token] refresh lỗi: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Trả access_token còn hạn; tự refresh khi gần hết hạn. null nếu không cấu hình
 * được (không có token tĩnh lẫn refresh creds).
 */
export async function getValidZaloAccessToken(now: number = Date.now()): Promise<string | null> {
  const stored = await loadStored();

  // Còn hạn (trừ buffer) → dùng luôn, không gọi mạng.
  if (stored && stored.expiresAt - EXPIRY_BUFFER_MS > now) {
    return stored.accessToken;
  }

  // Cần refresh: ưu tiên refresh_token đã lưu, fallback env (seed lần đầu).
  const refreshToken = stored?.refreshToken || process.env.ZALO_OA_REFRESH_TOKEN;
  if (refreshToken) {
    const refreshed = await refreshZaloToken(refreshToken, now);
    if (refreshed) return refreshed.accessToken;
  }

  // Fallback cuối: token đã lưu / token tĩnh env (có thể đã hết hạn).
  return stored?.accessToken || process.env.ZALO_OA_ACCESS_TOKEN || null;
}

/**
 * Buộc refresh ngay (dùng cho cron keep-alive + retry khi gặp lỗi auth).
 * Trả access_token mới, null nếu refresh không thực hiện được.
 */
export async function forceRefreshZaloToken(now: number = Date.now()): Promise<string | null> {
  const stored = await loadStored();
  const refreshToken = stored?.refreshToken || process.env.ZALO_OA_REFRESH_TOKEN;
  if (!refreshToken) return null;
  const refreshed = await refreshZaloToken(refreshToken, now);
  return refreshed?.accessToken ?? null;
}
