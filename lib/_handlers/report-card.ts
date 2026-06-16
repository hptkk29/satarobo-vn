// lib/_handlers/report-card.ts — R7-15: consumer cho DomainEvent `reportcard.published`.
// Khi học bạ được PHÁT HÀNH → tạo thông báo (Notification audience=STUDENT) cho PH
// của học viên. Idempotent theo event.id (republish = event mới → PH được báo lại).
import { db } from "@/lib/db";
import { on, type DomainEventLite } from "@/lib/events/registry";

const str = (v: unknown): string => (v == null ? "" : String(v));

export async function onReportCardPublished(event: DomainEventLite): Promise<void> {
  const reportCardId = str(event.payload.reportCardId);
  const enrollmentId = str(event.payload.enrollmentId);
  if (!reportCardId || !enrollmentId) return;

  const enr = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      studentId: true,
      student: { select: { name: true, centerId: true } },
      class: { select: { name: true } },
      course: { select: { name: true } },
    },
  });
  if (!enr?.studentId) return;

  const courseName = enr.course?.name ?? "";
  const body =
    `Học bạ ${courseName ? `khoá ${courseName} ` : ""}của ${enr.student?.name ?? "học viên"} ` +
    `đã được phát hành. Phụ huynh xem trong mục Học bạ ở cổng phụ huynh.`;

  const dedupeKey = `reportcard.published:${event.id}`;
  await db.notification.upsert({
    where: { dedupeKey },
    create: {
      title: "Học bạ đã phát hành",
      body,
      audience: "STUDENT",
      studentId: enr.studentId,
      centerId: enr.student?.centerId ?? null,
      createdByName: "Hệ thống",
      dedupeKey,
    },
    update: { body },
  });
}

export function registerReportCardHandlers(): void {
  on("reportcard.published", onReportCardPublished);
}
