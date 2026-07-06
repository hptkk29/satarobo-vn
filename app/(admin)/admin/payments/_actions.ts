"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
// ─── lib/finance/* — parallel agent owns these. Combined typecheck resolves. ──
// Contract assumed (single object arg, returns discriminated `{ ok }`):
//   recordPayment(input)  -> { ok:true; paymentId } | { ok:false; error }
//   confirmPayment(args)  -> { ok:true; receiptCode? } | { ok:false; error }
//   rejectPayment(args)   -> { ok:true } | { ok:false; error }
//   adjustPayment(args)   -> { ok:true; paymentId } | { ok:false; error }
//   refundPayment(args)   -> { ok:true } | { ok:false; error }
import {
  recordPayment,
  confirmPayment,
  rejectPayment,
  adjustPayment,
  refundPayment,
} from "@/lib/finance/payment";

const PAGE_SIZE = 30;

// ─── AUTH GATES ─────────────────────────────────────────────────────
// R7-04 AC1/AC5 — tách nhiệm vụ: Sale GHI NHẬN (payments:record, gồm SALES_CSM),
// Kế toán XÁC NHẬN (payments:confirm = SUPER_ADMIN/ACCOUNTANT). Sale không confirm được.
async function requireRecord() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate trước khi fetch order/payment cụ thể → chưa có centerId, không truyền target
  // được ở đây (xem báo cáo). Cách ly cơ sở thật sự nằm ở scopedDb/passesScope bên dưới.
  if (!(await checkPermission("payments:record"))) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

async function requireAccountant() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate trước khi fetch payment cụ thể → chưa có centerId, không truyền target được ở
  // đây (xem báo cáo). Cách ly cơ sở thật sự nằm ở scopedDb/passesScope bên dưới.
  if (!(await checkPermission("payments:confirm"))) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

// ─── VALIDATORS (inline — lib/validators is out of scope to touch) ──────
const recordSchema = z.object({
  orderId: z.string().min(1, "Thiếu đơn hàng"),
  enrollmentId: z.string().trim().optional().nullable(),
  amount: z.coerce.number().int().positive("Số tiền phải > 0"),
  method: z.string().min(1, "Chọn phương thức"),
  paidDate: z.string().min(1, "Chọn ngày thu"),
  evidenceUrl: z.string().trim().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

const adjustSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.coerce.number().int().positive("Số tiền phải > 0"),
  method: z.string().trim().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự"),
  // FIX-H9 — optimistic lock: Payment.updatedAt (ISO) client đã thấy.
  expectedUpdatedAt: z.string().optional().nullable(),
});

function trimOrNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

// ─── LIST / FORM DATA (scopedDb — cách ly cơ sở tự động) ───────────────
export type PaymentFilters = {
  saleStatus?: string;
  accountantStatus?: string;
  search?: string;
};

export async function queryPayments(filters: PaymentFilters) {
  const session = await requireRecord();
  const sdb = scopedDb(await resolveActor(session.user.id));

  const AND: Array<Record<string, unknown>> = [];
  if (filters.saleStatus) AND.push({ saleStatus: filters.saleStatus });
  if (filters.accountantStatus)
    AND.push({ accountantStatus: filters.accountantStatus });
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    AND.push({
      OR: [
        { order: { code: { contains: s, mode: "insensitive" } } },
        { order: { customerName: { contains: s, mode: "insensitive" } } },
      ],
    });
  }

  const rows = await sdb.payment.findMany({
    where: AND.length ? { AND } : undefined,
    include: {
      order: { select: { id: true, code: true, customerName: true } },
      enrollment: { select: { id: true } },
      receipts: { select: { code: true, status: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: PAGE_SIZE,
  });

  return rows;
}

export type PaymentRow = Awaited<ReturnType<typeof queryPayments>>[number];

/** Đơn hàng gần đây trong scope — dùng cho select của form ghi nhận khoản. */
export async function loadOrderOptions() {
  const session = await requireRecord();
  const sdb = scopedDb(await resolveActor(session.user.id));
  const orders = await sdb.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      code: true,
      customerName: true,
      totalAmount: true,
      centerId: true,
    },
  });
  return orders;
}

// ─── RECORD (Sale ghi nhận khoản đã thu) ────────────────────────────────
export async function recordPaymentAction(input: unknown) {
  const session = await requireRecord();
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const data = parsed.data;

  const uid = session.user.id;
  if (!uid) return { ok: false as const, error: "Phiên không hợp lệ" };
  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);

  // Lấy order để (a) chống IDOR liên cơ sở, (b) suy centerId cho Payment, (c) auto-advance lead.
  const order = await sdb.order.findUnique({
    where: { id: data.orderId },
    select: { id: true, centerId: true, leadId: true },
  });
  if (!order || !passesScope("Order", order, actor)) {
    return { ok: false as const, error: "Không tìm thấy đơn hàng" };
  }

  const res = await recordPayment({
    orderId: data.orderId,
    enrollmentId: trimOrNull(data.enrollmentId),
    amount: data.amount,
    method: data.method,
    paidDate: new Date(data.paidDate),
    evidenceUrl: trimOrNull(data.evidenceUrl),
    note: trimOrNull(data.note),
    centerId: order.centerId,
    recordedById: uid,
    // S3 — auto-advance lead AWAITING_DECISION→REGISTERED (xử lý trong recordPayment, cùng tx).
    leadId: order.leadId,
  });

  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath("/payments");
  revalidatePath("/cong-no");
  // S6 — đồng bộ trang lead/convert.
  if (order.leadId) {
    revalidatePath(`/leads/${order.leadId}`);
    revalidatePath(`/leads/${order.leadId}/convert`);
  }
  return { ok: true as const, paymentId: res.paymentId };
}

