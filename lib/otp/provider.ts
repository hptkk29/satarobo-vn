import "server-only";
import { sendEmail } from "@/lib/email/send";

// =============================================================================
// Cụm A1 — OTP provider abstraction.
// GIAI ĐOẠN ĐẦU chỉ dùng EMAIL (Resend). SMS (SpeedSMS) sẽ cắm sau khi đăng ký
// brandname — KHÔNG build SMS bây giờ, chỉ chừa interface + TODO.
// Provider chính cấu hình qua env OTP_PRIMARY_PROVIDER=email (mặc định email).
// =============================================================================

export type OtpChannelKey = "EMAIL" | "SMS";

export interface OtpSendInput {
  target: string; // email hoặc SĐT
  code: string; // mã 6 số (plain — chỉ để gửi, KHÔNG lưu plain)
  purpose: "ACTIVATION" | "RESET" | "CHANGE_CONTACT";
  minutesValid: number;
}

export interface OtpSendResult {
  ok: boolean;
  provider: string;
  error?: string;
}

export interface OtpProvider {
  channel: OtpChannelKey;
  name: string;
  send(input: OtpSendInput): Promise<OtpSendResult>;
}

const PURPOSE_LABEL: Record<OtpSendInput["purpose"], string> = {
  ACTIVATION: "kích hoạt tài khoản",
  RESET: "đặt lại mật khẩu",
  CHANGE_CONTACT: "đổi thông tin liên hệ",
};

/** Provider EMAIL — gửi mã OTP qua Resend (tái dùng lib/email/send.ts). */
export const emailOtpProvider: OtpProvider = {
  channel: "EMAIL",
  name: "resend",
  async send({ target, code, purpose, minutesValid }) {
    const label = PURPOSE_LABEL[purpose];
    const subject = `Mã ${label} Sata Robo: ${code}`;
    const bodyText = `Mã ${label} của bạn là: ${code}\nMã có hiệu lực trong ${minutesValid} phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.`;
    const bodyHtml = `<div style="font-family:system-ui,sans-serif">
      <p>Mã <b>${label}</b> Sata Robo của bạn là:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:4px;color:#F97316">${code}</p>
      <p style="color:#666">Mã có hiệu lực trong <b>${minutesValid} phút</b>. Vui lòng không chia sẻ mã này.</p>
    </div>`;

    const res = await sendEmail({
      to: target,
      subject,
      bodyText,
      bodyHtml,
      contextType: "OTP",
      triggerType: "SYSTEM",
    });
    return res.ok
      ? { ok: true, provider: "resend" }
      : { ok: false, provider: "resend", error: res.error };
  },
};

// TODO (sau khi có brandname): SmsOtpProvider qua SpeedSMS.
// export const smsOtpProvider: OtpProvider = { channel: "SMS", name: "speedsms", send: ... }

/** Chọn provider theo OTP_PRIMARY_PROVIDER (mặc định email). */
export function getPrimaryOtpProvider(): OtpProvider {
  const pref = (process.env.OTP_PRIMARY_PROVIDER ?? "email").toLowerCase();
  // SMS chưa sẵn sàng → luôn fallback email.
  if (pref === "sms") {
    console.warn("[otp] OTP_PRIMARY_PROVIDER=sms nhưng SMS chưa build — dùng email.");
  }
  return emailOtpProvider;
}
