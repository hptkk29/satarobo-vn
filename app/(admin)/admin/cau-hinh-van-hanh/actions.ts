"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { setGlobalSetting, setCenterSetting, type SetResult } from "@/lib/settings/service";

function actorName(user: { id: string; name?: string | null; email?: string | null }): string {
  return user.name ?? user.email ?? user.id;
}

/** R6-A — Lưu cấu hình GLOBAL (chỉ SUPER_ADMIN). */
export async function saveGlobalSettingAction(input: {
  key: string;
  value: unknown;
  reason: string;
}): Promise<SetResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  const actor = await resolveActor(session.user.id);
  const res = await setGlobalSetting(actor, {
    key: input.key,
    value: input.value,
    reason: input.reason,
    actorName: actorName(session.user),
  });
  if (res.ok) revalidatePath("/admin/cau-hinh-van-hanh");
  return res;
}

/** R6-A — Lưu override theo cơ sở (CENTER_MANAGER cơ sở đó / SUPER_ADMIN). */
export async function saveCenterSettingAction(input: {
  orgUnitId: string;
  key: string;
  value: unknown;
  reason: string;
}): Promise<SetResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  const actor = await resolveActor(session.user.id);
  const res = await setCenterSetting(actor, {
    orgUnitId: input.orgUnitId,
    key: input.key,
    value: input.value,
    reason: input.reason,
    actorName: actorName(session.user),
  });
  if (res.ok) revalidatePath("/admin/cau-hinh-van-hanh");
  return res;
}
