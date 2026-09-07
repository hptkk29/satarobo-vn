// lib/cham-cong/kiosk-token.ts — mã QR TĨNH dán ở quầy chấm công. THUẦN (chỉ crypto).
//
// Token = `<workLocationId>.v<keyVersion>.<HMAC>`. Không có chỉ số thời gian, KHÔNG HẾT HẠN.
//
// ── Vì sao không còn mã xoay 60s (chốt chủ dự án 07/09/2026) ────────────────────────────
// Bản trước có thêm một họ mã XOAY (`<workLocationId>.<cửa sổ 60s>.<HMAC>`) mà màn TV chiếu và
// làm mới mỗi 30s. Chủ dự án chốt bỏ hẳn: *"bỏ chức năng vòng đời mã 60s đi, mã có hiệu lực vĩnh
// viễn cho đến khi admin ngắt hiệu lực để đổi mã khác nếu muốn"*.
//
// Giữ hai họ mã song song là giữ HAI CỬA VÀO cho cùng một việc — và cửa thứ hai không ai đi:
// trước khi gỡ, cả màn TV lẫn nút In đều đã gọi `?tinh=1`, tức nhánh xoay không còn caller sản
// xuất nào. Một cửa không ai đi nhưng vẫn mở là thứ phải bảo trì mãi và là chỗ để lọt.
//
// ── Mã tĩnh mất gì, và cái gì bù vào ────────────────────────────────────────────────────
// Mất đúng một lớp: cửa sổ 60s. Rủi ro cụ thể là chụp ảnh tờ mã ở quầy rồi gửi nhau, chấm từ nhà.
// Vé một lần (`AttendanceTicket`, 120s) KHÔNG cứu được — người ở xa mở URL là có vé mới; vé chỉ
// chặn bấm lại cùng một lượt. Lớp bù duy nhất còn lại là ĐỊNH VỊ, nên `timelog.ts` CHẶN khi ngoài
// vùng ở điểm đã khai toạ độ. Điểm chưa khai toạ độ ⇒ mã in ra không có lớp chặn nào; màn Điểm
// chấm công nói thẳng điều đó trước khi ai đi dán.
//
// ── Thu hồi ─────────────────────────────────────────────────────────────────────────────
// `keyVersion` là cách DUY NHẤT giết một tờ mã đã in mà không phải đổi `NEXTAUTH_SECRET` — khoá
// đó dùng chung cho session, vé SCORM, cookie portal, OTP; đổi nó là đá sập cả hệ thống. Mất tờ
// giấy / người nghỉ còn giữ ảnh chụp ⇒ tăng `WorkLocation.qrKeyVersion`, in lại, ảnh cũ chết ngay.
import { createHmac, timingSafeEqual } from "crypto";

function signStatic(workLocationId: string, keyVersion: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`kiosk-static:${workLocationId}:${keyVersion}`)
    .digest("base64url")
    .slice(0, 24);
}

/** Token tĩnh: `<workLocationId>.v<keyVersion>.<HMAC>` — không có chỉ số cửa sổ, không hết hạn. */
export function makeStaticKioskToken(
  workLocationId: string,
  keyVersion: number,
  secret: string,
): string {
  return `${workLocationId}.v${keyVersion}.${signStatic(workLocationId, keyVersion, secret)}`;
}

export type StaticVerify =
  | { ok: true; workLocationId: string; keyVersion: number }
  | { ok: false; reason: "FORMAT" | "SIGNATURE" };

/**
 * Kiểm mã tĩnh. KHÔNG kiểm `keyVersion` có còn dùng hay không — việc đó cần đọc DB, làm ở
 * `checkin-gate.ts`. Ở đây chỉ trả về version đọc được để chỗ gọi so với bản đang hiệu lực.
 */
export function verifyStaticKioskToken(token: string, secret: string): StaticVerify {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "FORMAT" };
  const [workLocationId, vStr, sig] = parts;
  if (!workLocationId || !sig || !vStr.startsWith("v")) return { ok: false, reason: "FORMAT" };
  const keyVersion = Number(vStr.slice(1));
  if (!Number.isInteger(keyVersion) || keyVersion < 1) return { ok: false, reason: "FORMAT" };
  const a = Buffer.from(sig);
  const b = Buffer.from(signStatic(workLocationId, keyVersion, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "SIGNATURE" };
  return { ok: true, workLocationId, keyVersion };
}

/**
 * Mã ĐỜI CŨ (họ xoay) — phần giữa là số cửa sổ, không có tiền tố `v`.
 *
 * Giữ hàm này SAU KHI đã gỡ đường xác minh mã xoay, để `checkin-gate.ts` phân biệt được "mã đời
 * cũ đã ngừng dùng" với "mã rác". Người cầm ảnh chụp màn TV cũ cần được bảo đi quét tờ mới, chứ
 * "Mã QR không hợp lệ" thì họ sẽ đứng bấm lại.
 */
export function laMaXoayDoiCu(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts[1].length > 0 && Number.isInteger(Number(parts[1]));
}
