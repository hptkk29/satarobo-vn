"use server";

// ĐỐI SOÁT TAY giao dịch tiền về — hàng chờ `BankTransaction.status = UNMATCHED`.
//
// VÌ SAO TRANG NÀY CẦN NÚT (chủ dự án hỏi 21/08: "chỉ view ra nhìn vậy thôi hả?").
// Trước đây màn này cố ý CHỈ ĐỌC, với lý do "xử lý tay làm ở trang đơn nơi có đủ
// ngữ cảnh". Lý do đó chỉ đúng khi đã BIẾT tiền của đơn nào — mà cả hàng chờ này
// tồn tại chính vì KHÔNG biết. Bắt kế toán đoán mã đơn rồi đi tìm ở màn khác là
// đẩy việc khó nhất sang chỗ không có dữ liệu để làm.
//
// ⚠️ KHÔNG viết lại phép rót tiền ở đây. Mọi thứ đi qua `allocateToOrder`
// (lib/payments/payos-ingest.ts) — CÙNG hàm mà webhook cổng thanh toán dùng. Rót
// tiền không chỉ là ghi `PaymentAllocation`: còn khoá đơn, tính lại trạng thái
// phiếu từ sổ, ghi tiền dư sang `CreditBalance`, ghi song song sổ CŨ (`Payment`)
// vì công nợ hiển thị vẫn đọc ở đó, rồi mới tới chốt đơn + cấp tài khoản phụ
// huynh + gửi biên nhận. Bản thứ hai chắc chắn bỏ sót vài bước.

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { allocateToOrder } from "@/lib/payments/payos-ingest";
import { phoneVariants } from "@/lib/phone";

export type DonUngVien = {
  id: string;
  code: string;
  customerName: string;
  studentName: string | null;
  customerPhone: string | null;
  courseName: string | null;
  /** Tổng phần còn thiếu của mọi phiếu chưa đóng đủ. */
  conThieu: number;
  /** Phiếu sẽ được rót vào (chưa đóng đủ, sớm nhất). */
  phieuId: string;
  soDot: number;
};

type KetQua = { ok: true; message: string } | { ok: false; error: string };

/**
 * Ai được ĐỘNG vào tiền ở màn này. `payments:view` chỉ để nhìn — không đủ.
 *
 * Union có cờ `ok` làm khoá phân biệt. Để TypeScript tự suy kiểu thì nhánh thành
 * công bị gắn thêm `error?: undefined`, và khi đó không cách nào thu hẹp kiểu được —
 * `ctx.actor` cứ là `Actor | undefined` ở mọi nhánh.
 */
type CongGhi =
  | { ok: false; error: string }
  | { ok: true; session: Session; actor: Actor };

async function gateGhi(): Promise<CongGhi> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:manage"))) {
    return { ok: false, error: "Không có quyền đối soát tiền" };
  }
  const actor = await resolveActor(session.user.id);
  return { ok: true, session, actor };
}

function lamMoi() {
  revalidatePath("/bien-dong-so-du");
  revalidatePath("/admin/bien-dong-so-du");
}

/**
 * Tìm đơn để gán một giao dịch vào. Tìm theo mã đơn, SĐT phụ huynh, tên người
 * mua hoặc tên học viên — kế toán cầm sao kê trong tay thường chỉ có một trong
 * mấy thứ đó.
 *
 * CHỈ trả đơn CÒN PHIẾU CHƯA ĐÓNG ĐỦ: đơn đã thu xong không phải đích rót tiền,
 * hiện ra chỉ tổ bấm nhầm. Đọc qua `scopedDb` nên kế toán cơ sở 1 không thấy đơn
 * cơ sở 2 — cách ly cơ sở áp cả ở đường gán tay, không riêng đường đọc.
 */
export async function timDonDeGan(tuKhoa: string): Promise<DonUngVien[]> {
  const ctx = await gateGhi();
  if (!ctx.ok) return [];

  const q = tuKhoa.trim();
  if (q.length < 2) return [];

  const sdt = phoneVariants(q);
  const rows = await scopedDb(ctx.actor).order.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] },
      paymentRequests: { some: { status: { in: ["PENDING", "PARTIAL"] } } },
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { in: sdt } },
        { student: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      code: true,
      customerName: true,
      customerPhone: true,
      student: { select: { name: true } },
      items: { orderBy: { createdAt: "asc" }, take: 1, select: { itemName: true } },
      paymentRequests: {
        where: { status: { in: ["PENDING", "PARTIAL"] } },
        orderBy: [{ sortOrder: "asc" }, { installmentNo: "asc" }],
        select: { id: true, installmentNo: true, amountDue: true, allocations: { select: { amount: true } } },
      },
    },
  });

  return rows.flatMap((o) => {
    const phieu = o.paymentRequests[0];
    if (!phieu) return [];
    const conThieu = o.paymentRequests.reduce((s, r) => {
      const daRot = r.allocations.reduce((x, a) => x + a.amount, 0);
      return s + Math.max(0, r.amountDue - daRot);
    }, 0);
    return [
      {
        id: o.id,
        code: o.code,
        customerName: o.customerName,
        studentName: o.student?.name ?? null,
        customerPhone: o.customerPhone,
        courseName: o.items[0]?.itemName ?? null,
        conThieu,
        phieuId: phieu.id,
        soDot: phieu.installmentNo,
      },
    ];
  });
}

