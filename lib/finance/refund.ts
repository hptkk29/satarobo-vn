// lib/finance/refund.ts — W3-1 / LMS-9: hoàn tiền theo lifecycle (Doc 15 §4.9).
//
// computeRefund THUẦN (test được không cần DB). createRefundRequest snapshot số liệu
// tại thời điểm tạo (paidConfirmed/sessionsTotal/sessionsLearned/unitPrice) để minh bạch,
// không phụ thuộc thay đổi sau. approve/reject ghi AuditLog hợp nhất.
import type { Prisma, PrismaClient, RefundRequest, RefundTrigger } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit/audit-log";
import type { ScopedDb } from "@/lib/actions/factory";
import { WHERE_THUC_THU, SELECT_THUC_THU, tinhThucThu } from "@/lib/finance/thuc-thu";

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
  const unitPrice = sessionsTotal > 0 ? Math.round(finalPrice / sessionsTotal) : 0;
  const proposedAmount = Math.max(0, paidConfirmed - sessionsLearned * unitPrice);
  return { unitPrice, proposedAmount };
}

/**
 * THUẦN — số tiền CÒN CÓ THỂ hoàn của một ghi danh (HT · 27/08/2026).
 *
 * ĐÂY LÀ CHỖ ĐÃ THỦNG. `createRefundRequest` trước đây lấy mẫu số bằng
 * `Σ amount(Payment CONFIRMED)`, mà `refundPayment()` ghi lần hoàn thành một bản ghi
 * MỚI mang số ÂM ở trạng thái REFUNDED chứ không sửa bản gốc ⇒ lần hoàn thứ hai đề
 * xuất trên số GỘP, y như lần một chưa từng xảy ra. Hoàn 9tr, rồi hoàn tiếp 9tr.
 *
 * Hai khoản phải trừ, và chỉ trừ MỘT lần mỗi khoản:
 *   • `daGhiSoHoan` — kế toán đã ghi bút toán âm. Khoản này `thucThu` ĐÃ tự trừ rồi,
 *     nên KHÔNG trừ thêm ở đây; nó chỉ có mặt để biết phần nào đã ghi sổ.
 *   • `daDuyetHoan − daGhiSoHoan` — đã duyệt nhưng CHƯA chi. `approveRefund()` chỉ đổi
 *     trạng thái yêu cầu, nó KHÔNG ghi Payment âm (không có FK nối hai bảng), nên có
 *     một cửa sổ mà tiền đã hứa trả nhưng sổ chưa biết. Clamp ≥ 0: kế toán hoàn thẳng
 *     không qua đề xuất thì hiệu số âm, và số âm đó không được cộng ngược lên.
 *
 * Kết quả clamp ≥ 0 — không bao giờ đề xuất hoàn trên một mẫu số âm.
 */
export function soTienConCoTheHoan(input: {
  /** `tinhThucThu` của mọi bút toán thuộc ghi danh — đã trừ các lần hoàn ĐÃ ghi sổ. */
  thucThu: number;
  /** Σ `approvedAmount` của RefundRequest đã duyệt (APPROVED) hoặc đã chi (PAID). */
  daDuyetHoan: number;
  /** Σ |amount| của bút toán REFUNDED đã ghi sổ. */
  daGhiSoHoan: number;
}): number {
  const dangChoChi = Math.max(0, input.daDuyetHoan - input.daGhiSoHoan);
  return Math.max(0, input.thucThu - dangChoChi);
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
 *   - paidConfirmed = số CÒN CÓ THỂ HOÀN (`soTienConCoTheHoan`) — thực thu của ghi danh
 *     trừ phần đã duyệt hoàn mà kế toán chưa chi. Tên cột giữ nguyên vì đây là dữ liệu
 *     PROD đang có (luật cứng #4: không đổi cột trên bảng đang chạy); ý nghĩa từ
 *     27/08/2026 là "còn có thể hoàn", KHÔNG còn là "Σ CONFIRMED".
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
}): Promise<RefundRequest | null> {
  const { enrollmentId, trigger, reason, requestedById = null, actorName = "Hệ thống", tx } = input;
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

  // HT (27/08/2026) — mẫu số là số CÒN LẠI THẬT, không phải số gộp.
  // (1) Thực thu của ghi danh, qua đúng công thức dùng chung `lib/finance/thuc-thu.ts`.
  const butToan = await client.payment.findMany({
    where: { enrollmentId, ...WHERE_THUC_THU },
    select: SELECT_THUC_THU,
  });
  // (2) Đã duyệt hoàn (kể cả đã chi) và (3) đã ghi bút toán âm — xem `soTienConCoTheHoan`.
  const [daDuyet, daGhiSo] = await Promise.all([
    client.refundRequest.aggregate({
      where: { enrollmentId, status: { in: ["APPROVED", "PAID"] } },
      _sum: { approvedAmount: true },
    }),
    client.payment.aggregate({
      where: { enrollmentId, accountantStatus: "REFUNDED", deletedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const paidConfirmed = soTienConCoTheHoan({
    thucThu: tinhThucThu(butToan),
    daDuyetHoan: daDuyet._sum.approvedAmount ?? 0,
    // Bút toán hoàn mang số ÂM → lấy trị tuyệt đối.
    daGhiSoHoan: Math.abs(daGhiSo._sum.amount ?? 0),
  });
  // Không còn gì để hoàn → không tạo yêu cầu (tránh yêu cầu 0đ rác, và tránh đề xuất
  // hoàn lần thứ hai trên tiền đã trả lại rồi).
  if (paidConfirmed <= 0) return null;

  // Số buổi: tổng (loại huỷ) + đã học (COMPLETED). Tuần tự (an toàn trong tx).
  const sessionsTotal = await client.classSession.count({
    where: { classId: enrollment.classId, status: { not: "CANCELLED" } },
  });
  const sessionsLearned = await client.classSession.count({
    where: { classId: enrollment.classId, status: "COMPLETED" },
  });

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
  if (!rr) throw new RefundError("NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền");
  if (rr.status !== "PENDING") {
    throw new RefundError("INVALID_STATE", `Yêu cầu đang ${rr.status} — không thể duyệt`);
  }
  const finalAmount =
    approvedAmount != null && approvedAmount >= 0 ? Math.round(approvedAmount) : rr.proposedAmount;

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
  if (!rr) throw new RefundError("NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền");
  if (rr.status !== "PENDING") {
    throw new RefundError("INVALID_STATE", `Yêu cầu đang ${rr.status} — không thể từ chối`);
  }

  const updated = await db.refundRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedById, approvedAt: new Date(), note: trimmed },
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
  const scopedClasses = await scopedDbClient.class.findMany({ select: { id: true } });
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
