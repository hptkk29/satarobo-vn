import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { getPendingTasks, type TaskUser } from "@/lib/pending-tasks";

// =============================================================================
// MODULE NHẮC VIỆC PHẦN 3 — thông báo CHUÔNG (in-app) cho nhân viên.
// Đồng bộ LƯỜI theo user: mỗi lần user mở chuông → reconcile từ getPendingTasks.
//   - Việc cần xử lý  → 1 notif/loại (dedupeKey "<type>:pending").
//   - Việc quá hạn    → 1 notif/loại (dedupeKey "<type>:overdue") — nhắc lại.
//   - Việc đã xong (loại không còn) → tự đánh dấu ĐÃ ĐỌC.
// dedupeKey + @@unique([userId, dedupeKey]) → KHÔNG tạo trùng cùng 1 việc.
// =============================================================================

export interface StaffNotificationView {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

type Desired = { dedupeKey: string; category: string; title: string; body: string; href: string | null };

/** Đồng bộ thông báo cho user từ việc cần xử lý hiện tại. Trả về số chưa đọc. */
export async function syncStaffNotifications(user: TaskUser): Promise<number> {
  // Chuông gọi từ route handler (có request context) → resolveActor cache theo request.
  const groups = await getPendingTasks(user, await resolveActor(user.id));

  const desired: Desired[] = [];
  for (const g of groups) {
    if (g.count > 0) {
      desired.push({
        dedupeKey: `${g.type}:pending`,
        category: g.type,
        title: g.label,
        body: `${g.count} việc cần xử lý.`,
        href: g.href,
      });
    }
    if (g.overdueCount > 0) {
      desired.push({
        dedupeKey: `${g.type}:overdue`,
        category: g.type,
        title: `⚠ ${g.label} — quá hạn`,
        body: `${g.overdueCount} việc đã quá hạn, xử lý gấp.`,
        href: g.href,
      });
    }
  }
  const desiredKeys = new Set(desired.map((d) => d.dedupeKey));

  // Tạo notif còn thiếu (bỏ qua nếu đã tồn tại — dedupe).
  for (const d of desired) {
    await db.staffNotification.upsert({
      where: { userId_dedupeKey: { userId: user.id, dedupeKey: d.dedupeKey } },
      create: {
        userId: user.id,
        dedupeKey: d.dedupeKey,
        category: d.category,
        title: d.title,
        body: d.body,
        href: d.href,
      },
      // Cập nhật nội dung (số đếm) nhưng GIỮ trạng thái đọc để không spam.
      update: { title: d.title, body: d.body, href: d.href },
    });
  }

  // Việc đã xong → đánh dấu đã đọc các notif chưa đọc không còn trong desired.
  const stale = await db.staffNotification.findMany({
    where: { userId: user.id, readAt: null },
    select: { id: true, dedupeKey: true },
  });
  const toRead = stale.filter((s) => !desiredKeys.has(s.dedupeKey)).map((s) => s.id);
  if (toRead.length > 0) {
    await db.staffNotification.updateMany({
      where: { id: { in: toRead } },
      data: { readAt: new Date() },
    });
  }

  return db.staffNotification.count({ where: { userId: user.id, readAt: null } });
}

/** Lấy danh sách thông báo gần đây + số chưa đọc (đã sync). */
export async function getStaffNotifications(
  user: TaskUser,
): Promise<{ items: StaffNotificationView[]; unread: number }> {
  const unread = await syncStaffNotifications(user);
  const rows = await db.staffNotification.findMany({
    where: { userId: user.id },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 20,
  });
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      href: r.href,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function markStaffNotificationRead(userId: string, id: string): Promise<void> {
  await db.staffNotification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllStaffNotificationsRead(userId: string): Promise<void> {
  await db.staffNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
