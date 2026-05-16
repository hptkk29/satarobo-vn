"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  receiptSchema,
  issueSchema,
  transferSchema,
  type ReceiptInput,
  type IssueInput,
  type TransferInput,
} from "@/lib/validators/inventory";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"] as const;

async function requireRole(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return { ok: false, error: "Không có quyền ghi nhận giao dịch kho" };
  }
  return { ok: true, userId: session.user.id ?? "" };
}

async function resolveEmployeeId(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    return u?.employeeId ?? null;
  } catch {
    return null;
  }
}

function revalidateAfterMovement(itemId: string) {
  revalidatePath("/admin/inventory/items");
  revalidatePath("/admin/inventory/movements");
  revalidatePath(`/admin/inventory/items/${itemId}/edit`);
}

// ──────────────────────────────────────────────────────────────────────────
// RECEIPT — nhập kho
// ──────────────────────────────────────────────────────────────────────────

export async function recordReceipt(input: ReceiptInput): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const balance = await db.stockBalance.findUnique({
    where: {
      itemId_centerId: { itemId: data.itemId, centerId: data.centerId },
    },
    select: { id: true },
  });
  if (!balance) {
    return {
      ok: false,
      error: "Chưa có bản ghi tồn kho cho cặp item × cơ sở. Mở item và Lưu để tự khởi tạo.",
    };
  }

  const totalCost =
    data.unitPrice !== null ? data.unitPrice * data.quantity : null;
  const performedById = await resolveEmployeeId(gate.userId);

  try {
    await db.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          itemId: data.itemId,
          centerId: data.centerId,
          type: "RECEIPT",
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalCost,
          referenceType: "Supplier",
          referenceNote: data.referenceNote,
          notes: data.notes,
          performedById,
        },
      });
      await tx.stockBalance.update({
        where: {
          itemId_centerId: { itemId: data.itemId, centerId: data.centerId },
        },
        data: {
          quantity: { increment: data.quantity },
          lastReceiptAt: new Date(),
        },
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidateAfterMovement(data.itemId);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// ISSUE — xuất kho
// ──────────────────────────────────────────────────────────────────────────

export async function recordIssue(input: IssueInput): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const balance = await db.stockBalance.findUnique({
    where: {
      itemId_centerId: { itemId: data.itemId, centerId: data.centerId },
    },
    select: { quantity: true },
  });
  if (!balance) {
    return { ok: false, error: "Chưa có bản ghi tồn kho cho cặp item × cơ sở" };
  }
  if (balance.quantity < data.quantity) {
    return {
      ok: false,
      error: `Không đủ tồn (hiện ${balance.quantity}). Cần xuất ${data.quantity}.`,
    };
  }

  const performedById = await resolveEmployeeId(gate.userId);

  try {
    await db.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          itemId: data.itemId,
          centerId: data.centerId,
          type: "ISSUE",
          quantity: data.quantity,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          referenceNote: data.referenceNote,
          notes: data.notes,
          performedById,
        },
      });
      await tx.stockBalance.update({
        where: {
          itemId_centerId: { itemId: data.itemId, centerId: data.centerId },
        },
        data: {
          quantity: { decrement: data.quantity },
          lastIssueAt: new Date(),
        },
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidateAfterMovement(data.itemId);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// TRANSFER — chuyển kho giữa centers
// ──────────────────────────────────────────────────────────────────────────

export async function recordTransfer(input: TransferInput): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const [fromBalance, toBalance] = await Promise.all([
    db.stockBalance.findUnique({
      where: {
        itemId_centerId: { itemId: data.itemId, centerId: data.fromCenterId },
      },
      select: { quantity: true },
    }),
    db.stockBalance.findUnique({
      where: {
        itemId_centerId: { itemId: data.itemId, centerId: data.toCenterId },
      },
      select: { id: true },
    }),
  ]);

  if (!fromBalance) {
    return { ok: false, error: "Bản ghi tồn kho cơ sở nguồn không tồn tại" };
  }
  if (!toBalance) {
    return {
      ok: false,
      error:
        "Cơ sở đích chưa có bản ghi tồn kho — mở mặt hàng và Lưu (hoặc kích hoạt cơ sở) để tự khởi tạo trước khi chuyển.",
    };
  }
  if (fromBalance.quantity < data.quantity) {
    return {
      ok: false,
      error: `Cơ sở nguồn không đủ tồn (${fromBalance.quantity}). Cần chuyển ${data.quantity}.`,
    };
  }

  const performedById = await resolveEmployeeId(gate.userId);

  try {
    await db.$transaction(async (tx) => {
      const outMove = await tx.stockMovement.create({
        data: {
          itemId: data.itemId,
          centerId: data.fromCenterId,
          type: "TRANSFER_OUT",
          quantity: data.quantity,
          referenceType: "Center",
          referenceId: data.toCenterId,
          notes: data.notes,
          performedById,
        },
        select: { id: true },
      });

      const inMove = await tx.stockMovement.create({
        data: {
          itemId: data.itemId,
          centerId: data.toCenterId,
          type: "TRANSFER_IN",
          quantity: data.quantity,
          transferPairId: outMove.id,
          referenceType: "Center",
          referenceId: data.fromCenterId,
          notes: data.notes,
          performedById,
        },
        select: { id: true },
      });

      await tx.stockMovement.update({
        where: { id: outMove.id },
        data: { transferPairId: inMove.id },
      });

      await tx.stockBalance.update({
        where: {
          itemId_centerId: {
            itemId: data.itemId,
            centerId: data.fromCenterId,
          },
        },
        data: {
          quantity: { decrement: data.quantity },
          lastIssueAt: new Date(),
        },
      });
      await tx.stockBalance.update({
        where: {
          itemId_centerId: {
            itemId: data.itemId,
            centerId: data.toCenterId,
          },
        },
        data: {
          quantity: { increment: data.quantity },
          lastReceiptAt: new Date(),
        },
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidateAfterMovement(data.itemId);
  return { ok: true };
}
