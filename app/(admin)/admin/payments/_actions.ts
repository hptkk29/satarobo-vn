"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission, assertPermission } from "@/lib/auth/check-permission";
import { PermissionError } from "@/lib/auth/can";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import { maskNationalId, maskAddress } from "@/lib/finance/pii-mask";
import { breakGlassSchema } from "@/lib/validators/audit";
import { writeAudit } from "@/lib/audit/audit-log";
import { getAuditActor } from "@/lib/audit/log";
import { getRequestMetadata } from "@/lib/audit/headers";
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

// #15 (câu 32) — 1 dòng khoản chờ xác nhận cho màn Kế toán. Flat DTO (serializable),
// CHỈ gồm field cần hiển thị; PII (CCCD PH + địa chỉ) đã MASK sẵn ở server, KHÔNG gửi
// bản raw xuống client khi chưa break-glass.
export type PaymentListRow = {
  id: string;
  amount: number;
  method: string;
  paidDate: string; // ISO
  updatedAt: string; // ISO
  saleStatus: string;
  accountantStatus: string;
  orderCode: string | null;
  customerName: string | null;
  studentName: string | null; // tên bé
  className: string | null; // lớp
  collectedByName: string | null; // người thu (recordedBy)
  leadSource: string | null; // nguồn học viên
  parentName: string | null; // tên PH
  parentNationalId: string | null; // CCCD PH — mask/raw theo break-glass
  address: string | null; // địa chỉ — mask/raw theo break-glass
  piiMasked: boolean; // true = đang che (mặc định); false = đã break-glass
  receiptCode: string | null; // mã phiếu thu ACTIVE (để in)
  hasActiveReceipt: boolean;
};

// Lõi query dùng chung (KHÔNG export → không phải 'use server' entry point). Chỉ được
// gọi sau khi caller đã gác quyền. `wantUnmask=true` chỉ đi từ revealPaymentsPii (đã
// assertPermission + reason + writeAudit). scopedDb ép cách ly cơ sở như thường.
async function fetchPaymentRows(
  userId: string,
  filters: PaymentFilters,
  wantUnmask: boolean,
): Promise<PaymentListRow[]> {
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);

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

  // Payment ∈ SCOPED_MODELS → findMany đã tự lọc centerId theo actor (cách ly cơ sở:
  // CENTER_ACCOUNTANT CS1 KHÔNG thấy khoản/CCCD CS2). Nested include chỉ để hiển thị.
  const rows = await sdb.payment.findMany({
    where: AND.length ? { AND } : undefined,
    include: {
      order: {
        select: {
          id: true,
          code: true,
          customerName: true,
          student: {
            select: {
              name: true,
              parentName: true,
              parentNationalId: true,
              address: true,
            },
          },
          lead: { select: { source: true } },
        },
      },
      enrollment: { select: { id: true, class: { select: { name: true } } } },
      receipts: { select: { code: true, status: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: PAGE_SIZE,
  });

  // "Người thu" = người ghi nhận khoản (Payment.recordedById là String thuần, KHÔNG có
  // quan hệ Prisma) → tra tên qua 1 query User (User ∈ SCOPE_EXEMPT, đọc toàn cục OK).
  const collectorIds = [
    ...new Set(rows.map((r) => r.recordedById).filter((v): v is string => !!v)),
  ];
  const collectors = collectorIds.length
    ? await sdb.user.findMany({
        where: { id: { in: collectorIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(collectors.map((u) => [u.id, u.name]));

  // Defense in depth: chỉ unmask khi caller THẬT SỰ có quyền. Không đủ quyền → im lặng
  // trả bản MASK (an toàn). wantUnmask chỉ true khi đã qua break-glass ở revealPaymentsPii.
  const unmask = wantUnmask && (await checkPermission("payments:view-pii"));

  return rows.map((p) => {
    const activeReceipt = p.receipts.find((r) => r.status === "ACTIVE");
    const rawCccd = p.order?.student?.parentNationalId ?? null;
    const rawAddress = p.order?.student?.address ?? null;
    return {
      id: p.id,
      amount: p.amount,
      method: p.method,
      paidDate: p.paidDate.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      saleStatus: p.saleStatus,
      accountantStatus: p.accountantStatus,
      orderCode: p.order?.code ?? null,
      customerName: p.order?.customerName ?? null,
      studentName: p.order?.student?.name ?? null,
      className: p.enrollment?.class?.name ?? null,
      collectedByName: p.recordedById
        ? (nameById.get(p.recordedById) ?? null)
        : null,
      leadSource: p.order?.lead?.source ?? null,
      parentName: p.order?.student?.parentName ?? null,
      parentNationalId: unmask ? rawCccd : maskNationalId(rawCccd),
      address: unmask ? rawAddress : maskAddress(rawAddress),
      piiMasked: !unmask,
      receiptCode: activeReceipt?.code ?? null,
      hasActiveReceipt: !!activeReceipt,
    };
  });
}

// LUÔN trả bản MASK. Raw CCCD PH + địa chỉ KHÔNG BAO GIỜ ra từ đây — chỉ qua
// revealPaymentsPii (đường DUY NHẤT có reason + audit). Không còn tham số unmask.
export async function queryPayments(
  filters: PaymentFilters,
): Promise<PaymentListRow[]> {
  const session = await requireRecord();
  return fetchPaymentRows(session.user.id, filters, false);
}

export type PaymentRow = PaymentListRow;

// ─── #15 — BREAK-GLASS: mở xem đầy đủ CCCD PH + địa chỉ (reason + audit) ──────────
/**
 * ĐƯỜNG DUY NHẤT trả raw CCCD PH + địa chỉ. Bấm "Xem đầy đủ" → nhập lý do (≥10 ký tự)
 * → (1) assertPermission('payments:view-pii'); (2) reason ≥10; (3) ghi log RIÊNG
 * `payments.pii-unmasked` (ai – lúc nào – lý do) TRƯỚC khi trả raw; (4) query & trả
 * rows UNMASK. Mọi lối trả raw đều đi qua audit — không còn queryPayments({unmask}).
 */
export async function revealPaymentsPii(
  filters: PaymentFilters,
  reason: string,
): Promise<{ ok: true; rows: PaymentListRow[] } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  // (1) Chỉ kế toán/admin (payments:view-pii) mới mở xem đầy đủ.
  try {
    await assertPermission("payments:view-pii");
  } catch (e) {
    if (e instanceof PermissionError) {
      return { ok: false, error: "Bạn không có quyền xem đầy đủ CCCD/địa chỉ" };
    }
    throw e;
  }

  // (2) Bắt buộc reason ≥10 ký tự (break-glass).
  const parsed = breakGlassSchema.safeParse({ reason });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Lý do không hợp lệ",
    };
  }

  // (3) Ghi log break-glass TRƯỚC khi trả raw.
  const { actorId, actorName } = getAuditActor(session);
  const meta = await getRequestMetadata();
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "finance",
    entityType: "Payment",
    entityId: "*",
    action: "payments.pii-unmasked",
    reason: parsed.data.reason,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  // (4) Đã audit → mới trả rows UNMASK (scopedDb vẫn cách ly cơ sở).
  const rows = await fetchPaymentRows(session.user.id, filters, true);
  return { ok: true, rows };
}

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
