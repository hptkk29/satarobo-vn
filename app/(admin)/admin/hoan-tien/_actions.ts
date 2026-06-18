"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/permissions";
import { approveRefund, rejectRefund, RefundError } from "@/lib/finance/refund";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Kế toán/SUPER_ADMIN duyệt hoàn tiền (quyết định tiền → quyền payments:confirm). */
export async function approveRefundAction(
  id: string,
  approvedAmount?: number | null,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "payments:confirm")) {
    return { ok: false, error: "Không có quyền duyệt hoàn tiền" };
  }
  const uid = session.user.id;
  if (!uid) return { ok: false, error: "Thiếu thông tin người duyệt" };
  const actorName = session.user.name ?? session.user.email ?? "Quản lý";

  try {
    await approveRefund(id, uid, approvedAmount ?? null, actorName);
  } catch (err) {
    if (err instanceof RefundError) return { ok: false, error: err.message };
    return { ok: false, error: "Lỗi duyệt hoàn tiền" };
  }
  revalidatePath("/hoan-tien");
  return { ok: true };
}

/** Từ chối hoàn tiền (note bắt buộc ≥5 ký tự). */
export async function rejectRefundAction(
  id: string,
  note: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "payments:confirm")) {
    return { ok: false, error: "Không có quyền từ chối hoàn tiền" };
  }
  const uid = session.user.id;
  if (!uid) return { ok: false, error: "Thiếu thông tin người duyệt" };
  const actorName = session.user.name ?? session.user.email ?? "Quản lý";

  try {
    await rejectRefund(id, uid, note, actorName);
  } catch (err) {
    if (err instanceof RefundError) return { ok: false, error: err.message };
    return { ok: false, error: "Lỗi từ chối hoàn tiền" };
  }
  revalidatePath("/hoan-tien");
  return { ok: true };
}
