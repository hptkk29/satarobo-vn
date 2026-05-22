"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  paymentMethodCreateSchema,
  paymentMethodUpdateSchema,
} from "@/lib/validators/payment-method";
import {
  logPaymentMethodAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";

async function requirePaymentsManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "payments:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session;
}

function readForm(formData: FormData) {
  const image = String(formData.get("image") ?? "").trim();
  return {
    code: String(formData.get("code") ?? "").toUpperCase().trim(),
    name: String(formData.get("name") ?? "").trim(),
    type: formData.get("type"),
    description: (formData.get("description") || null) as string | null,
    image: image || null,
    canBuyCourse: formData.get("canBuyCourse") === "on",
    canBuyPackage: formData.get("canBuyPackage") === "on",
    canBuyExam: formData.get("canBuyExam") === "on",
    canBuyProduct: formData.get("canBuyProduct") === "on",
    canDeposit: formData.get("canDeposit") === "on",
    bankName: (formData.get("bankName") || null) as string | null,
    bankBranch: (formData.get("bankBranch") || null) as string | null,
    bankAccountNumber: (formData.get("bankAccountNumber") || null) as
      | string
      | null,
    bankAccountName: (formData.get("bankAccountName") || null) as string | null,
    gatewayConfig: (formData.get("gatewayConfig") || null) as string | null,
    displayOrder: Number(formData.get("displayOrder") ?? 0),
    isActive: formData.get("isActive") === "on",
  };
}

// ─── CREATE ───────────────────────────────────────────────────────────
export async function createPaymentMethodAction(formData: FormData) {
  const session = await requirePaymentsManage();

  const parsed = paymentMethodCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Dữ liệu không hợp lệ",
      issues: parsed.error.flatten(),
    };
  }

  const existing = await db.paymentMethod.findUnique({
    where: { code: parsed.data.code },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false as const,
      error: `Mã "${parsed.data.code}" đã tồn tại`,
    };
  }

  const { actorId, actorName } = getAuditActor(session);

  const gatewayConfigJson = parsed.data.gatewayConfig?.trim()
    ? (JSON.parse(parsed.data.gatewayConfig) as Prisma.InputJsonValue)
    : undefined;

  const created = await db.$transaction(async (tx) => {
    const pm = await tx.paymentMethod.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
        image: parsed.data.image ?? null,
        canBuyCourse: parsed.data.canBuyCourse,
        canBuyPackage: parsed.data.canBuyPackage,
        canBuyExam: parsed.data.canBuyExam,
        canBuyProduct: parsed.data.canBuyProduct,
        canDeposit: parsed.data.canDeposit,
        bankName: parsed.data.bankName ?? null,
        bankBranch: parsed.data.bankBranch ?? null,
        bankAccountNumber: parsed.data.bankAccountNumber ?? null,
        bankAccountName: parsed.data.bankAccountName ?? null,
        gatewayConfig: gatewayConfigJson,
        displayOrder: parsed.data.displayOrder,
        isActive: parsed.data.isActive,
      },
      select: { id: true, code: true, name: true, type: true, isActive: true },
    });

    await logPaymentMethodAudit({
      paymentMethodId: pm.id,
      action: "CREATE",
      actorId,
      actorName,
      newValues: {
        code: pm.code,
        name: pm.name,
        type: pm.type,
        isActive: pm.isActive,
      },
      tx,
    });

    return pm;
  });

  revalidatePath("/admin/payment-methods");
  return { ok: true as const, id: created.id };
}

// ─── UPDATE ───────────────────────────────────────────────────────────
const SNAPSHOT_SELECT = {
  code: true,
  name: true,
  type: true,
  description: true,
  image: true,
  canBuyCourse: true,
  canBuyPackage: true,
  canBuyExam: true,
  canBuyProduct: true,
  canDeposit: true,
  bankName: true,
  bankBranch: true,
  bankAccountNumber: true,
  bankAccountName: true,
  gatewayConfig: true,
  displayOrder: true,
  isActive: true,
} as const;

export async function updatePaymentMethodAction(
  id: string,
  formData: FormData,
) {
  const session = await requirePaymentsManage();

  const before = await db.paymentMethod.findUnique({
    where: { id },
    select: SNAPSHOT_SELECT,
  });
  if (!before) return { ok: false as const, error: "Không tìm thấy" };

  const parsed = paymentMethodUpdateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Dữ liệu không hợp lệ",
      issues: parsed.error.flatten(),
    };
  }

  if (parsed.data.code !== before.code) {
    const dup = await db.paymentMethod.findUnique({
      where: { code: parsed.data.code },
      select: { id: true },
    });
    if (dup) {
      return {
        ok: false as const,
        error: `Mã "${parsed.data.code}" đã tồn tại`,
      };
    }
  }

  const { actorId, actorName } = getAuditActor(session);

  const gatewayConfigJson = parsed.data.gatewayConfig?.trim()
    ? (JSON.parse(parsed.data.gatewayConfig) as Prisma.InputJsonValue)
    : Prisma.JsonNull;

  await db.$transaction(async (tx) => {
    const updated = await tx.paymentMethod.update({
      where: { id },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
        image: parsed.data.image ?? null,
        canBuyCourse: parsed.data.canBuyCourse,
        canBuyPackage: parsed.data.canBuyPackage,
        canBuyExam: parsed.data.canBuyExam,
        canBuyProduct: parsed.data.canBuyProduct,
        canDeposit: parsed.data.canDeposit,
        bankName: parsed.data.bankName ?? null,
        bankBranch: parsed.data.bankBranch ?? null,
        bankAccountNumber: parsed.data.bankAccountNumber ?? null,
        bankAccountName: parsed.data.bankAccountName ?? null,
        gatewayConfig: gatewayConfigJson,
        displayOrder: parsed.data.displayOrder,
        isActive: parsed.data.isActive,
      },
      select: SNAPSHOT_SELECT,
    });

    await logPaymentMethodAudit({
      paymentMethodId: id,
      action: "UPDATE",
      actorId,
      actorName,
      oldValues: before,
      newValues: updated,
      changedFields: detectChangedFields(before, updated),
      tx,
    });
  });

  revalidatePath("/admin/payment-methods");
  revalidatePath(`/admin/payment-methods/${id}/edit`);
  return { ok: true as const };
}

// ─── TOGGLE ACTIVE ────────────────────────────────────────────────────
export async function togglePaymentMethodActiveAction(id: string) {
  const session = await requirePaymentsManage();

  const pm = await db.paymentMethod.findUnique({
    where: { id },
    select: { isActive: true, code: true },
  });
  if (!pm) return { ok: false as const, error: "Không tìm thấy" };

  const { actorId, actorName } = getAuditActor(session);
  const willBeActive = !pm.isActive;

  await db.$transaction(async (tx) => {
    await tx.paymentMethod.update({
      where: { id },
      data: { isActive: willBeActive },
    });

    await logPaymentMethodAudit({
      paymentMethodId: id,
      action: willBeActive ? "ENABLE" : "DISABLE",
      actorId,
      actorName,
      oldValues: { isActive: pm.isActive },
      newValues: { isActive: willBeActive },
      changedFields: ["isActive"],
      tx,
    });
  });

  revalidatePath("/admin/payment-methods");
  return { ok: true as const, isActive: willBeActive };
}
