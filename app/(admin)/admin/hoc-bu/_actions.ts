"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import {
  suggestMakeupSessions,
  scheduleMakeup,
  completeMakeup,
  cancelMakeup,
  type MakeupSuggestion,
} from "@/lib/makeup/service";

// B1 — server actions cho trang Học bù. Gate parent-requests:manage (tư vấn/CM).

type Result = { ok: boolean; error?: string };

async function gate() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập", session: null };
  if (!can(session.user, "parent-requests:manage")) {
    return { ok: false as const, error: "Không có quyền", session: null };
  }
  return { ok: true as const, session };
}

export async function getMakeupSuggestions(makeupNeedId: string): Promise<MakeupSuggestion[]> {
  const g = await gate();
  if (!g.ok) return [];
  return suggestMakeupSessions(makeupNeedId);
}

export async function scheduleMakeupAction(makeupNeedId: string, makeupSessionId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await scheduleMakeup({ makeupNeedId, makeupSessionId, scheduledById: g.session.user.id });
  if (res.ok) revalidatePath("/hoc-bu");
  return res;
}

export async function completeMakeupAction(makeupNeedId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const res = await completeMakeup(makeupNeedId);
  if (res.ok) {
    revalidatePath("/hoc-bu");
    revalidatePath("/attendance");
    revalidatePath("/portal/yeu-cau");
  }
  return res;
}

export async function cancelMakeupAction(makeupNeedId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  await cancelMakeup(makeupNeedId);
  revalidatePath("/hoc-bu");
  return { ok: true };
}
