"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import {
  approveStatement,
  reopenStatement,
  CommissionStmtError,
} from "@/lib/crm/commission-statement";

type Result = { ok: true } | { ok: false; error: string };

function actorFromSession(s: { id: string; name?: string | null; email?: string | null; role: string; roles?: string[] }) {
  return {
    id: s.id,
    name: s.name ?? s.email ?? "Unknown",
    isSuperAdmin: hasRole(s, "SUPER_ADMIN"),
  };
}

export async function approveStatementAction(period: string, reason: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "payments:manage")) return { ok: false, error: "Không có quyền" };
  try {
    await approveStatement(actorFromSession(session.user), period, reason);
    revalidatePath("/admin/crm/commission");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof CommissionStmtError ? e.message : "Lỗi duyệt" };
  }
}

export async function reopenStatementAction(period: string, reason: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    await reopenStatement(actorFromSession(session.user), period, reason);
    revalidatePath("/admin/crm/commission");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof CommissionStmtError ? e.message : "Lỗi mở lại" };
  }
}
