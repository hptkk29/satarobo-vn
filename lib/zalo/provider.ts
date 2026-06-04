import "server-only";

// =============================================================================
// Cụm C5 + commit 5 — Zalo OA/ZNS provider.
//  - ZALO_OA_ID mặc định 40213330288531842 (có thể override qua env).
//  - Cần ZALO_OA_ACCESS_TOKEN để gửi. Thiếu → tắt an toàn (service fallback email).
//  - Chỉ gọi API ZNS THẬT khi ZALO_LIVE=true (tránh gửi nhầm khi test). Có token
//    nhưng chưa live → mô phỏng thành công (không gọi API).
// =============================================================================

const DEFAULT_OA_ID = "40213330288531842";
const ZNS_ENDPOINT = "https://business.openapi.zalo.me/message/template";

export interface ZaloSendInput {
  toPhone: string;
  templateKey?: string | null; // = template_id ZNS đã duyệt
  params?: Record<string, string | number>; // = template_data
}

export interface ZaloSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface ZaloProvider {
  name: string;
  isConfigured(): boolean;
  isLive(): boolean;
  send(input: ZaloSendInput): Promise<ZaloSendResult>;
}

function readCreds() {
  return {
    accessToken: process.env.ZALO_OA_ACCESS_TOKEN,
    oaId: process.env.ZALO_OA_ID || DEFAULT_OA_ID,
  };
}

/** SĐT VN → định dạng 84xxxxxxxxx mà ZNS yêu cầu. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("84")) return digits;
  if (digits.startsWith("0")) return "84" + digits.slice(1);
  return digits;
}

export const znsProvider: ZaloProvider = {
  name: "zalo-zns",
  isConfigured() {
    return Boolean(readCreds().accessToken);
  },
  isLive() {
    return this.isConfigured() && process.env.ZALO_LIVE === "true";
  },
  async send(input: ZaloSendInput): Promise<ZaloSendResult> {
    const { accessToken } = readCreds();
    if (!accessToken) return { ok: false, error: "ZALO_NOT_CONFIGURED" };

    if (!this.isLive()) {
      // Có token nhưng chưa bật live → mô phỏng, KHÔNG gọi API thật.
      return { ok: true, providerMessageId: `SIMULATED-${input.toPhone}` };
    }
    // Gửi ZNS thật cần template đã duyệt.
    if (!input.templateKey) return { ok: false, error: "ZALO_NO_TEMPLATE" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(ZNS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: accessToken },
        body: JSON.stringify({
          phone: normalizePhone(input.toPhone),
          template_id: input.templateKey,
          template_data: input.params ?? {},
        }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: number; message?: string; data?: { msg_id?: string } }
        | null;
      // ZNS: error === 0 là thành công.
      if (json && json.error === 0) {
        return { ok: true, providerMessageId: json.data?.msg_id };
      }
      return { ok: false, error: `ZNS_ERR_${json?.error ?? "?"}:${json?.message ?? "unknown"}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "ZNS_FETCH_FAILED" };
    } finally {
      clearTimeout(timer);
    }
  },
};
