"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  voucherCreateSchema,
  voucherUpdateSchema,
} from "@/lib/validators/voucher";
import {
  logVoucherAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";

async function requireVouchersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "vouchers:manage")) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

// ─── CREATE ───────────────────────────────────────────────────────────
export async function createVoucherAction(input: unknown) {
  const session = await requireVouchersManage();
  const parsed = voucherCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Dữ liệu không hợp lệ",
      issues: parsed.error.flatten(),
    };
  }

  const data = parsed.data;

  const existing = await db.voucher.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  if (existing) {
    return { ok: false as const, error: `Mã "${data.code}" đã tồn tại` };
  }

  const { actorId, actorName } = getAuditActor(session);

  const created = await db.$transaction(async (tx) => {
    const v = await tx.voucher.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        discountKind: data.discountKind,
        discountPercent: data.discountPercent ?? null,
        discountAmount: data.discountAmount ?? null,
        maxDiscount: data.maxDiscount ?? null,
        minOrderValue: data.minOrderValue,
        quantity: data.quantity ?? null,
        usageLimitPerUser: data.usageLimitPerUser,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: data.isActive,
        createdByUserId: actorId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        isActive: true,
      },
    });

    await logVoucherAudit({
      voucherId: v.id,
      action: "CREATE",
      actorId,
      actorName,
      newValues: {
        code: v.code,
        name: v.name,
        type: v.type,
        discountKind: data.discountKind,
        isActive: v.isActive,
      },
      tx,
    });

    return v;
  });

  revalidatePath("/vouchers");
  return { ok: true as const, id: created.id };
}

const SNAPSHOT_SELECT = {
  code: true,
  name: true,
  description: true,
  type: true,
  discountKind: true,
  discountPercent: true,
  discountAmount: true,
  maxDiscount: true,
  minOrderValue: true,
  quantity: true,
  usageLimitPerUser: true,
  validFrom: true,
  validUntil: true,
  isActive: true,
} as const;

// ─── UPDATE ───────────────────────────────────────────────────────────
export async function updateVoucherAction(id: string, input: unknown) {
  const session = await requireVouchersManage();

  const before = await db.voucher.findUnique({
    where: { id },
    select: SNAPSHOT_SELECT,
  });
  if (!before) return { ok: false as const, error: "Không tìm thấy voucher" };

  const parsed = voucherUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Dữ liệu không hợp lệ",
      issues: parsed.error.flatten(),
    };
  }

  const data = parsed.data;

  // Code, type, discountKind IMMUTABLE after creation
  if (data.code !== before.code) {
    return {
      ok: false as const,
      error: "Không thể đổi mã voucher sau khi tạo",
    };
  }
  if (data.type !== before.type) {
    return {
      ok: false as const,
      error: "Không thể đổi loại voucher sau khi tạo",
    };
  }
  if (data.discountKind !== before.discountKind) {
    return {
      ok: false as const,
      error: "Không thể đổi loại giảm giá sau khi tạo",
    };
  }

  const { actorId, actorName } = getAuditActor(session);

  await db.$transaction(async (tx) => {
    const updated = await tx.voucher.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
        discountPercent: data.discountPercent ?? null,
        discountAmount: data.discountAmount ?? null,
        maxDiscount: data.maxDiscount ?? null,
        minOrderValue: data.minOrderValue,
        quantity: data.quantity ?? null,
        usageLimitPerUser: data.usageLimitPerUser,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: data.isActive,
      },
      select: SNAPSHOT_SELECT,
    });

    await logVoucherAudit({
      voucherId: id,
      action: "UPDATE",
      actorId,
      actorName,
      oldValues: before,
      newValues: updated,
      changedFields: detectChangedFields(before, updated),
      tx,
    });
  });

  revalidatePath("/vouchers");
  revalidatePath(`/vouchers/${id}/edit`);
  return { ok: true as const };
}

// ─── TOGGLE ACTIVE ────────────────────────────────────────────────────
export async function toggleVoucherActiveAction(id: string) {
  const session = await requireVouchersManage();

  const v = await db.voucher.findUnique({
    where: { id },
    select: { isActive: true, code: true },
  });
  if (!v) return { ok: false as const, error: "Không tìm thấy" };

  const { actorId, actorName } = getAuditActor(session);
  const willBeActive = !v.isActive;

  await db.$transaction(async (tx) => {
    await tx.voucher.update({
      where: { id },
      data: { isActive: willBeActive },
    });

    await logVoucherAudit({
      voucherId: id,
      action: willBeActive ? "ENABLE" : "DISABLE",
      actorId,
      actorName,
      oldValues: { isActive: v.isActive },
      newValues: { isActive: willBeActive },
      changedFields: ["isActive"],
      tx,
    });
  });

  revalidatePath("/vouchers");
  return { ok: true as const, isActive: willBeActive };
}
