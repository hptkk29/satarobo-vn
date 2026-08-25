"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import type { Prisma } from "@prisma/client";
import {
  grantCreateSchema,
  grantUpdateSchema,
} from "@/lib/validators/permission-grant";
import { logGrantAudit, getAuditActor } from "@/lib/audit/log";

/**
 * SEC-M13 + A-03-7 — nhóm khoá KHÔNG được cấp/sửa qua override TỪNG NGƯỜI.
 *
 * `roles:` + `users:manage` (SEC-M13): chống leo thang — có `roles:*` là tự gán được
 * SUPER_ADMIN cho mình.
 *
 * `leads:` (A-03-7, PRD A §6.3b): KHÔNG phải chuyện leo thang mà là **tắt cách ly cơ sở**.
 * `lib/db-scope.ts:246-252` thấy BẤT KỲ action nào trong `actor.grantsAllow` khớp prefix
 * của model là đặt `hasAll = true` → `getModelVisibleCenterIds` trả `"ALL"` → `injectScope`
 * trả args nguyên vẹn. Prefix của `Lead` là `["leads:"]` (`:133`) và `MessengerConversation`
 * dùng CHUNG prefix đó (`:136`) ⇒ một dòng override `leads:*` cho một người làm người đó
 * thấy lead + hội thoại Messenger của MỌI cơ sở. Vì vậy rào theo TIỀN TỐ, không theo khoá:
 * `leads:view-pii` nguy hiểm y như `leads:export`. (Ngoại lệ OI-4 cho `*:view-pii` vẫn còn
 * hiệu lực với các họ khoá khác — `payments:view-pii`, `orders:view-pii`.)
 *
 * Cần cấp quyền xuất lead cho một quản lý → dùng NHÓM (`/admin/user-groups`): grant nhóm đi
 * vào `actor.permissionGrants`, KHÔNG đổ vào `grantsAllow`, nên `scopedDb` vẫn cách ly.
 */
const KHOA_CAM_OVERRIDE_TIEN_TO = ["roles:", "leads:"] as const;
const KHOA_CAM_OVERRIDE = ["users:manage"] as const;

const LOI_CAM_OVERRIDE =
  "Không cấp quyền này qua override từng người. Quyền quản trị-quyền (vai trò / quản lý " +
  "user) chỉ đến từ vai trò; quyền lead (kể cả xuất file) cấp qua Nhóm quyền — override " +
  "từng người sẽ TẮT cách ly cơ sở của toàn bộ dữ liệu lead.";

/**
 * Trả về thông báo lỗi nếu khoá bị cấm override, `null` nếu hợp lệ.
 * ⚠️ KHÔNG xét `grant`: chặn cả `DENY`. Bản trước chỉ chặn `ALLOW`, để hở đường vòng
 * "tạo DENY (lọt) → `updateGrantAction` đổi sang ALLOW". Ghim bằng `_actions.test.ts`.
 */
function loiCamOverride(action: string): string | null {
  const cam =
    KHOA_CAM_OVERRIDE_TIEN_TO.some((p) => action.startsWith(p)) ||
    (KHOA_CAM_OVERRIDE as readonly string[]).includes(action);
  return cam ? LOI_CAM_OVERRIDE : null;
}

