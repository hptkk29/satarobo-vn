// lib/finance/refund.ts — W3-1 / LMS-9: hoàn tiền theo lifecycle (Doc 15 §4.9).
//
// computeRefund THUẦN (test được không cần DB). createRefundRequest snapshot số liệu
// tại thời điểm tạo (paidConfirmed/sessionsTotal/sessionsLearned/unitPrice) để minh bạch,
// không phụ thuộc thay đổi sau. approve/reject ghi AuditLog hợp nhất.
import type {
  Prisma,
  PrismaClient,
  RefundRequest,
  RefundTrigger,
} from "@prisma/client";
import { db } from "@/lib/db";
import { KHOAN_DA_DONG } from "@/lib/finance/debt";
import { writeAudit } from "@/lib/audit/audit-log";
import { canhBaoSoBuoi, soBuoiChuaChot } from "@/lib/finance/lop-chua-chot-buoi";
import type { ScopedDb } from "@/lib/actions/factory";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * THUẦN — đề xuất hoàn tiền theo lifecycle.
 *   unitPrice  = sessionsTotal>0 ? round(finalPrice / sessionsTotal) : 0  (đơn giá / buổi)
 *   proposed   = max(0, Σ đã đóng (confirmed) − số buổi ĐÃ HỌC × đơn giá)
 * (Công thức plan: Σ confirmed − buổi đã học × đơn giá; clamp ≥ 0.)
 */
export function computeRefund(input: {
  paidConfirmed: number;
  finalPrice: number;
  sessionsTotal: number;
  sessionsLearned: number;
}): { unitPrice: number; proposedAmount: number } {
  const { paidConfirmed, finalPrice, sessionsTotal, sessionsLearned } = input;
  const unitPrice =
    sessionsTotal > 0 ? Math.round(finalPrice / sessionsTotal) : 0;
  const proposedAmount = Math.max(
    0,
    paidConfirmed - sessionsLearned * unitPrice,
  );
  return { unitPrice, proposedAmount };
}

export class RefundError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RefundError";
    this.code = code;
  }
}

/**
 * Tạo yêu cầu hoàn tiền (PENDING) cho 1 ghi danh. Snapshot:
 *   - paidConfirmed = Σ amount(Payment accountantStatus=CONFIRMED, chưa xóa) của ghi danh.
 *   - sessionsTotal  = số ClassSession của lớp (loại CANCELLED).
 *   - sessionsLearned = số ClassSession COMPLETED.
 *   - finalPrice = Enrollment.finalPrice (fallback tuition khi chưa chốt giá).
 * IDEMPOTENT: đã có RefundRequest PENDING cùng (enrollment, trigger) → trả cái cũ.
 * Không có khoản đã thu (paidConfirmed ≤ 0) → KHÔNG tạo (trả null) — tránh yêu cầu rỗng.
 * Truyền `tx` để chạy trong transaction của caller (tiền đi qua tx).
 */
