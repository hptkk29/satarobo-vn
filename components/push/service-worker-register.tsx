"use client";

import { useEffect } from "react";

/**
 * Đăng ký service worker `/sw.js` — Web Push Đợt 2.
 *
 * KHÔNG xin quyền thông báo ở đây. Xin quyền chỉ được làm trong một cú bấm của người dùng
 * (Đợt 3): gọi `Notification.requestPermission()` lúc tải trang là cách chắc chắn để nhân viên
 * bấm "Chặn" theo phản xạ, và trình duyệt KHÔNG hỏi lại — mất kênh vĩnh viễn cho máy đó, code
 * không lấy lại được. Component này chỉ cài worker để Đợt 3 có sẵn thứ mà `subscribe()` cần.
 *
 * KHÔNG chặn render: chạy trong `useEffect` sau khi trang đã vẽ, và đợi thêm sự kiện `load` để
 * việc đăng ký không tranh băng thông với chính lần tải đầu.
 *
 * ⚠️ Service worker khoá theo ORIGIN. Hệ thống chạy 4 host trên cùng một app, nên component này
 * mount ở host nào thì worker sống ở host đó — một người dùng cả `admin.satarobo.vn` lẫn
 * `giaovien.satarobo.vn` sẽ có HAI đăng ký rời. Bảng `WebPushSubscription` chịu được điều đó
 * (cột `origin`), nhưng đừng bất ngờ khi thấy một người nhiều dòng.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Không có API (trình duyệt cũ, hoặc ngữ cảnh không bảo mật) ⇒ im lặng bỏ qua. Đây là
    // tính năng cộng thêm; thiếu nó thì chuông trong ứng dụng vẫn chạy như cũ.
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let huy = false;

    const dangKy = () => {
      if (huy) return;
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err: unknown) => {
        // Nuốt lỗi có chủ đích, nhưng để lại vết: đăng ký hỏng là kênh push chết câm ở máy đó,
        // và không có triệu chứng nào khác ngoài "sao tôi không nhận được thông báo".
        console.warn("[push] không đăng ký được service worker:", err);
      });
    };

    if (document.readyState === "complete") {
      dangKy();
    } else {
      window.addEventListener("load", dangKy, { once: true });
    }

    return () => {
      huy = true;
      window.removeEventListener("load", dangKy);
    };
  }, []);

  return null;
}
