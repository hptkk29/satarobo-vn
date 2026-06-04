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

export interface PaymentConfig {
  bankBin: string; // mã ngân hàng (BIN) theo chuẩn VietQR, vd 970415 (Vietinbank)
  accountNumber: string;
  accountName: string;
}

export async function getPaymentConfig(): Promise<PaymentConfig | null> {
  const cfg = await db.integrationConfig.findUnique({
    where: { provider: PROVIDER },
    select: { settings: true },
  });
  const s = (cfg?.settings ?? null) as Partial<PaymentConfig> | null;
  if (!s || !s.bankBin || !s.accountNumber || !s.accountName) return null;
  return { bankBin: s.bankBin, accountNumber: s.accountNumber, accountName: s.accountName };
}

export async function setPaymentConfig(input: PaymentConfig): Promise<void> {
  await db.integrationConfig.upsert({
    where: { provider: PROVIDER },
    update: { isEnabled: true, settings: input as unknown as object },
    create: { provider: PROVIDER, isEnabled: true, settings: input as unknown as object },
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
