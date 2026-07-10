"use server";

// #13 — đặt vai trò đang dùng (chỉ ảnh hưởng GIAO DIỆN; xem lib/auth/active-role.ts).
// File 'use server' chỉ export hàm async (quy tắc dự án).
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { ACTIVE_ROLE_COOKIE, resolveActiveRole } from "@/lib/auth/active-role";

export async function setActiveRoleAction(role: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const jar = await cookies();

  // "" = bỏ chọn → quay lại xem gộp mọi vai trò.
  if (role === "") {
    jar.delete(ACTIVE_ROLE_COOKIE);
    revalidatePath("/", "layout");
    return { ok: true };
  }

  // Chỉ nhận vai trò user THỰC SỰ giữ — chặn tự set vai lạ qua devtools.
  const valid = resolveActiveRole(session.user, role);
  if (!valid) return { ok: false, error: "Bạn không giữ vai trò này" };

  jar.set(ACTIVE_ROLE_COOKIE, valid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
