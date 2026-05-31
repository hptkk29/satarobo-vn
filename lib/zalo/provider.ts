import "server-only";

// =============================================================================
// Cụm C5 — Zalo OA/ZNS provider abstraction (SKELETON).
// Mô phỏng theo OTP/email provider. CHƯA gọi API thật: chỉ chừa interface + TODO.
// Bật gửi thật cần ĐỦ credential + cờ ZALO_LIVE=true (tránh gửi nhầm).
// =============================================================================

export interface ZaloSendInput {
  toPhone: string;
  templateKey?: string | null;
  params?: Record<string, string | number>;
}

export interface ZaloSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface ZaloProvider {
  name: string;
  /** Đủ credential để gửi không? Thiếu → adapter tắt an toàn. */
  isConfigured(): boolean;
  /** Có thực sự gửi API thật không (cần ZALO_LIVE=true ngoài credential). */
  isLive(): boolean;
  send(input: ZaloSendInput): Promise<ZaloSendResult>;
}

function readCreds() {
  return {
    appId: process.env.ZALO_APP_ID,
    accessToken: process.env.ZALO_OA_ACCESS_TOKEN,
    oaId: process.env.ZALO_OA_ID,
  };
}

export const znsProvider: ZaloProvider = {
  name: "zalo-zns",
  isConfigured() {
    const c = readCreds();
    return Boolean(c.appId && c.accessToken);
  },
  isLive() {
    return this.isConfigured() && process.env.ZALO_LIVE === "true";
  },
  async send(input: ZaloSendInput): Promise<ZaloSendResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: "ZALO_NOT_CONFIGURED" };
    }
    if (!this.isLive()) {
      // Có credential nhưng chưa bật live → mô phỏng thành công, KHÔNG gọi API thật.
      return { ok: true, providerMessageId: `SIMULATED-${input.toPhone}` };
    }
    // TODO(C5): tích hợp ZNS thật khi go-live:
    //   POST https://business.openapi.zalo.me/message/template
    //   headers: { access_token }, body: { phone, template_id: templateKey, template_data: params }
    // Hiện chưa có API key thật → trả lỗi rõ ràng để fallback email.
    return { ok: false, error: "ZALO_LIVE_NOT_IMPLEMENTED" };
  },
};
