/**
 * Web Push Đợt 1 — sinh một cặp khoá VAPID (RFC 8292).
 *
 *   pnpm exec tsx scripts/tao-khoa-vapid.ts
 *
 * KHÔNG cần DB, KHÔNG cần .env, KHÔNG thêm dependency nào — chỉ `node:crypto`.
 *
 * ⚠️ SCRIPT NÀY CHỈ IN RA MÀN HÌNH, CỐ Ý KHÔNG GHI FILE. Người vận hành tự dán vào Vercel
 * và `.env.local`. Lý do không phải cẩn thận thừa: `.gitignore` chặn `*.key`, `*credentials*`,
 * `*-secret*`, `secret-*` — nhưng một file tên `vapid-keys.txt` / `vapid.json` / `khoa-vapid.md`
 * KHÔNG khớp mẫu nào và sẽ bị `git add .` nuốt gọn. Và đo được ngày 08/09/2026:
 * `.claude/hooks/block-env-add.sh` hiện KHÔNG chạy (nó đọc `$CLAUDE_COMMAND`, biến đó không
 * tồn tại nên hook `exit 0` im lặng) — nên lưới an toàn thật chỉ còn `.gitignore`. Đừng dựa
 * vào hook.
 *
 * ⚠️ TÊN FILE: đừng đổi thành `...-secret...` / `...-key...` — `.gitignore` sẽ nuốt luôn chính
 * script này. Cùng cái bẫy đã ghi ở `scripts/canary-client-bundle-keys.mjs`.
 *
 * MỘT LẦN CHO MỖI MÔI TRƯỜNG, và mỗi lần đổi khoá là MỌI thiết bị đã đăng ký chết 403
 * VapidPkHashMismatch, phải bật lại thông báo trên từng máy. Cột `WebPushSubscription.vapidKeyId`
 * sinh ra để phân biệt ca đó với ca người dùng tự gỡ quyền — nhớ tăng nó khi xoay khoá.
 */
import {
  taoCapKhoaVapid,
  laKhoaCongKhaiVapidHopLe,
  laKhoaRiengVapidHopLe,
  vapidKeyIdTuKhoa,
} from "../lib/push/vapid";

/**
 * CỐ Ý là chỗ trống, KHÔNG phải một địa chỉ dán được.
 *
 * In sẵn `mailto:it@satarobo.vn` thì người vận hành dán cả ba dòng một lượt và cảnh báo "phải là
 * hộp thư CÓ NGƯỜI ĐỌC" ở vài dòng dưới thành vô nghĩa — họ đã dán xong rồi. Để chỗ trống thì
 * dán vào là hỏng NGAY và THẤY NGAY, thay vì hỏng câm sáu tháng sau vào đúng ngày push service
 * gửi cảnh báo cho một hộp thư không tồn tại.
 */
const SUBJECT_CHO_DIEN = "mailto:<ĐIỀN HỘP THƯ CÓ NGƯỜI ĐỌC>";

const { publicKey, privateKey } = taoCapKhoaVapid();

// Tự kiểm trước khi in: thà chết ở đây còn hơn người vận hành dán một cặp khoá hỏng lên
// Vercel rồi mất nửa ngày dò vì push im lặng chứ không báo lỗi.
if (!laKhoaCongKhaiVapidHopLe(publicKey) || !laKhoaRiengVapidHopLe(privateKey)) {
  console.error("Cặp khoá sinh ra KHÔNG đúng khuôn Web Push — dừng, đừng dùng.");
  process.exit(1);
}

console.log(`
╭──────────────────────────────────────────────────────────────────────────────╮
│  CẶP KHOÁ VAPID MỚI — dán tay, KHÔNG lưu ra file nào trong repo               │
╰──────────────────────────────────────────────────────────────────────────────╯

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=${SUBJECT_CHO_DIEN}

Nhãn phiên bản của cặp khoá này: ${vapidKeyIdTuKhoa(publicKey)}
  Suy từ chính khoá công khai, không phải số tự tăng. Đợt 3 ghi giá trị này vào
  WebPushSubscription.vapidKeyId, nên xoay khoá là nhãn TỰ đổi — không ai phải nhớ tăng.

Đặt ở đâu
  · Máy dev      : .env.local  (đã nằm trong .gitignore)
  · Vercel       : Settings → Environment Variables, cho TỪNG môi trường cần bật

Mức nhạy cảm trên Vercel — QUAN TRỌNG, sai là hỏng câm
  · NEXT_PUBLIC_VAPID_PUBLIC_KEY  → phải là biến THƯỜNG (Non-sensitive).
      Biến Sensitive KHÔNG tồn tại lúc build, mà biến NEXT_PUBLIC_ được nhúng
      thẳng vào bundle LÚC BUILD ⇒ để Sensitive là trình duyệt nhận undefined
      và không đăng ký được thiết bị nào, không lỗi nào ở phía server.
  · VAPID_PRIVATE_KEY             → để Sensitive.
  · VAPID_SUBJECT                 → thường.

Chỉ MỘT biến giữ khoá công khai
  Cố ý KHÔNG có VAPID_PUBLIC_KEY riêng cho server: hai biến cùng một giá trị là
  đường mòn dẫn tới ngày xoay khoá sửa sót một bên, và khi đó MỌI push chết 403
  VapidPkHashMismatch mà không typecheck/lint/build nào bắt được. Repo đã có vết
  y hệt với AUTH_SECRET vs NEXTAUTH_SECRET.

VAPID_SUBJECT phải là hộp thư CÓ NGƯỜI ĐỌC
  Push service dùng nó để liên hệ khi hạ tầng của ta gây sự cố. Đặt một địa chỉ
  không ai đọc thì ngày bị bóp kênh, triệu chứng duy nhất ta thấy là push im lặng.

Công tắc kênh KHÔNG nằm ở env
  Bật/tắt Web Push là tham số vận hành: push.webPushEnabled trong
  /admin/cau-hinh-van-hanh (mặc định TẮT). Env chỉ giữ khoá.
`);
