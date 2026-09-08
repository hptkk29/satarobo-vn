import "server-only";

// Đọc danh sách thiết bị nhận thông báo CỦA CHÍNH MỘT NGƯỜI — Web Push Đợt 3.
//
// Đặt ở `lib/` để hai màn (`/settings` của admin và `/teacher/ho-so`) dùng chung mà không màn nào
// phải import `@/lib/db` trần — đường đó là ESLint error trong `app/(admin|teacher)/**`.
//
// KHÔNG cần `scopedDb`: bảng này không có cột đơn vị, và `userId` CHÍNH LÀ ranh giới quyền —
// đúng mô hình `StaffNotification` (`lib/notifications/service.ts`: "thông báo của tôi là của
// tôi, kể cả khi tôi vừa chuyển cơ sở"). Ranh giới được ép bằng `where: { userId }` ngay dưới,
// nơi gọi truyền `session.user.id` chứ không bao giờ là một id đến từ client.

import { db } from "@/lib/db";

export interface ThietBiCuaToi {
  id: string;
  endpoint: string;
  deviceLabel: string | null;
  userAgent: string | null;
  origin: string;
  displayMode: string | null;
  lastSuccessAt: string | null;
  createdAt: string;
}

/**
 * Thiết bị đang SỐNG của một người, mới đăng ký trước.
 *
 * Chỉ `ACTIVE`: `REVOKED` (tự gỡ) và `EXPIRED` (push service trả 410) không còn là thiết bị của
 * ai cả — để chúng trong danh sách là mời người dùng bấm "Gỡ" một thứ đã gỡ rồi.
 *
 * Mốc thời gian trả về dạng chuỗi ISO: dữ liệu này đi từ Server Component sang Client Component,
 * mà `Date` không tuần tự hoá qua ranh giới đó.
 */
export async function layThietBiCuaToi(userId: string): Promise<ThietBiCuaToi[]> {
  if (!userId) return [];
  const rows = await db.webPushSubscription.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      endpoint: true,
      deviceLabel: true,
      userAgent: true,
      origin: true,
      displayMode: true,
      lastSuccessAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
