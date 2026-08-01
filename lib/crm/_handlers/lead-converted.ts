// lib/crm/_handlers/lead-converted.ts — R2 C2.5: side-effect SAU convert (không trong transaction).
// Handler cho DomainEvent `lead.converted`: gửi email xác nhận đăng ký + mời kích hoạt
// tài khoản phụ huynh (hàng đợi email — fallback an toàn nếu chưa cấu hình Resend).
import { db } from "@/lib/db";
import { on, type DomainEventLite } from "@/lib/events/registry";
import { enqueueEnrollmentConfirmation } from "@/lib/email/triggers";
import { sendZaloNotification } from "@/lib/zalo/service";

// AUTH-SĐT P5 — mẫu ZNS xác nhận ghi danh. Dùng chung mẫu "Học phí + tài khoản"
// (616258) với thông báo đơn hàng; chưa đặt env → SKIPPED an toàn.
// ⚠️ Tên tham số phải khớp mẫu đã duyệt (bài học PR #77).
const ZNS_TEMPLATE_PAYMENT = process.env.ZALO_ZNS_TEMPLATE_PAYMENT || null;

export async function onLeadConverted(event: DomainEventLite): Promise<void> {
  const parentUserId = String(event.payload.parentUserId ?? "");
  const studentId = String(event.payload.studentId ?? "");
  if (!parentUserId || !studentId) return;

  const [parent, student, enrollment] = await Promise.all([
    db.user.findUnique({
      where: { id: parentUserId },
      select: { email: true, phone: true, name: true },
    }),
    db.student.findUnique({ where: { id: studentId }, select: { name: true, studentCode: true } }),
    db.enrollment.findFirst({
      where: { studentId, deletedAt: null }, // FIX-C3
      orderBy: { createdAt: "desc" },
      select: { class: { select: { name: true } }, course: { select: { name: true } } },
    }),
  ]);

  if (!parent || !student) return;

  const className = enrollment?.class?.name ?? "—";
  const courseName = enrollment?.course?.name ?? "—";

  if (parent.email) {
    await enqueueEnrollmentConfirmation({
      to: parent.email,
      parentName: parent.name,
      studentName: student.name,
      studentCode: student.studentCode,
      className,
      courseName,
    });
    return;
  }

  // AUTH-SĐT P5 — trước đây nhánh này `return` trống: phụ huynh không có email
  // thì **im lặng mất** email xác nhận ghi danh. Hôm qua đó là ngoại lệ hiếm;
  // sau P5 (email không bắt buộc) nó thành trường hợp PHỔ BIẾN, nên phải có
  // đường thay thế chứ không được bỏ qua.
  if (!parent.phone) {
    console.warn(
      `[lead.converted] phụ huynh ${parentUserId} không có cả email lẫn SĐT — không gửi được xác nhận ghi danh.`,
    );
    return;
  }
  await sendZaloNotification({
    toPhone: parent.phone,
    templateKey: ZNS_TEMPLATE_PAYMENT,
    params: {
      name: parent.name ?? "Quý phụ huynh",
      student: student.name,
      course: courseName,
      class: className,
    },
    fallbackEmail: null,
  }).catch(() => {});
}

export function registerLeadConvertedHandlers(): void {
  on("lead.converted", onLeadConverted);
}