export async function createRefundRequest(input: {
  enrollmentId: string;
  trigger: RefundTrigger;
  reason: string;
  requestedById?: string | null;
  actorName?: string;
  tx?: DbClient;
  /**
   * Mốc "hôm nay" để đếm buổi đã qua ngày. Bỏ trống ⇒ đồng hồ thật.
   *
   * Có mặt để test TRUYỀN VÀO được: luật 19 (docs/luat-doc-so-va-ket-luan.md) — ca dựa
   * vào `new Date()` là ca hẹn giờ nổ, và ở đây nó quyết định có chi tiền hoàn hay không.
   */
  now?: Date;
}): Promise<RefundRequest | null> {
  const {
    enrollmentId,
    trigger,
    reason,
    requestedById = null,
    actorName = "Hệ thống",
    tx,
    now,
  } = input;

  // ── CẦU DAO TÍNH NĂNG ĐÃ GỠ (14/09/2026) ───────────────────────────────────
  //
  // Cầu dao `REFUND_REQUEST_DISABLED` tắt HẲN tính năng từ 08/09 vì MỘT ca cụ thể:
  // `sessionsLearned` đếm `ClassSession.status = COMPLETED`, mà `status` không phản ánh
  // thực tế đã dạy (đo prod 07/09: 2 COMPLETED / 287 SCHEDULED, 209 buổi đã qua ngày chưa
  // ai chốt) ⇒ lớp đã dạy gần hết vẫn đọc ra 0 buổi học ⇒ đề xuất hoàn 100% học phí.
  //
  // Nay ca đó bị chặn TẠI GỐC bởi lưới `canhBaoSoBuoi` bên dưới — đúng "điều kiện gỡ số
  // 2" mà chính file cầu dao đã viết ra. Và đề xuất sinh ra vẫn ở `PENDING`: phải qua
  // `approveRefund` mới thành tiền, nên còn một lớp người nữa.
  //
  // ⚠️ Điều kiện 1 và 4 của cầu dao (backlog buổi chưa chốt trên prod về ~0) KHÔNG còn là
  // điều kiện chặn — chốt lại có chủ đích 14/09/2026: backlog nay chỉ làm hệ thống TỪ
  // CHỐI đề xuất (hướng AN TOÀN), không còn đề xuất sai. Cái giá phải nói rõ với người
  // vận hành: lớp còn buổi chưa chốt mà sổ đọc ra 0 buổi học thì KHÔNG hoàn được — phải
  // đi chốt sổ buổi trước.

  const client: DbClient = tx ?? db;

  const enrollment = await client.enrollment.findFirst({
    where: { id: enrollmentId, deletedAt: null },
    select: {
      id: true,
      finalPrice: true,
      tuition: true,
      classId: true,
      class: { select: { centerId: true } },
    },
  });
  if (!enrollment) return null;

  // Idempotent: 1 PENDING / (enrollment, trigger).
  const existing = await client.refundRequest.findFirst({
    where: { enrollmentId, trigger, status: "PENDING" },
  });
  if (existing) return existing;

  // Σ Payment đã xác nhận (CONFIRMED) — loại soft-deleted.
  const agg = await client.payment.aggregate({
    // Câu A: hoàn được bao nhiêu thì đo bằng tiền PH ĐANG ĐỂ LẠI, tức đã trừ những
    // lần hoàn trước. Dùng bộ lọc gross ở đây là đề xuất hoàn lần hai trên số gộp.
    where: { enrollmentId, ...KHOAN_DA_DONG },
    _sum: { amount: true },
  });
  const paidConfirmed = agg._sum.amount ?? 0;
  // Chưa thu đồng nào → không cần hoàn (tránh tạo yêu cầu 0đ rác).
  if (paidConfirmed <= 0) return null;

  // Số buổi: tổng (loại huỷ) + đã học (COMPLETED). Tuần tự (an toàn trong tx).
  const sessionsTotal = await client.classSession.count({
    where: { classId: enrollment.classId, status: { not: "CANCELLED" } },
  });
  const sessionsLearned = await client.classSession.count({
    where: { classId: enrollment.classId, status: "COMPLETED" },
  });

  // ── LƯỚI CHẶN ĐỀ XUẤT HOÀN 100% DO SỔ BUỔI CHƯA CHỐT ───────────────────────
  //
  // Đây là ĐIỀU KIỆN GỠ SỐ 2 mà file cầu dao (nay đã xoá) viết nguyên văn:
  // "`createRefundRequest` TỪ CHỐI đề xuất khi lớp có buổi đã qua ngày mà
  //  `sessionsLearned = 0` — ném lỗi rõ ràng, KHÔNG lặng lẽ đề xuất 100%."
  //
  // `sessionsLearned` đếm `status = COMPLETED`, mà `status` không phản ánh thực tế đã dạy
  // (đo prod 07/09: 2 COMPLETED / 287 SCHEDULED, 209 buổi đã qua ngày chưa ai chốt). Với
  // một lớp đã dạy gần hết khoá, con số đó vẫn là 0 ⇒ đề xuất hoàn TOÀN BỘ học phí.
  //
  // ⚠️ TỪ CHỐI, KHÔNG TỰ ĐOÁN: đếm buổi "đã qua ngày" thay cho COMPLETED là chi tiền theo
  // một con số không ai xác nhận — buổi qua ngày chưa chắc đã dạy. Việc đúng là dừng và
  // bắt người chốt sổ buổi. Chi tiết + lý do chỉ chặn ĐÚNG ca này: `lop-chua-chot-buoi.ts`.
  //
  // Trả `null` chứ không ném, cùng lý do với cầu dao ở trên: hàm chạy TRONG transaction gỡ
  // học viên / huỷ lớp, ném là cuộn ngược cả việc gỡ.
  const buoiCuaLop = await client.classSession.findMany({
    where: { classId: enrollment.classId },
    select: { date: true, status: true },
  });
  const canhBao = canhBaoSoBuoi({
    soBuoiChuaChot: soBuoiChuaChot(buoiCuaLop, now ?? new Date()),
    sessionsLearned,
    sessionsTotal,
  });
  if (!canhBao.choDeXuat) {
    await writeAudit({
      actor: { id: requestedById, name: actorName },
      module: "finance",
      entityType: "Enrollment",
      entityId: enrollmentId,
      // Tên hành động RIÊNG, không phải "UPDATE": lượt gỡ học viên cũng ghi UPDATE lên
      // chính `Enrollment` này, nên lọc theo "UPDATE" là trộn hai việc khác hẳn nhau.
      // Giữ đúng tên cầu dao cũ dùng — dòng cũ và dòng mới nói cùng một câu ("một đề
      // xuất hoàn tiền đã bị từ chối"), và chính chúng là câu trả lời cho "có ai thực sự
      // cần hoàn tiền không" khi `RefundRequest` còn 0 dòng.
      action: "REFUND_REQUEST_BLOCKED",
      newValues: {
        tuChoiDeXuatHoanTien: true,
        lyDo: canhBao.lyDo,
        muc: canhBao.muc,
        sessionsLearned,
        sessionsTotal,
        trigger: String(trigger),
      },
      reason: "Từ chối sinh đề xuất hoàn tiền: sổ buổi của lớp chưa chốt",
      orgUnitId: enrollment.class?.centerId ?? null,
      ...(tx ? { tx } : {}),
    });
    return null;
  }

  const finalPrice = enrollment.finalPrice ?? enrollment.tuition ?? 0;
  const { unitPrice, proposedAmount } = computeRefund({
    paidConfirmed,
    finalPrice,
    sessionsTotal,
    sessionsLearned,
  });

  const centerId = enrollment.class?.centerId ?? null;
  const created = await client.refundRequest.create({
    data: {
      enrollmentId,
      centerId,
      trigger,
      reason,
      paidConfirmed,
      sessionsTotal,
      sessionsLearned,
      unitPrice,
      proposedAmount,
      status: "PENDING",
      requestedById,
    },
  });

  await writeAudit({
    actor: { id: requestedById, name: actorName },
    module: "finance",
    entityType: "RefundRequest",
    entityId: created.id,
    action: "CREATE",
    newValues: {
      enrollmentId,
      trigger,
      paidConfirmed,
      sessionsTotal,
      sessionsLearned,
      unitPrice,
      proposedAmount,
      status: "PENDING",
    },
    reason,
    orgUnitId: centerId,
    tx,
  });

  return created;
}

