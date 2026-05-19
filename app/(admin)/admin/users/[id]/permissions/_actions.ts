"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  grantCreateSchema,
  grantUpdateSchema,
} from "@/lib/validators/permission-grant";

async function requireUsersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

// ─── ADD GRANT ──────────────────────────────────────────────────────
export async function addGrantAction(userId: string, formData: FormData) {
  const me = await requireUsersManage();

  const parsed = grantCreateSchema.safeParse({
    action: formData.get("action"),
    grant: formData.get("grant"),
    reason: formData.get("reason") || null,
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!targetUser) return { ok: false as const, error: "Không tìm thấy user" };

  // SUPER_ADMIN bypass grants → tạo grants không có hiệu lực
  if (targetUser.role === "SUPER_ADMIN") {
    return {
      ok: false as const,
      error: "SUPER_ADMIN có toàn quyền — không cần override permissions",
    };
  }

  // Duplicate check (composite unique sẽ throw, nhưng UX tốt hơn nếu báo trước)
  const existing = await db.userPermissionGrant.findUnique({
    where: { userId_action: { userId, action: parsed.data.action } },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false as const,
      error: "Quyền này đã được override — xoá grant cũ hoặc chỉnh sửa thay vì thêm mới",
    };
  }

  await db.$transaction([
    db.userPermissionGrant.create({
      data: {
        userId,
        action: parsed.data.action,
        grant: parsed.data.grant,
        reason: parsed.data.reason ?? null,
        grantedBy: me.id,
      },
    }),
    db.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } }, // force re-login
    }),
  ]);

  revalidatePath(`/admin/users/${userId}/permissions`);
  revalidatePath(`/admin/users/${userId}/edit`);
  revalidatePath(`/admin/users`);
  return { ok: true as const };
}

// ─── UPDATE GRANT ───────────────────────────────────────────────────
export async function updateGrantAction(grantId: string, formData: FormData) {
  await requireUsersManage();

  const parsed = grantUpdateSchema.safeParse({
    grant: formData.get("grant"),
    reason: formData.get("reason") || null,
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const grant = await db.userPermissionGrant.findUnique({
    where: { id: grantId },
    select: { userId: true },
  });
  if (!grant) return { ok: false as const, error: "Không tìm thấy grant" };

  await db.$transaction([
    db.userPermissionGrant.update({
      where: { id: grantId },
      data: { grant: parsed.data.grant, reason: parsed.data.reason ?? null },
    }),
    db.user.update({
      where: { id: grant.userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);

  revalidatePath(`/admin/users/${grant.userId}/permissions`);
  revalidatePath(`/admin/users/${grant.userId}/edit`);
  return { ok: true as const };
}

// ─── REMOVE GRANT ───────────────────────────────────────────────────
export async function removeGrantAction(grantId: string) {
  await requireUsersManage();

  const grant = await db.userPermissionGrant.findUnique({
    where: { id: grantId },
    select: { userId: true },
  });
  if (!grant) return { ok: false as const, error: "Không tìm thấy grant" };

  await db.$transaction([
    db.userPermissionGrant.delete({ where: { id: grantId } }),
    db.user.update({
      where: { id: grant.userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);

  revalidatePath(`/admin/users/${grant.userId}/permissions`);
  revalidatePath(`/admin/users/${grant.userId}/edit`);
  revalidatePath(`/admin/users`);
  return { ok: true as const };
}
