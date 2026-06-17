// lib/crm/_handlers/lead-converted.ts — R2 C2.5: side-effect SAU convert (không trong transaction).
// Handler cho DomainEvent `lead.converted`: gửi email xác nhận đăng ký + mời kích hoạt
// tài khoản phụ huynh (hàng đợi email — fallback an toàn nếu chưa cấu hình Resend).
import { db } from "@/lib/db";
import { on, type DomainEventLite } from "@/lib/events/registry";
import { enqueueEnrollmentConfirmation } from "@/lib/email/triggers";

export async function onLeadConverted(event: DomainEventLite): Promise<void> {
  const parentUserId = String(event.payload.parentUserId ?? "");
  const studentId = String(event.payload.studentId ?? "");
  if (!parentUserId || !studentId) return;

  const [parent, student, enrollment] = await Promise.all([
    db.user.findUnique({ where: { id: parentUserId }, select: { email: true, name: true } }),
    db.student.findUnique({ where: { id: studentId }, select: { name: true, studentCode: true } }),
    db.enrollment.findFirst({
      where: { studentId, deletedAt: null }, // FIX-C3
      orderBy: { createdAt: "desc" },
      select: { class: { select: { name: true } }, course: { select: { name: true } } },
    }),
  ]);

  if (!parent?.email || !student) return; // không có email → bỏ qua (PH tự kích hoạt ở /kich-hoat)

  await enqueueEnrollmentConfirmation({
    to: parent.email,
    parentName: parent.name,
    studentName: student.name,
    studentCode: student.studentCode,
    className: enrollment?.class?.name ?? "—",
    courseName: enrollment?.course?.name ?? "—",
  });
}

export function registerLeadConvertedHandlers(): void {
  on("lead.converted", onLeadConverted);
}
