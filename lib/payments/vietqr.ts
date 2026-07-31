import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// Commit 4 — VietQR động. Tài khoản nhận tiền lưu ở IntegrationConfig
// provider="VIETQR" settings { bankBin, accountNumber, accountName }.
// CHỜ NGƯỜI DÙNG cung cấp bank+STK+chủ TK → khi chưa có, mọi helper trả null và
// UI hiển thị "chưa cấu hình". KHÔNG hardcode số tài khoản.
// QR dựng từ ảnh public img.vietqr.io (không cần API key/secret).
// =============================================================================

const PROVIDER = "VIETQR";

/**
 * BGĐ 31/07 — mỗi CƠ SỞ có tài khoản nhận tiền riêng. Lưu cùng bảng IntegrationConfig
 * với khoá `VIETQR:<centerId>`; khoá `VIETQR` trần là cấu hình CHUNG (fallback khi cơ
 * sở chưa cấu hình / đơn không gắn cơ sở). Không đổi schema — provider vốn là unique key.
 */
export function providerKeyForCenter(centerId?: string | null): string {
  return centerId ? `${PROVIDER}:${centerId}` : PROVIDER;
}

export interface PaymentConfig {
  bankBin: string; // mã ngân hàng (BIN) theo chuẩn VietQR, vd 970415 (Vietinbank)
  accountNumber: string;
  accountName: string;
}

function parseConfig(settings: unknown): PaymentConfig | null {
  const s = (settings ?? null) as Partial<PaymentConfig> | null;
  if (!s || !s.bankBin || !s.accountNumber || !s.accountName) return null;
  return { bankBin: s.bankBin, accountNumber: s.accountNumber, accountName: s.accountName };
}

/**
 * Tài khoản nhận tiền: ưu tiên cấu hình CỦA CƠ SỞ, lùi về cấu hình chung.
 * `centerId` null/không cấu hình → dùng cấu hình chung (hành vi cũ).
 */
export async function getPaymentConfig(centerId?: string | null): Promise<PaymentConfig | null> {
  if (centerId) {
    const perCenter = await db.integrationConfig.findUnique({
      where: { provider: providerKeyForCenter(centerId) },
      select: { settings: true },
    });
    const parsed = parseConfig(perCenter?.settings);
    if (parsed) return parsed;
  }
  const cfg = await db.integrationConfig.findUnique({
    where: { provider: PROVIDER },
    select: { settings: true },
  });
  return parseConfig(cfg?.settings);
}

/** Đọc cấu hình ĐÚNG cấp (không fallback) — dùng cho màn cấu hình để biết cơ sở nào đã đặt. */
export async function getPaymentConfigExact(
  centerId?: string | null,
): Promise<PaymentConfig | null> {
  const cfg = await db.integrationConfig.findUnique({
    where: { provider: providerKeyForCenter(centerId) },
    select: { settings: true },
  });
  return parseConfig(cfg?.settings);
}

export async function setPaymentConfig(
  input: PaymentConfig,
  centerId?: string | null,
): Promise<void> {
  const provider = providerKeyForCenter(centerId);
  await db.integrationConfig.upsert({
    where: { provider },
    update: { isEnabled: true, settings: input as unknown as object },
    create: { provider, isEnabled: true, settings: input as unknown as object },
  });
}

/** Bỏ dấu + ký tự lạ cho nội dung chuyển khoản (ngân hàng giới hạn ký tự). */
function sanitize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nội dung CK: "<Họ tên học viên> <SĐT phụ huynh> <Tên khoá>". */
export function buildTransferContent(
  studentName: string,
  parentPhone: string | null | undefined,
  courseName: string | null | undefined,
): string {
  return sanitize([studentName, parentPhone ?? "", courseName ?? ""].filter(Boolean).join(" ")).slice(0, 80);
}

/** URL ảnh VietQR động (compact2 — có logo + số tiền + nội dung). null nếu chưa cấu hình. */
export function buildVietQrImageUrl(
  cfg: PaymentConfig | null,
  amount: number,
  addInfo: string,
): string | null {
  if (!cfg) return null;
  const base = `https://img.vietqr.io/image/${encodeURIComponent(cfg.bankBin)}-${encodeURIComponent(cfg.accountNumber)}-compact2.png`;
  const params = new URLSearchParams();
  if (amount > 0) params.set("amount", String(amount));
  if (addInfo) params.set("addInfo", addInfo);
  params.set("accountName", cfg.accountName);
  return `${base}?${params.toString()}`;
}