async function requireUsersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("users:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

// User/UserPermissionGrant không thuộc SCOPED_MODELS (identity/quyền toàn cục)
// → scopedDb pass-through, hành vi y nguyên; swap để sạch import @/lib/db (R6-F1).
async function scopedDbForSession(session: { user: { id: string } }) {
  return scopedDb(await resolveActor(session.user.id));
}

// ─── ADD GRANT ──────────────────────────────────────────────────────
export async function addGrantAction(userId: string, formData: FormData) {
  const session = await requireUsersManage();
  const sdb = await scopedDbForSession(session);
  const me = session.user;

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

  const targetUser = await sdb.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!targetUser) return { ok: false as const, error: "Không tìm thấy user" };

  // SUPER_ADMIN bypass grants → tạo grants không có hiệu lực
  if (isSuperAdmin(targetUser.role)) {
    return {
      ok: false as const,
      error: "SUPER_ADMIN có toàn quyền — không cần override permissions",
    };
  }

  // SEC-M13 + A-03-7 — xem `loiCamOverride` ở đầu file. Chặn CẢ `DENY`, không chỉ `ALLOW`.
  const camThem = loiCamOverride(parsed.data.action);
  if (camThem) return { ok: false as const, error: camThem };

  // Duplicate check (composite unique sẽ throw, nhưng UX tốt hơn nếu báo trước)
  const existing = await sdb.userPermissionGrant.findUnique({
    where: { userId_action: { userId, action: parsed.data.action } },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false as const,
      error: "Quyền này đã được override — xoá grant cũ hoặc chỉnh sửa thay vì thêm mới",
    };
  }

  const { actorId, actorName } = getAuditActor(session);

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    const newGrant = await tx.userPermissionGrant.create({
      data: {
        userId,
        action: parsed.data.action,
        grant: parsed.data.grant,
        reason: parsed.data.reason ?? null,
        grantedBy: me.id,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } }, // force re-login
    });

    await logGrantAudit({
      userId,
      grantId: newGrant.id,
      actionKey: parsed.data.action,
      action: "ADD",
      actorId,
      actorName,
      newGrant: parsed.data.grant,
      reason: parsed.data.reason ?? undefined,
      tx,
    });
  });

  revalidatePath(`/users/${userId}/permissions`);
  revalidatePath(`/users/${userId}/edit`);
  revalidatePath(`/users`);
  return { ok: true as const };
}

// ─── UPDATE GRANT ───────────────────────────────────────────────────
export async function updateGrantAction(grantId: string, formData: FormData) {
  const session = await requireUsersManage();
  const sdb = await scopedDbForSession(session);

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

  const currentGrant = await sdb.userPermissionGrant.findUnique({
    where: { id: grantId },
    select: { userId: true, action: true, grant: true },
  });
  if (!currentGrant)
    return { ok: false as const, error: "Không tìm thấy grant" };

  // A-03-7 — CÙNG rào như `addGrantAction`. Thiếu chỗ này là còn nguyên đường vòng: tạo
  // `DENY leads:export` rồi sửa thành `ALLOW`. Khoá lấy từ grant ĐANG có trong DB, không
  // từ form (form sửa chỉ mang `grant` + `reason`).
  const camSua = loiCamOverride(currentGrant.action);
  if (camSua) return { ok: false as const, error: camSua };

  const { actorId, actorName } = getAuditActor(session);

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    await tx.userPermissionGrant.update({
      where: { id: grantId },
      data: { grant: parsed.data.grant, reason: parsed.data.reason ?? null },
    });

    await tx.user.update({
      where: { id: currentGrant.userId },
      data: { tokenVersion: { increment: 1 } },
    });

    await logGrantAudit({
      userId: currentGrant.userId,
      grantId,
      actionKey: currentGrant.action,
      action: "UPDATE",
      actorId,
      actorName,
      oldGrant: currentGrant.grant,
      newGrant: parsed.data.grant,
      reason: parsed.data.reason ?? undefined,
      tx,
    });
  });

  revalidatePath(`/users/${currentGrant.userId}/permissions`);
  revalidatePath(`/users/${currentGrant.userId}/edit`);
  return { ok: true as const };
}

// ─── REMOVE GRANT ───────────────────────────────────────────────────
export async function removeGrantAction(grantId: string) {
  const session = await requireUsersManage();
  const sdb = await scopedDbForSession(session);

  const currentGrant = await sdb.userPermissionGrant.findUnique({
    where: { id: grantId },
    select: { userId: true, action: true, grant: true },
  });
  if (!currentGrant)
    return { ok: false as const, error: "Không tìm thấy grant" };

  const { actorId, actorName } = getAuditActor(session);

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    await tx.userPermissionGrant.delete({ where: { id: grantId } });

    await tx.user.update({
      where: { id: currentGrant.userId },
      data: { tokenVersion: { increment: 1 } },
    });

    await logGrantAudit({
      userId: currentGrant.userId,
      grantId: null,
      actionKey: currentGrant.action,
      action: "REMOVE",
      actorId,
      actorName,
      oldGrant: currentGrant.grant,
      tx,
    });
  });

  revalidatePath(`/users/${currentGrant.userId}/permissions`);
  revalidatePath(`/users/${currentGrant.userId}/edit`);
  revalidatePath(`/users`);
  return { ok: true as const };
}
