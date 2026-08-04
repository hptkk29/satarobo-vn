// lib/teacher/notification-href.ts — map href của StaffNotification (viết theo đường
// ADMIN) sang màn tương ứng của site GV (clean-URL, host giaovien.satarobo.vn).
//
// Vì sao cần: từ khi TEACHER_SITE_ENABLED bật (10/07), GV thuần bị route-policy 307
// đá khỏi host admin. Chuông thông báo site GV dùng chung API /api/admin/notifications/bell
// nên href trả về vẫn là đường admin — điều hướng thẳng là đẩy GV sang host admin
// rồi bị đá ngược (vòng lặp khó hiểu). Đường nào GV KHÔNG có màn → trả null: hiện
// nội dung thông báo dạng text thuần, không gắn link chết.
//
// THUẦN (không import React/DB) để test được bằng Vitest.

export function teacherHref(href: string | null): string | null {
  if (!href) return null;
  const [path, query] = href.split("?");
  const q = query ? `?${query}` : "";
  if (path === "/attendance") return `/diem-danh${q}`;
  if (path === "/sessions" || path.startsWith("/sessions/")) return `/lich${q}`;
  if (path === "/classes" || path.startsWith("/classes/")) return `/lop${q}`;
  if (path === "/assignments" || path.startsWith("/assignments/")) return `/cham-bai${q}`;
  if (path === "/report-cards" || path.startsWith("/report-cards/")) return `/hoc-ba${q}`;
  if (path === "/don-tu") return `/don-tu${q}`;
  if (path === "/cham-cong" || path.startsWith("/cham-cong/")) return `/bang-cong${q}`;
  if (path === "/trials" || path === "/trial-classes" || path.startsWith("/trial-classes/")) {
    return `/trial${q}`;
  }
  return null;
}