/**
 * Gán một giao dịch UNMATCHED vào đơn mà kế toán chọn.
 *
 * ⚠️ `orderId` tới TỪ CLIENT nên phải tra lại qua `scopedDb` (chống IDOR: gán tiền
 * sang đơn cơ sở khác). `scopedDb` KHÔNG che write — nhưng ở đây mọi thứ ghi xuống
 * đều neo vào bản ghi đã qua `findUnique` có scope, không nhận từ client.
 */
export async function ganGiaoDichVaoDon(
  bankTransactionId: string,
  orderId: string,
): Promise<KetQua> {
  const ctx = await gateGhi();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const sdb = scopedDb(ctx.actor);

  const txn = await sdb.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    select: { id: true, status: true, amount: true, provider: true, providerTxnId: true, content: true },
  });
  if (!txn) return { ok: false, error: "Không tìm thấy giao dịch" };
  if (txn.status === "MATCHED") return { ok: false, error: "Giao dịch này đã được rót rồi" };

  const order = await sdb.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      status: true,
      centerId: true,
      orgUnitId: true,
      studentId: true,
      student: { select: { id: true, parentUserId: true } },
      paymentRequests: {
        where: { status: { in: ["PENDING", "PARTIAL"] } },
        orderBy: [{ sortOrder: "asc" }, { installmentNo: "asc" }],
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn hàng" };
  const phieu = order.paymentRequests[0];
  if (!phieu) return { ok: false, error: "Đơn này không còn phiếu thu nào đang chờ" };

  const { actorId, actorName } = getAuditActor(ctx.session);
  const ketQua = await allocateToOrder({
    bankTransactionId,
    order,
    amount: txn.amount,
    provider: txn.provider,
    providerTxnId: txn.providerTxnId,
    // `via: "manual"` để nhật ký phân biệt được tiền tự khớp với tiền người gán.
    target: { paymentRequestId: phieu.id, orderId: order.id, via: "manual" },
    // Payload tóm tắt CHỈ để ghi nhật ký — đường gán tay không có payload cổng.
    data: {
      description: txn.content ?? undefined,
      amount: txn.amount,
      reference: txn.providerTxnId,
    },
  });

  if (ketQua.status !== "MATCHED" && ketQua.status !== "DUPLICATE") {
    const lyDo = "reason" in ketQua ? ketQua.reason : "Không rót được";
    return { ok: false, error: lyDo };
  }

  // Ai gán tiền vào đơn nào — câu hỏi đầu tiên khi sau này phát hiện gán nhầm.
  await writeAudit({
    actor: { id: actorId ?? "", name: actorName },
    module: "finance",
    entityType: "BankTransaction",
    entityId: bankTransactionId,
    action: "TXN_MATCHED_MANUAL",
    newValues: { orderId: order.id, orderCode: order.code, amount: txn.amount },
    orgUnitId: order.centerId,
  });

  lamMoi();
  return {
    ok: true,
    message:
      ketQua.status === "DUPLICATE"
        ? "Giao dịch đã được rót trước đó — không ghi thêm lần nào."
        : `Đã rót ${txn.amount.toLocaleString("vi-VN")}đ vào đơn ${order.code}.`,
  };
}

/**
 * Đánh dấu giao dịch KHÔNG PHẢI học phí (tiền nhà, hoàn ứng, chuyển nhầm…) →
 * `IGNORED`, ra khỏi hàng chờ.
 *
 * Bắt buộc có lý do: hàng chờ đối soát mà cho dọn im lặng thì chỉ vài tuần là
 * không ai biết những giao dịch đã biến mất kia là gì. KHÔNG xoá bản ghi — tiền
 * vẫn nằm nguyên trong sổ, chỉ đổi nhãn.
 */
export async function boQuaGiaoDich(
  bankTransactionId: string,
  lyDo: string,
): Promise<KetQua> {
  const ctx = await gateGhi();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const ghiChu = lyDo.trim();
  if (!ghiChu) return { ok: false, error: "Cần ghi lý do bỏ qua" };

  const sdb = scopedDb(ctx.actor);
  const txn = await sdb.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    select: { id: true, status: true, amount: true },
  });
  if (!txn) return { ok: false, error: "Không tìm thấy giao dịch" };
  if (txn.status === "MATCHED") {
    return { ok: false, error: "Giao dịch đã rót vào phiếu thu — không bỏ qua được" };
  }

  const { actorId, actorName } = getAuditActor(ctx.session);
  await sdb.bankTransaction.update({
    where: { id: txn.id },
    data: { status: "IGNORED", unmatchedNote: `Bỏ qua: ${ghiChu} (${actorName})` },
  });
  await writeAudit({
    actor: { id: actorId ?? "", name: actorName },
    module: "finance",
    entityType: "BankTransaction",
    entityId: txn.id,
    action: "TXN_IGNORED",
    oldValues: { status: txn.status },
    newValues: { status: "IGNORED" },
    reason: ghiChu,
    orgUnitId: null,
  });

  lamMoi();
  return { ok: true, message: "Đã đưa giao dịch ra khỏi hàng chờ đối soát." };
}
