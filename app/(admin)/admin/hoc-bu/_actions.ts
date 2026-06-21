"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
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

// Cách ly cơ sở (chống IDOR ghi): MakeupNeed ∈ SCOPED_MODELS, scope theo centerId
// (cơ sở nhà của HV). complete/cancel KHÔNG truyền actor xuống service → ép scope ở
// action: scopedDb.makeupNeed trả null nếu nhu cầu bù ngoài tầm nhìn cơ sở actor.
async function makeupNeedInScope(actor: Actor, makeupNeedId: string): Promise<boolean> {
  const need = await scopedDb(actor).makeupNeed.findUnique({ where: { id: makeupNeedId }, select: { id: true } });
  return !!need;
}

export async function getMakeupSuggestions(makeupNeedId: string): Promise<MakeupSuggestion[]> {
  const g = await gate();
  if (!g.ok) return [];
  const actor = await resolveActor(g.session.user.id);
  return suggestMakeupSessions(makeupNeedId, actor);
}

export async function scheduleMakeupAction(makeupNeedId: string, makeupSessionId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const actor = await resolveActor(g.session.user.id);
  const { actorName } = getAuditActor(g.session);
  const res = await scheduleMakeup({
    makeupNeedId,
    makeupSessionId,
    scheduledById: g.session.user.id,
    scheduledByName: actorName,
    actor,
  });
  if (res.ok) revalidatePath("/hoc-bu");
  return res;
}

export async function completeMakeupAction(makeupNeedId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  const actor = await resolveActor(g.session.user.id);
  if (!(await makeupNeedInScope(actor, makeupNeedId))) return { ok: false, error: "Không tìm thấy nhu cầu bù" };
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
  const actor = await resolveActor(g.session.user.id);
  if (!(await makeupNeedInScope(actor, makeupNeedId))) return { ok: false, error: "Không tìm thấy nhu cầu bù" };
  await cancelMakeup(makeupNeedId);
  revalidatePath("/hoc-bu");
  return { ok: true };
}
