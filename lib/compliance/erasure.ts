import "server-only";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";

// =============================================================================
// C6 / NĐ13 — Quyền XÓA (ẩn danh) dữ liệu cá nhân học viên.
// Ẩn danh PII (tên/SĐT/email/ngày sinh/địa chỉ/ghi chú) NHƯNG GIỮ bản ghi nghiệp
// vụ/tài chính (enrollment/payment) theo nghĩa vụ lưu trữ — chỉ cắt liên kết PII.
// Không hard-delete (tránh mất toàn vẹn sổ sách). Audit bắt buộc.
// =============================================================================

export type StudentPiiErasure = {
  name: string;
  dateOfBirth: null;
  gender: null;
  phone: null;
  email: null;
  avatarUrl: null;
  parentName: null;
  parentPhone: null;
  parentEmail: null;
  address: null;
  notes: null;
};

/** PURE — giá trị ẩn danh cho 1 student (tên thay bằng mã ngắn để truy vết nội bộ). */
export function buildErasureData(studentId: string): StudentPiiErasure {
  return {
    name: `[Đã xoá ${studentId.slice(0, 6)}]`,
    dateOfBirth: null,
    gender: null,
    phone: null,
    email: null,
    avatarUrl: null,
    parentName: null,
    parentPhone: null,
    parentEmail: null,
    address: null,
    notes: null,
  };
}

/**
 * Áp dụng ẩn danh: cập nhật Student + ẩn nội dung tự do liên quan (tin nhắn, nhận
 * xét buổi, ghi chú đánh giá kỹ năng). Ghi AuditLog. SUPER_ADMIN gọi (gate ở action).
 */
export async function applyStudentErasure(
  studentId: string,
  actor: AuditActor,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, centerId: true },
  });
  if (!student) return { ok: false, error: "Không tìm thấy học viên" };

  const data = buildErasureData(studentId);
  await db.$transaction(async (tx) => {
    await tx.student.update({ where: { id: studentId }, data });

    // Ẩn nội dung tự do gắn HV (best-effort trong tx).
    await tx.studentSkillAssessment.updateMany({ where: { studentId }, data: { note: null } });
    // D6 (reconcile) — nhắn tin dùng ConversationMessage per-enrollment (main).
    const enrolls = await tx.enrollment.findMany({
      where: { studentId },
      select: { id: true },
    });
    if (enrolls.length) {
      await tx.conversationMessage.updateMany({
        where: { enrollmentId: { in: enrolls.map((e) => e.id) } },
        data: { body: "[Đã xoá theo yêu cầu]" },
      });
    }

    await writeAudit({
      actor,
      module: "compliance",
      entityType: "Student",
      entityId: studentId,
      action: "ERASE_PII",
      oldValues: { name: student.name },
      newValues: { erased: true },
      reason,
      orgUnitId: student.centerId,
      tx,
    });
  });

  return { ok: true };
}