// ─── Helper: load Payment by id + scope check (chống IDOR) ──────────────
// Trả uid để by-id mutation truyền confirmedById (lib yêu cầu string).
async function loadScopedPayment(
  userId: string | undefined,
  paymentId: string,
): Promise<{ ok: true; uid: string; recordedById: string | null } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: "Phiên không hợp lệ" };
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);
  const row = await sdb.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, centerId: true, accountantStatus: true, recordedById: true },
  });
  if (!row || !passesScope("Payment", row, actor)) {
    return { ok: false, error: "Không tìm thấy khoản thanh toán" };
  }
  return { ok: true, uid: userId, recordedById: row.recordedById };
}

// ─── CONFIRM (Kế toán xác nhận → sinh Receipt) ──────────────────────────
// FIX-H8 — `idempotencyKey` (uuid client tạo mỗi lần bấm) làm double-click/retry an toàn.
export async function confirmPaymentAction(paymentId: string, idempotencyKey?: string) {
  const session = await requireAccountant();
  const scope = await loadScopedPayment(session.user.id, paymentId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  // AC5 — tách nhiệm vụ: người ghi nhận không được tự xác nhận khoản của mình.
  if (scope.recordedById && scope.recordedById === scope.uid) {
    return { ok: false as const, error: "Người ghi nhận không được tự xác nhận khoản của mình" };
  }

  const res = await confirmPayment({ paymentId, confirmedById: scope.uid, idempotencyKey });
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath("/payments");
  revalidatePath("/cong-no");
  // S6 — đồng bộ trang lead/convert (lấy leadId qua order của khoản, scopedDb cách ly cơ sở).
  const sdb = scopedDb(await resolveActor(session.user.id));
  const p = await sdb.payment.findUnique({
    where: { id: paymentId },
    select: { order: { select: { leadId: true } } },
  });
  const leadId = p?.order?.leadId;
  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/convert`);
  }
  return { ok: true as const, receiptId: res.receiptId };
}

// ─── REJECT (Kế toán từ chối — bắt buộc reason ≥5) ──────────────────────
export async function rejectPaymentAction(
  paymentId: string,
  reason: string,
  expectedUpdatedAt?: string,
) {
  const session = await requireAccountant();
  if (!reason || reason.trim().length < 5) {
    return { ok: false as const, error: "Lý do từ chối tối thiểu 5 ký tự" };
  }
  const scope = await loadScopedPayment(session.user.id, paymentId);
  if (!scope.ok) return { ok: false as const, error: scope.error };

  const res = await rejectPayment({
    paymentId,
    confirmedById: scope.uid,
    reason: reason.trim(),
    expectedUpdatedAt: expectedUpdatedAt || undefined,
  });
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath("/payments");
  revalidatePath("/cong-no");
  return { ok: true as const };
}

// ─── ADJUST (Kế toán điều chỉnh — bút toán mới trỏ adjustmentOfId) ───────
export async function adjustPaymentAction(input: unknown) {
  const session = await requireAccountant();
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const data = parsed.data;
  const scope = await loadScopedPayment(session.user.id, data.paymentId);
  if (!scope.ok) return { ok: false as const, error: scope.error };

  const res = await adjustPayment({
    paymentId: data.paymentId,
    confirmedById: scope.uid,
    amount: data.amount,
    method: trimOrNull(data.method) ?? undefined,
    note: trimOrNull(data.note),
    reason: data.reason.trim(),
    expectedUpdatedAt: data.expectedUpdatedAt || undefined,
  });
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath("/payments");
  revalidatePath("/cong-no");
  return { ok: true as const, adjustmentId: res.adjustmentId };
}

// ─── REFUND (Kế toán hoàn — bút toán âm, không xoá gốc) ─────────────────
export async function refundPaymentAction(
  paymentId: string,
  reason: string,
  expectedUpdatedAt?: string,
) {
  const session = await requireAccountant();
  if (!reason || reason.trim().length < 5) {
    return { ok: false as const, error: "Lý do hoàn tiền tối thiểu 5 ký tự" };
  }
  const scope = await loadScopedPayment(session.user.id, paymentId);
  if (!scope.ok) return { ok: false as const, error: scope.error };

  const res = await refundPayment({
    paymentId,
    confirmedById: scope.uid,
    reason: reason.trim(),
    expectedUpdatedAt: expectedUpdatedAt || undefined,
  });
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath("/payments");
  revalidatePath("/cong-no");
  return { ok: true as const };
}
