// lib/_handlers/r7-notifications.ts — R7-17 (slice): consumer cho các DomainEvent
// R7 đã được PRODUCE nhưng chưa có handler (payment.confirmed, class.session_changed,
// lead.trialAttended). Tạo thông báo idempotent (dedupeKey) cho PH (Notification —
// portal feed) và nhân viên (StaffNotification — inbox admin).
import { db } from "@/lib/db";
import { on, type DomainEventLite } from "@/lib/events/registry";

const str = (v: unknown): string => (v == null ? "" : String(v));

// ─── payment.confirmed → PH thấy khoản đã xác nhận (AC2 R7-04) ────────────────
export async function onPaymentConfirmed(event: DomainEventLite): Promise<void> {
  const paymentId = str(event.payload.paymentId);
  const enrollmentId = str(event.payload.enrollmentId);
  const amount = Number(event.payload.amount ?? 0);
  const receiptCode = str(event.payload.receiptCode);
  if (!paymentId || !enrollmentId) return;

  const enr = await db.enrollment.findFirst({
    where: { id: enrollmentId, deletedAt: null }, // FIX-C3
    select: { studentId: true, student: { select: { centerId: true } } },
  });
  if (!enr?.studentId) return;

  const body =
    `Trung tâm đã xác nhận khoản thanh toán ${amount.toLocaleString("vi-VN")}đ.` +
    (receiptCode ? ` Phiếu thu: ${receiptCode}.` : "");
  await db.notification.upsert({
    where: { dedupeKey: `payment.confirmed:${paymentId}` },
    create: {
      title: "Đã xác nhận thanh toán",
      body,
      audience: "STUDENT",
      studentId: enr.studentId,
      centerId: enr.student?.centerId ?? null,
      createdByName: "Hệ thống",
      dedupeKey: `payment.confirmed:${paymentId}`,
    },
    update: { body },
  });
}

// ─── class.session_changed → PH lớp + GV (AC5/AC6 R7-06) ──────────────────────
const CHANGE_LABEL: Record<string, string> = {
  CANCELLED: "có buổi bị huỷ (đã sắp buổi bù)",
  RESCHEDULED: "đã được dời lịch",
  ADJUSTED: "có buổi được điều chỉnh",
};

export async function onClassSessionChanged(event: DomainEventLite): Promise<void> {
  const classId = str(event.payload.classId);
  if (!classId) return;
  const change = str(event.payload.change) || "ADJUSTED";
  const what = CHANGE_LABEL[change] ?? "có thay đổi lịch";

  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { name: true, centerId: true, teacherId: true },
  });
  if (!cls) return;

  // PH của lớp (audience=CLASS) — idempotent theo event.id.
  await db.notification.upsert({
    where: { dedupeKey: `class.session_changed:${event.id}` },
    create: {
      title: "Thay đổi lịch học",
      body: `Lớp ${cls.name} ${what}. Vui lòng kiểm tra lịch mới.`,
      audience: "CLASS",
      classId,
      centerId: cls.centerId,
      createdByName: "Hệ thống",
      dedupeKey: `class.session_changed:${event.id}`,
    },
    update: {},
  });

  // GV phụ trách (StaffNotification inbox).
  if (cls.teacherId) {
    await db.staffNotification.upsert({
      where: { userId_dedupeKey: { userId: cls.teacherId, dedupeKey: `class.session_changed:${event.id}` } },
      create: {
        userId: cls.teacherId,
        category: "CLASS",
        title: "Lịch lớp thay đổi",
        body: `Lớp ${cls.name} ${what}.`,
        href: `/classes/${classId}/edit`,
        dedupeKey: `class.session_changed:${event.id}`,
      },
      update: {},
    });
  }
}

// ─── lead.trialAttended → Sale phụ trách follow-up (R7-02) ─────────────────────
export async function onLeadTrialAttended(event: DomainEventLite): Promise<void> {
  const leadId = str(event.payload.leadId);
  if (!leadId) return;
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { assignedToId: true, adminId: true, parentName: true },
  });
  const userId = lead?.assignedToId ?? lead?.adminId;
  if (!userId) return;

  await db.staffNotification.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey: `lead.trialAttended:${leadId}` } },
    create: {
      userId,
      category: "LEAD",
      title: "Lead đã học thử xong",
      body: `Phụ huynh ${lead?.parentName ?? ""} đã hoàn tất buổi học thử — liên hệ chốt.`,
      href: `/leads/${leadId}`,
      dedupeKey: `lead.trialAttended:${leadId}`,
    },
    update: {},
  });
}

export function registerR7NotificationHandlers(): void {
  on("payment.confirmed", onPaymentConfirmed);
  on("class.session_changed", onClassSessionChanged);
  on("lead.trialAttended", onLeadTrialAttended);
}