/** Duyệt yêu cầu hoàn tiền → APPROVED. approvedAmount mặc định = proposedAmount. */
export async function approveRefund(
  id: string,
  approvedById: string,
  approvedAmount?: number | null,
  actorName = "Quản lý",
): Promise<RefundRequest> {
  const rr = await db.refundRequest.findUnique({ where: { id } });
  if (!rr)
    throw new RefundError("NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền");
  if (rr.status !== "PENDING") {
    throw new RefundError(
      "INVALID_STATE",
      `Yêu cầu đang ${rr.status} — không thể duyệt`,
    );
  }
  const finalAmount =
    approvedAmount != null && approvedAmount >= 0
      ? Math.round(approvedAmount)
      : rr.proposedAmount;

  const updated = await db.refundRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAmount: finalAmount,
      approvedById,
      approvedAt: new Date(),
    },
  });

  await writeAudit({
    actor: { id: approvedById, name: actorName },
    module: "finance",
    entityType: "RefundRequest",
    entityId: id,
    action: "STATUS_CHANGE",
    oldValues: { status: rr.status, approvedAmount: rr.approvedAmount },
    newValues: { status: "APPROVED", approvedAmount: finalAmount },
    changedFields: ["status", "approvedAmount"],
    reason: rr.reason,
    orgUnitId: rr.centerId,
  });

  return updated;
}

