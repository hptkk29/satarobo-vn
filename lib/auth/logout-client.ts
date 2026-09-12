"use client";

import { signOut } from "next-auth/react";
import { huyThietBiTheoEndpointAction } from "@/app/(admin)/admin/settings/_push-actions";

/**
 * URL cổng đăng nhập dùng khi đăng xuất — quyết định TẠI THỜI ĐIỂM click (không đọc
 * `window` ở module-level → an toàn SSR).
 *
 * GATE (Q41): cổng login CHUNG (`satarobo.vn/login`) chỉ bật khi
 * `NEXT_PUBLIC_COMMON_LOGIN === "true"` — phải bật ĐỒNG BỘ với F4
 * (`COMMON_LOGIN_AT_ROOT`) + F2 (`AUTH_COOKIE_DOMAIN`) SAU flip. MẶC ĐỊNH (chưa bật):
 * `/login` tương đối GIỮ host hiện tại — TƯƠNG ĐƯƠNG hành vi cũ `signOut({callbackUrl:"/login"})`,
 * nên deploy trong tuần flip KHÔNG đổi behavior.
 * - `NEXT_PUBLIC_LOGIN_URL` set → override thẳng (staging/preview).
 * - Site test (`test.satarobo.vn`) → `/login` tương đối (cổng login RIÊNG, KHÔNG
 *   đẩy về prod dù host cũng kết thúc `.satarobo.vn`).
 * - Bật cổng chung + đang ở domain prod thật (`*.satarobo.vn`) → `https://satarobo.vn/login`.
 * - Còn lại (chưa bật, localhost, `*.vercel.app`) → `/login` tương đối (giữ host).
 */
function resolveLoginGateUrl(): string {
  const configured = process.env.NEXT_PUBLIC_LOGIN_URL?.trim();
  if (configured) return configured;

  const host = window.location.hostname;

  // Site test có cổng login riêng — logout GIỮ NGUYÊN host (test.satarobo.vn/login),
  // không gộp về prod. Đặt TRƯỚC nhánh `.satarobo.vn` (test cũng khớp đuôi đó) và
  // trước cả gate-off để đúng kể cả khi NEXT_PUBLIC_COMMON_LOGIN được set nhầm ở env test.
  if (host === "test.satarobo.vn") return "/login";

  // Gate-off: cổng chung chưa bật → giữ host hiện tại (hành vi cũ).
  if (process.env.NEXT_PUBLIC_COMMON_LOGIN !== "true") return "/login";

  if (host === "satarobo.vn" || host.endsWith(".satarobo.vn")) {
    return "https://satarobo.vn/login";
  }
  return "/login";
}

/**
 * Đăng xuất từ BẤT KỲ subdomain nào (admin/teacher/portal) rồi đưa về cổng login chung.
 *
 * KHÔNG dùng `signOut({ callbackUrl: "https://..." })`: Auth.js redirect callback chặn
 * cross-origin nên trả về baseUrl của host hiện tại → tái tạo đúng bug
 * `giaovien.satarobo.vn/login?callbackUrl=%2F`. Vì vậy đăng xuất KHÔNG redirect (chỉ xoá
 * session cookie của host hiện tại) rồi tự điều hướng full-page về cổng chung. `finally`
 * bảo đảm luôn điều hướng kể cả khi `signOut` lỗi mạng (đánh đổi có chủ đích: cookie
 * host-only còn sót là chấp nhận được, tránh kẹt lại màn hình đã-đăng-xuất-một-nửa).
 */
/**
 * Chờ tối đa bao lâu cho việc gỡ đăng ký push trước khi bỏ qua và đăng xuất luôn.
 *
 * Có trần vì đăng xuất KHÔNG được treo: người dùng bấm "Đăng xuất" trên máy dùng chung là
 * họ đang muốn ĐỨNG LÊN ĐI. Mạng chậm mà ta chờ vô hạn thì họ bỏ đi với phiên còn mở — tệ
 * hơn hẳn cái ta đang cố vá.
 */
const CHO_GO_PUSH_MS = 1500;

/**
 * Gỡ đăng ký push CỦA ĐÚNG MÁY NÀY trước khi đăng xuất (US-14b Đợt 5).
 *
 * Service worker khoá theo ORIGIN, không theo phiên. Không gỡ thì trên máy lễ tân dùng chung,
 * mọi lead chia cho người vừa đăng xuất sẽ nổ trên màn hình khoá của người đăng nhập sau —
 * kèm tên phụ huynh.
 *
 * ── THỨ TỰ: MÁY CHỦ TRƯỚC, TRÌNH DUYỆT SAU ──────────────────────────────────────────────
 * Đúng bài học của `tatMayNay` ở Đợt 3: `unsubscribe()` KHÔNG hoàn tác được, nên gọi nó trước
 * là tự phá mất thứ duy nhất định danh được dòng cần thu hồi.
 *
 * ── NHƯNG `unsubscribe()` VẪN CHẠY DÙ MÁY CHỦ HỎNG — và đây là chỗ KHÁC `tatMayNay` ──────
 * `tatMayNay` là thao tác SỔ SÁCH (người dùng muốn thấy dòng biến khỏi danh sách), nên ở đó
 * huỷ trước rồi bỏ qua kết quả máy chủ là nói sai về kết quả. Ở đây mục đích là BẢO VỆ người
 * ngồi máy tiếp theo: một endpoint đã huỷ là endpoint KHÔNG GIAO ĐƯỢC CHO AI, nên cứ huỷ vẫn
 * an toàn hơn để nguyên. Dòng DB còn `ACTIVE` sẽ tự chết ở lượt gửi kế (push service trả 410
 * ⇒ engine đánh `EXPIRED`), và nếu cả hai vế đều hỏng thì lưới thứ hai là chuyển chủ lúc người
 * mới bấm "Bật thông báo" trên đúng máy đó.
 *
 * ⚠️ KHÔNG kín, và đừng viết tài liệu như thể đã kín: đóng thẳng tab · mất mạng · JWT hết hạn
 * tự nhiên · xoá cookie tay đều không chạy hàm này. Ba ca "tài khoản chết" thì đã có nửa server
 * ở `app/(auth)/dang-xuat/route.ts` lo. Phần còn lại nằm trong sổ nợ `docs/web-push §14.4`.
 */
async function goDangKyPushCuaMayNay(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  // Portal (phụ huynh) và site sale KHÔNG mount service worker ⇒ `getRegistration()` trả
  // `undefined` và hàm thoát ở đây, không tốn một lượt gọi máy chủ nào. Đó là lý do đặt cổng
  // này ở `logoutToGate` dùng chung được mà không phiền bốn nơi gọi.
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;

  try {
    await huyThietBiTheoEndpointAction({ endpoint: sub.endpoint });
  } catch {
    // Máy chủ hỏng/phiên vừa hết — vẫn phải huỷ ở trình duyệt (xem khối chú thích trên).
  }
  await sub.unsubscribe();
}

export async function logoutToGate(): Promise<void> {
  // Gỡ push TRƯỚC `signOut`: action thu hồi cần phiên còn sống để biết `userId` (nó lấy từ
  // phiên server, không bao giờ từ input). Sau `signOut` thì nó chỉ trả "Chưa đăng nhập".
  try {
    await Promise.race([
      goDangKyPushCuaMayNay(),
      new Promise<void>((r) => setTimeout(r, CHO_GO_PUSH_MS)),
    ]);
  } catch {
    // Đăng xuất không bao giờ được chặn bởi việc dọn push.
  }

  try {
    await signOut({ redirect: false });
  } finally {
    window.location.href = resolveLoginGateUrl();
  }
}
