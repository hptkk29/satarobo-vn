"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { setMisaEnabled, getMisaConfig, syncToMisa } from "@/lib/misa/service";

// C6 — bật/tắt MISA + chạy thử sync. Gate settings:edit (SUPER_ADMIN).

export async function toggleMisa(): Promise<{ ok: boolean; error?: string; enabled?: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "settings:edit")) return { ok: false, error: "Không có quyền" };

  const cur = await getMisaConfig();
  await setMisaEnabled(!cur.isEnabled);
  revalidatePath("/admin/tich-hop");
  return { ok: true, enabled: !cur.isEnabled };
}

export async function testMisaSync(): Promise<{ ok: boolean; error?: string; status?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "settings:edit")) return { ok: false, error: "Không có quyền" };

  const res = await syncToMisa({ action: "TEST_PING", payload: { ping: true, at: "manual-test" } });
  revalidatePath("/admin/tich-hop");
  return { ok: true, status: res.status };
}
