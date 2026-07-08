// lib/portal/parent-request-notify.ts — #08 (Nhóm 05 L8.2): thông báo yêu cầu phụ huynh.
// Người nhận (câu 40 phiếu Sale): MỌI tư vấn (SALES_CSM) + Quản lý cơ sở (CENTER_MANAGER)
// active TẠI cơ sở của học viên. Notify per-user qua StaffNotification (inbox nhân sự),
// idempotent theo (userId, dedupeKey) — cùng mẫu lib/crm/sla.ts + conversation-notif.ts.
import type { ParentRequestType, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { REQUEST_TYPE_LABEL } from "@/lib/portal/request-labels";

/** Ngưỡng nhắc lại yêu cầu chưa xử lý (câu 40: quá 12h → hệ thống nhắc). */
export const PARENT_REQUEST_REMINDER_MS = 12 * 3_600_000;

/** Vai trò nhận thông báo yêu cầu PH (câu 40): tư vấn + quản lý cơ sở. */
const NOTIFY_ROLES: Role[] = ["SALES_CSM", "CENTER_MANAGER"];

/** Link admin (host admin phục vụ từ gốc → KHÔNG prefix /admin, theo pending-tasks.ts). */
export function parentRequestHref(type: string): string {
  return type === "ABSENCE" ? "/parent-requests/bao-vang" : "/parent-requests";
}

/**
 * Nhân sự nhận thông báo yêu cầu PH tại 1 cơ sở: SALES_CSM + CENTER_MANAGER đang hoạt động.
 * centerId null (HV chưa gắn cơ sở) → không lọc cơ sở (báo mọi Sale/QL — an toàn hơn bỏ sót).
 */
export async function getParentRequestRecipients(
  centerId: string | null,
): Promise<{ id: string }[]> {
  return db.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      roles: { hasSome: NOTIFY_ROLES },
      ...(centerId ? { centerId } : {}),
    },
    select: { id: true },
  });
}

/** Ghi StaffNotification cho từng người nhận, idempotent theo dedupeKey (không nhân đôi). */
async function notifyRecipients(params: {
  recipients: { id: string }[];
  dedupeKey: string;
  category: string;
  title: string;
  body: string;
  href: string;
}): Promise<number> {
  let count = 0;
  for (const u of params.recipients) {
    await db.staffNotification.upsert({
      where: { userId_dedupeKey: { userId: u.id, dedupeKey: params.dedupeKey } },
      create: {
        userId: u.id,
        category: params.category,
        title: params.title,
        body: params.body,
        href: params.href,
        dedupeKey: params.dedupeKey,
      },
      update: {}, // đã có → giữ nguyên (chỉ 1 lần)
    });
    count++;
  }
  return count;
}

const typeLabel = (type: string): string =>
  REQUEST_TYPE_LABEL[type as ParentRequestType] ?? "yêu cầu";

/**
 * Handler-side: PH vừa tạo yêu cầu → báo Sale/QL cơ sở (dedupe theo requestId).
 * Trả số notification đã ghi (0 nếu không có người nhận).
 */
export async function notifyParentRequestCreated(input: {
  requestId: string;
  centerId: string | null;
  type: string;
  studentName: string | null;
}): Promise<number> {
  const recipients = await getParentRequestRecipients(input.centerId);
  if (recipients.length === 0) return 0;
  return notifyRecipients({
    recipients,
    dedupeKey: `parent_request.created:${input.requestId}`,
    category: "PARENT_REQUEST",
    title: "Yêu cầu mới từ phụ huynh",
    body: `Phụ huynh ${input.studentName ?? "học viên"} vừa gửi yêu cầu "${typeLabel(
      input.type,
    )}". Vui lòng xử lý.`,
    href: parentRequestHref(input.type),
  });
}

/**
 * Cron-side: quét ParentRequest PENDING quá 12h → nhắc Sale/QL cơ sở 1 LẦN.
 * dedupeKey `parent_request.reminder:<id>` bảo đảm mỗi yêu cầu chỉ nhắc đúng một lần
 * cho mỗi người (chạy cron lặp lại không nhân đôi).
 */
export async function runParentRequestReminder(
  now = new Date(),
): Promise<{ scanned: number; notified: number }> {
  const cutoff = new Date(now.getTime() - PARENT_REQUEST_REMINDER_MS);
  const pending = await db.parentRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: {
      id: true,
      type: true,
      student: { select: { name: true, centerId: true } },
    },
  });

  let notified = 0;
  for (const req of pending) {
    const recipients = await getParentRequestRecipients(req.student?.centerId ?? null);
    if (recipients.length === 0) continue;
    notified += await notifyRecipients({
      recipients,
      dedupeKey: `parent_request.reminder:${req.id}`,
      category: "PARENT_REQUEST",
      title: "Nhắc: yêu cầu phụ huynh quá hạn",
      body: `Yêu cầu "${typeLabel(req.type)}" của phụ huynh ${
        req.student?.name ?? "học viên"
      } đã chờ hơn 12 giờ chưa được xử lý.`,
      href: parentRequestHref(req.type),
    });
  }
  return { scanned: pending.length, notified };
}
