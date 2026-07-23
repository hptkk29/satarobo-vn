"use client";

import { signOut } from "next-auth/react";

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
export async function logoutToGate(): Promise<void> {
  try {
    await signOut({ redirect: false });
  } finally {
    window.location.href = resolveLoginGateUrl();
  }
}
