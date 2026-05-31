"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

// B2 — xử lý cảnh báo rủi ro + care task. Gate students:view-all (quản lý/CSM).

type Result = { ok: boolean; error?: string };

async function gate() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập", uid: null };
  if (!can(session.user, "students:view-all")) return { ok: false as const, error: "Không có quyền", uid: null };
  return { ok: true as const, uid: session.user.id };
}

export async function resolveRiskAlert(id: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  await db.studentRiskAlert.update({
    where: { id },
    data: { status: "RESOLVED", resolvedById: g.uid, resolvedAt: new Date() },
  });
  revalidatePath("/canh-bao-rui-ro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function escalateRiskAlert(id: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  await db.studentRiskAlert.update({ where: { id }, data: { status: "ESCALATED", severity: "HIGH" } });
  revalidatePath("/canh-bao-rui-ro");
  return { ok: true };
}

export async function completeCareTask(id: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const task = await db.studentCareTask.update({
    where: { id },
    data: { status: "DONE", completedAt: new Date() },
    select: { riskAlertId: true },
  });
  // Hoàn tất task chăm sóc → đóng alert liên quan (nếu còn OPEN).
  if (task.riskAlertId) {
    await db.studentRiskAlert.updateMany({
      where: { id: task.riskAlertId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedById: g.uid, resolvedAt: new Date() },
    });
  }
  revalidatePath("/cham-soc-hv");
  revalidatePath("/canh-bao-rui-ro");
  revalidatePath("/dashboard");
  return { ok: true };
}