/** Từ chối yêu cầu hoàn tiền → REJECTED (note bắt buộc). */
export async function rejectRefund(
  id: string,
  approvedById: string,
  note: string,
  actorName = "Quản lý",
): Promise<RefundRequest> {
  const trimmed = note.trim();
  if (trimmed.length < 5) {
    throw new RefundError("VALIDATION", "Nhập lý do từ chối (≥5 ký tự)");
  }
  const rr = await db.refundRequest.findUnique({ where: { id } });
  if (!rr)
    throw new RefundError("NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền");
  if (rr.status !== "PENDING") {
    throw new RefundError(
      "INVALID_STATE",
      `Yêu cầu đang ${rr.status} — không thể từ chối`,
    );
  }

  const updated = await db.refundRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      approvedById,
      approvedAt: new Date(),
      note: trimmed,
    },
  });

  await writeAudit({
    actor: { id: approvedById, name: actorName },
    module: "finance",
    entityType: "RefundRequest",
    entityId: id,
    action: "STATUS_CHANGE",
    oldValues: { status: rr.status },
    newValues: { status: "REJECTED", note: trimmed },
    changedFields: ["status", "note"],
    reason: trimmed,
    orgUnitId: rr.centerId,
  });

  return updated;
}

export type RefundRow = {
  id: string;
  enrollmentId: string;
  studentName: string | null;
  className: string | null;
  centerId: string | null;
  trigger: RefundTrigger;
  reason: string;
  paidConfirmed: number;
  sessionsTotal: number;
  sessionsLearned: number;
  unitPrice: number;
  proposedAmount: number;
  approvedAmount: number | null;
  status: RefundRequest["status"];
  note: string | null;
  createdAt: Date;
};

/**
 * Liệt kê yêu cầu hoàn tiền cho admin — cách ly cơ sở qua scopedDb (lọc theo lớp
 * NẰM TRONG scope của actor; RefundRequest không tự-scope nên lái theo Class scoped).
 */
export async function listRefundRequests(
  scopedDbClient: ScopedDb,
  filter?: { status?: RefundRequest["status"] },
): Promise<RefundRow[]> {
  // Class là SCOPED_MODEL → findMany tự inject centerId của actor.
  const scopedClasses = await scopedDbClient.class.findMany({
    select: { id: true },
  });
  const classIds = scopedClasses.map((c) => c.id);
  if (classIds.length === 0) return [];

  const rows = await db.refundRequest.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      enrollment: { classId: { in: classIds } },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      enrollmentId: true,
      centerId: true,
      trigger: true,
      reason: true,
      paidConfirmed: true,
      sessionsTotal: true,
      sessionsLearned: true,
      unitPrice: true,
      proposedAmount: true,
      approvedAmount: true,
      status: true,
      note: true,
      createdAt: true,
      enrollment: {
        select: {
          student: { select: { name: true } },
          class: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    enrollmentId: r.enrollmentId,
    studentName: r.enrollment?.student?.name ?? null,
    className: r.enrollment?.class?.name ?? null,
    centerId: r.centerId,
    trigger: r.trigger,
    reason: r.reason,
    paidConfirmed: r.paidConfirmed,
    sessionsTotal: r.sessionsTotal,
    sessionsLearned: r.sessionsLearned,
    unitPrice: r.unitPrice,
    proposedAmount: r.proposedAmount,
    approvedAmount: r.approvedAmount,
    status: r.status,
    note: r.note,
    createdAt: r.createdAt,
  }));
}
