import type { Prisma, PrismaClient } from "@prisma/client";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { getRequestMetadata } from "@/lib/audit/headers";

type TxClient = Prisma.TransactionClient;
type DbClient = PrismaClient | TxClient;

// ─── USER AUDIT ─────────────────────────────────────────────────────
export type UserAuditAction =
  | "CREATE"
  | "UPDATE"
  | "DISABLE"
  | "ENABLE"
  | "PASSWORD_RESET"
  | "ROLE_CHANGE";

export async function logUserAudit(params: {
  userId: string;
  action: UserAuditAction;
  actorId: string | null;
  actorName: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  reason?: string;
  tx?: TxClient;
}) {
  const metadata = await getRequestMetadata();
  const client: DbClient = params.tx ?? db;
  await client.userAuditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldValues: params.oldValues as Prisma.InputJsonValue | undefined,
      newValues: params.newValues as Prisma.InputJsonValue | undefined,
      changedFields: params.changedFields ?? [],
      reason: params.reason ?? null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

// ─── PERMISSION GRANT AUDIT ─────────────────────────────────────────
export type PermissionGrantAuditAction = "ADD" | "UPDATE" | "REMOVE";

export async function logGrantAudit(params: {
  userId: string;
  grantId?: string | null;
  actionKey: string;
  action: PermissionGrantAuditAction;
  actorId: string | null;
  actorName: string;
  oldGrant?: "ALLOW" | "DENY" | null;
  newGrant?: "ALLOW" | "DENY" | null;
  reason?: string;
  tx?: TxClient;
}) {
  const metadata = await getRequestMetadata();
  const client: DbClient = params.tx ?? db;
  await client.permissionGrantAuditLog.create({
    data: {
      userId: params.userId,
      grantId: params.grantId ?? null,
      actionKey: params.actionKey,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldGrant: params.oldGrant ?? null,
      newGrant: params.newGrant ?? null,
      reason: params.reason ?? null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

// ─── LEAD AUDIT ─────────────────────────────────────────────────────
export type LeadAuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ASSIGN"
  | "STATUS_CHANGE";

export async function logLeadAudit(params: {
  leadId: string;
  action: LeadAuditAction;
  actorId: string | null;
  actorName: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  reason?: string;
  tx?: TxClient;
}) {
  const metadata = await getRequestMetadata();
  const client: DbClient = params.tx ?? db;
  await client.leadAuditLog.create({
    data: {
      leadId: params.leadId,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldValues: params.oldValues as Prisma.InputJsonValue | undefined,
      newValues: params.newValues as Prisma.InputJsonValue | undefined,
      changedFields: params.changedFields ?? [],
      reason: params.reason ?? null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

// ─── CLASS AUDIT ────────────────────────────────────────────────────
export type ClassAuditAction = "CREATE" | "UPDATE" | "DELETE";

export async function logClassAudit(params: {
  classId: string;
  action: ClassAuditAction;
  actorId: string | null;
  actorName: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  reason?: string;
  tx?: TxClient;
}) {
  const metadata = await getRequestMetadata();
  const client: DbClient = params.tx ?? db;
  await client.classAuditLog.create({
    data: {
      classId: params.classId,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldValues: params.oldValues as Prisma.InputJsonValue | undefined,
      newValues: params.newValues as Prisma.InputJsonValue | undefined,
      changedFields: params.changedFields ?? [],
      reason: params.reason ?? null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

// ─── STUDENT AUDIT ──────────────────────────────────────────────────
export type StudentAuditAction = "CREATE" | "UPDATE" | "DELETE";

export async function logStudentAudit(params: {
  studentId: string;
  action: StudentAuditAction;
  actorId: string | null;
  actorName: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  reason?: string;
  tx?: TxClient;
}) {
  const metadata = await getRequestMetadata();
  const client: DbClient = params.tx ?? db;
  await client.studentAuditLog.create({
    data: {
      studentId: params.studentId,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldValues: params.oldValues as Prisma.InputJsonValue | undefined,
      newValues: params.newValues as Prisma.InputJsonValue | undefined,
      changedFields: params.changedFields ?? [],
      reason: params.reason ?? null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

// ─── PAYMENT METHOD AUDIT ───────────────────────────────────────────
export type PaymentMethodAuditAction =
  | "CREATE"
  | "UPDATE"
  | "ENABLE"
  | "DISABLE";

export async function logPaymentMethodAudit(params: {
  paymentMethodId: string;
  action: PaymentMethodAuditAction;
  actorId: string | null;
  actorName: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  reason?: string;
  tx?: TxClient;
}) {
  const metadata = await getRequestMetadata();
  const client: DbClient = params.tx ?? db;
  await client.paymentMethodAuditLog.create({
    data: {
      paymentMethodId: params.paymentMethodId,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldValues: params.oldValues as Prisma.InputJsonValue | undefined,
      newValues: params.newValues as Prisma.InputJsonValue | undefined,
      changedFields: params.changedFields ?? [],
      reason: params.reason ?? null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

// ─── VOUCHER AUDIT ──────────────────────────────────────────────────
export type VoucherAuditAction = "CREATE" | "UPDATE" | "ENABLE" | "DISABLE";

export async function logVoucherAudit(params: {
  voucherId: string;
  action: VoucherAuditAction;
  actorId: string | null;
  actorName: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  reason?: string;
  tx?: TxClient;
}) {
  const metadata = await getRequestMetadata();
  const client: DbClient = params.tx ?? db;
  await client.voucherAuditLog.create({
    data: {
      voucherId: params.voucherId,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldValues: params.oldValues as Prisma.InputJsonValue | undefined,
      newValues: params.newValues as Prisma.InputJsonValue | undefined,
      changedFields: params.changedFields ?? [],
      reason: params.reason ?? null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

// ─── PRODUCT AUDIT ──────────────────────────────────────────────────
export type ProductAuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATUS_CHANGE";

export async function logProductAudit(params: {
  productId: string;
  action: ProductAuditAction;
  actorId: string | null;
  actorName: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  reason?: string;
  tx?: TxClient;
}) {
  const client: DbClient = params.tx ?? db;
  await client.productAuditLog.create({
    data: {
      productId: params.productId,
      action: params.action,
      changedByUserId: params.actorId ?? null,
      changedByName: params.actorName,
      oldValues: params.oldValues as Prisma.InputJsonValue | undefined,
      newValues: params.newValues as Prisma.InputJsonValue | undefined,
      changedFields: params.changedFields ?? [],
      reason: params.reason ?? null,
    },
  });
}

// ─── UTILITY: detect changed fields ─────────────────────────────────
/**
 * Compare old vs new object, return list of changed field names.
 * Shallow comparison (===). Handles Date instances.
 */
export function detectChangedFields<T extends Record<string, unknown>>(
  oldData: T | null | undefined,
  newData: Partial<T>,
): string[] {
  if (!oldData) return Object.keys(newData);
  return Object.keys(newData).filter((key) => {
    const oldVal = oldData[key];
    const newVal = newData[key];
    if (oldVal instanceof Date && newVal instanceof Date) {
      return oldVal.getTime() !== newVal.getTime();
    }
    return oldVal !== newVal;
  });
}

// ─── UTILITY: extract actor info from session ───────────────────────
/**
 * Extract actor info from NextAuth session. Returns "System" when no
 * session (background jobs / system actions).
 */
export function getAuditActor(session: Session | null | undefined): {
  actorId: string | null;
  actorName: string;
} {
  if (!session?.user) {
    return { actorId: null, actorName: "System" };
  }
  return {
    actorId: session.user.id,
    actorName: session.user.name ?? session.user.email ?? "Unknown",
  };
}
