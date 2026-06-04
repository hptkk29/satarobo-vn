"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { setMisaEnabled, getMisaConfig, syncToMisa } from "@/lib/misa/service";
import { setPaymentConfig } from "@/lib/payments/vietqr";
import { z } from "zod";

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

// Commit 4 — cấu hình tài khoản nhận tiền (VietQR). KHÔNG hardcode số tài khoản.
const vietqrSchema = z.object({
  bankBin: z.string().trim().regex(/^\d{6}$/, "Mã ngân hàng (BIN) gồm 6 chữ số"),
  accountNumber: z.string().trim().min(6, "Số tài khoản không hợp lệ").max(30),
  accountName: z.string().trim().min(2, "Tên chủ TK quá ngắn").max(120),
});

export async function setVietQrConfig(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "settings:edit")) return { ok: false, error: "Không có quyền" };

  const parsed = vietqrSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };

  await setPaymentConfig(parsed.data);
  revalidatePath("/admin/tich-hop");
  return { ok: true };
}
