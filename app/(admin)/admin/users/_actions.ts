"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import type {
  ClassStatus,
  EnrollmentStatus,
  LeadStatus,
  Prisma,
} from "@prisma/client";
import {
  userCreateSchema,
  userUpdateSchema,
  passwordResetSchema,
} from "@/lib/validators/user";
import { reassignOpenLeads } from "@/lib/lead/assign";
import { notifyStaffAccountGranted } from "@/lib/email/staff-account";
import { centerIdForOrgUnit } from "@/lib/org/org-service";
import { keoHoSoTheoTaiKhoan } from "@/lib/hr/sync-employee-unit";
import { reconcileUserOrgRoles, OrgRoleSyncError } from "@/lib/auth/org-role-sync";
import { syncCenterClassConversations } from "@/lib/chat/sync-membership";
import {
  logUserAudit,
  logRbacAudit,
  detectChangedFields,
  getAuditActor,
} from "@/lib/audit/log";

async function requireUsersManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("users:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

// User là SCOPE_EXEMPT (identity toàn cục) → scopedDb pass-through, hành vi y nguyên;
// swap để file sạch import @/lib/db trần (R6-F1).
async function scopedDbForSession(session: { user: { id: string } }) {
  return scopedDb(await resolveActor(session.user.id));
}

// ─── CREATE ──────────────────────────────────────────────────────────
export async function createUserAction(formData: FormData) {
  const session = await requireUsersManage();
  const sdb = await scopedDbForSession(session);

  const parsed = userCreateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || null,
    password: formData.get("password"),
    roles: formData.getAll("roles"),
    primaryRole: formData.get("primaryRole"),
    centerId: formData.get("centerId") || null,
    orgUnitId: formData.get("orgUnitId") || null,
    employeeId: formData.get("employeeId") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // Email unique
  const existing = await sdb.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Email đã được sử dụng" };
  }

  // SĐT unique (khoá đăng nhập — AUTH-SĐT P3).
  if (parsed.data.phone) {
    const phoneUsed = await sdb.user.findUnique({
      where: { phone: parsed.data.phone },
      select: { id: true },
    });
    if (phoneUsed) {
      return { ok: false, error: "Số điện thoại đã được sử dụng" };
    }
  }

  // Employee chưa link User khác
  if (parsed.data.employeeId) {
    const empUsed = await sdb.user.findFirst({
      where: { employeeId: parsed.data.employeeId },
      select: { id: true },
    });
    if (empUsed) {
      return { ok: false, error: "Nhân sự này đã có tài khoản đăng nhập" };
    }
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10);
  const { actorId, actorName } = getAuditActor(session);

  // PR-B dual-write: chốt theo OrgUnit, suy centerId từ orgUnitId (HO → null).
  const orgUnitId = parsed.data.orgUnitId ?? null;
  const centerId = await centerIdForOrgUnit(orgUnitId);

  const user = await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    const created = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        password: hashed,
        // Đợt 3B — role = vai trò chính (primary), roles = toàn bộ (union quyền).
        role: parsed.data.primaryRole,
        roles: parsed.data.roles,
        centerId,
        orgUnitId,
        employeeId: parsed.data.employeeId ?? null,
        isActive: true,
        tokenVersion: 0,
        // BGĐ 31/07 — MK do admin đặt → bắt đổi ngay lần đăng nhập đầu.
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        roles: true,
        centerId: true,
        employeeId: true,
        isActive: true,
      },
    });

    await logUserAudit({
      userId: created.id,
      action: "CREATE",
      actorId,
      actorName,
      newValues: {
        email: created.email,
        phone: created.phone,
        role: created.role,
        roles: created.roles,
        centerId: created.centerId,
        employeeId: created.employeeId,
        isActive: created.isActive,
      },
      tx,
    });

    // RBAC v2: sinh luôn UserOrgRole theo roles[] + đơn vị đã chọn. Trước 07/08/2026
    // bước này KHÔNG có → tài khoản mới rỗng quyền trên prod (GV vào được site GV
    // nhưng bấm Lưu điểm danh ra "Không có quyền điểm danh lớp này"). Thiếu đơn vị /
    // RoleDef → ném lỗi, rollback cả cụm: thà không tạo còn hơn tạo tài khoản què quyền.
    await reconcileUserOrgRoles({
      tx,
      userId: created.id,
      previous: { roles: [], orgUnitId: null },
      next: { roles: parsed.data.roles, orgUnitId },
      actorId,
      actorName,
      reason: "Tự động gán theo vai trò khi tạo tài khoản",
    });

    // US-03 chat — tài khoản mới là QLCS → vào nhóm mọi lớp ACTIVE của cơ sở, cùng tx.
    if (parsed.data.roles.includes("CENTER_MANAGER")) {
      await syncCenterClassConversations(tx, centerId);
    }

    // Tạo tài khoản CHO một hồ sơ có sẵn: đơn vị chọn ở đây là đơn vị của người đó ⇒
    // hồ sơ phải theo ngay, đừng để hai bảng lệch từ lúc sinh ra.
    await keoHoSoTheoTaiKhoan(tx, {
      employeeId: created.employeeId,
      donVi: { centerId, orgUnitId },
      actor: { id: actorId, name: actorName },
    });

    return created;
    // timeout 30s: syncCenterClassConversations chạm mọi lớp ACTIVE của cơ sở
  }, { timeout: 30_000, maxWait: 10_000 }).catch((err: unknown) => {
    // Lỗi RBAC hiện nguyên văn cho admin; lỗi khác giữ nguyên hành vi cũ (ném lên).
    if (err instanceof OrgRoleSyncError) return { syncError: err.message };
    throw err;
  });
  if ("syncError" in user) return { ok: false, error: user.syncError };

  // BGĐ 31/07 — gửi thông tin đăng nhập (email kèm MK — log mask; ZNS không MK).
  // Fire-and-forget: lỗi gửi không chặn việc tạo tài khoản.
  notifyStaffAccountGranted({
    email: user.email,
    phone: user.phone,
    name: user.name,
    roles: user.roles.length > 0 ? user.roles : [user.role],
    password: parsed.data.password,
  }).catch(() => {});

  revalidatePath("/users");
  return { ok: true as const, id: user.id };
}

// ─── UPDATE ──────────────────────────────────────────────────────────
export async function updateUserAction(id: string, formData: FormData) {
  const session = await requireUsersManage();
  const sdb = await scopedDbForSession(session);
  const me = session.user;

  const parsed = userUpdateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    roles: formData.getAll("roles"),
    primaryRole: formData.get("primaryRole"),
    centerId: formData.get("centerId") || null,
    orgUnitId: formData.get("orgUnitId") || null,
    employeeId: formData.get("employeeId") || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const current = await sdb.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      roles: true,
      centerId: true,
      // Đơn vị TRƯỚC — mốc để suy vai v2 cần thu hồi khi đổi vai trò/đổi đơn vị.
      orgUnitId: true,
      employeeId: true,
    },
  });
  if (!current) return { ok: false, error: "Không tìm thấy user" };

  // Đợt 3B — vai trò hữu hiệu hiện tại (roles[] ưu tiên, fallback role chính).
  const currentRoles =
    current.roles.length > 0 ? current.roles : [current.role];
  const nextRoles = parsed.data.roles;
  const sameRoleSet =
    currentRoles.length === nextRoles.length &&
    currentRoles.every((r) => nextRoles.includes(r));
  const rolesChanged = !sameRoleSet || parsed.data.primaryRole !== current.role;

  // Self-protection: không cho tự đổi vai trò của chính mình (chống tự khoá).
  if (id === me.id && rolesChanged) {
    return { ok: false, error: "Không thể tự đổi vai trò của chính mình" };
  }

  // Last SUPER_ADMIN protection — xét theo union roles, không chỉ role chính.
  const wasSuperAdmin = currentRoles.includes("SUPER_ADMIN");
  const willBeSuperAdmin = nextRoles.includes("SUPER_ADMIN");
  if (wasSuperAdmin && !willBeSuperAdmin) {
    const remaining = await sdb.user.count({
      where: {
        roles: { has: "SUPER_ADMIN" },
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (remaining === 0) {
      return {
        ok: false,
        error: "Không thể demote SUPER_ADMIN duy nhất của hệ thống",
      };
    }
  }

  // Email unique nếu thay đổi
  if (parsed.data.email !== current.email) {
    const existing = await sdb.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (existing && existing.id !== id) {
      return { ok: false, error: "Email đã được sử dụng" };
    }
  }

  // Employee link nếu thay đổi
  if (parsed.data.employeeId && parsed.data.employeeId !== current.employeeId) {
    const empUsed = await sdb.user.findFirst({
      where: { employeeId: parsed.data.employeeId, id: { not: id } },
      select: { id: true },
    });
    if (empUsed) {
      return { ok: false, error: "Nhân sự này đã có tài khoản đăng nhập khác" };
    }
  }

  // Increment tokenVersion nếu vai trò thay đổi → force re-login (token mang roles).
  const { actorId, actorName } = getAuditActor(session);

  // PR-B dual-write: chốt theo OrgUnit, suy centerId từ orgUnitId (HO → null).
  const orgUnitId = parsed.data.orgUnitId ?? null;
  const centerId = await centerIdForOrgUnit(orgUnitId);

  const synced = await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    const updated = await tx.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        // Đợt 3B — role chính + roles (union quyền).
        role: parsed.data.primaryRole,
        roles: parsed.data.roles,
        centerId,
        orgUnitId,
        employeeId: parsed.data.employeeId ?? null,
        ...(rolesChanged && { tokenVersion: { increment: 1 } }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roles: true,
        centerId: true,
        employeeId: true,
      },
    });

    const oldValues = {
      name: current.name,
      email: current.email,
      role: current.role,
      roles: current.roles,
      centerId: current.centerId,
      employeeId: current.employeeId,
    };
    const newValues = {
      name: updated.name,
      email: updated.email,
      role: updated.role,
      roles: updated.roles,
      centerId: updated.centerId,
      employeeId: updated.employeeId,
    };

    await logUserAudit({
      userId: id,
      action: rolesChanged ? "ROLE_CHANGE" : "UPDATE",
      actorId,
      actorName,
      oldValues,
      newValues,
      changedFields: detectChangedFields(oldValues, newValues),
      tx,
    });

    // ĐƠN VỊ NẰM Ở HAI BẢNG — sửa tài khoản thì kéo hồ sơ nhân sự theo, cùng transaction
    // (xem lib/hr/sync-employee-unit.ts). Tài khoản không gắn hồ sơ (phụ huynh) → no-op.
    await keoHoSoTheoTaiKhoan(tx, {
      employeeId: updated.employeeId,
      donVi: { centerId, orgUnitId },
      actor: { id: actorId, name: actorName },
    });

    // RBAC v2 đi kèm: gán vai còn thiếu (chữa cả tài khoản tạo trước 07/08/2026) và
    // thu hồi vai suy từ bộ vai trò/đơn vị CŨ mà bộ MỚI không còn. Vai gán tay ở
    // /admin/users/[id]/org-roles nằm ngoài bảng ánh xạ → không bị đụng.
    await reconcileUserOrgRoles({
      tx,
      userId: id,
      previous: { roles: currentRoles, orgUnitId: current.orgUnitId },
      next: { roles: parsed.data.roles, orgUnitId },
      actorId,
      actorName,
      reason: "Tự động đồng bộ khi sửa vai trò/đơn vị tài khoản",
    });

    // US-03 chat — đổi QLCS (thêm/bỏ vai CENTER_MANAGER hoặc đổi cơ sở) → đồng bộ
    // nhóm lớp của cơ sở CŨ lẫn MỚI trong cùng transaction (F-SYNC "đổi QLCS").
    const touchesCenterManager =
      currentRoles.includes("CENTER_MANAGER") ||
      parsed.data.roles.includes("CENTER_MANAGER");
    if (touchesCenterManager) {
      await syncCenterClassConversations(tx, current.centerId);
      if (centerId !== current.centerId) {
        await syncCenterClassConversations(tx, centerId);
      }
    }
  }, { timeout: 30_000, maxWait: 10_000 }).catch((err: unknown) => {
    if (err instanceof OrgRoleSyncError) return { syncError: err.message };
    throw err;
  });
  if (synced && "syncError" in synced) {
    return { ok: false, error: synced.syncError };
  }

  revalidatePath("/users");
  revalidatePath(`/users/${id}/edit`);
  return { ok: true as const };
}

// ─── TOGGLE ACTIVE ───────────────────────────────────────────────────
export async function toggleUserActiveAction(id: string) {
  const session = await requireUsersManage();
  const sdb = await scopedDbForSession(session);
  const me = session.user;

  if (id === me.id) {
    return { ok: false, error: "Không thể tự disable chính mình" };
  }

  const user = await sdb.user.findUnique({
    where: { id },
    select: { isActive: true, role: true, roles: true, centerId: true },
  });
  if (!user) return { ok: false, error: "Không tìm thấy user" };
  // Đa vai trò: nhận diện SALES_CSM theo cả role chính lẫn roles[].
  const wasSalesCsm = hasRole(user, "SALES_CSM");

  // Last SUPER_ADMIN check (chỉ áp dụng khi đang active + đi disable)
  if (hasRole(user, "SUPER_ADMIN") && user.isActive) {
    const remaining = await sdb.user.count({
      where: {
        roles: { has: "SUPER_ADMIN" },
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (remaining === 0) {
      return { ok: false, error: "Không thể disable SUPER_ADMIN duy nhất" };
    }
  }

  const willBeActive = !user.isActive;
  const { actorId, actorName } = getAuditActor(session);

  // ⚠️ CỐ Ý KHÔNG hết-hạn-hoá `UserOrgRole` ở đây — đừng "sửa cho nhất quán" với
  // `deleteUserAction` bên dưới. Vô hiệu hoá là TẠM THỜI, xoá mới là vĩnh viễn:
  //   • Đường BẬT LẠI là chính hàm này và nó KHÔNG có bước phục hồi vai nào (không gọi
  //     `reconcileUserOrgRoles`). Hết hạn ở nhánh DISABLE ⇒ bật lại xong người đó rỗng
  //     quyền — tái diễn y hệt sự cố 07/08/2026 (xem lib/auth/org-role-sync.ts:3-6).
  //   • Không có gì để đánh đổi về an ninh: `lib/auth.ts:157` chặn đăng nhập khi
  //     `!isActive`, nên vai của tài khoản đã vô hiệu hoá không bao giờ thành quyền thật.
  //   • Người bị vô hiệu hoá vẫn là người "đang tồn tại": /admin/ban-giao-lead giữ họ
  //     trong ô chọn và chỉ dán nhãn "(đã nghỉ)" — đếm họ theo vai là hành vi MONG MUỐN.
  // Khoá bằng test `_actions.test.ts` mục (d).
  //
  // P0-c: bọc try/catch — lỗi DB trả message rõ, không ném stack trace cho client.
  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      await tx.user.update({
        where: { id },
        data: {
          isActive: willBeActive,
          tokenVersion: { increment: 1 }, // force logout
        },
      });

      await logUserAudit({
        userId: id,
        action: willBeActive ? "ENABLE" : "DISABLE",
        actorId,
        actorName,
        oldValues: { isActive: user.isActive },
        newValues: { isActive: willBeActive },
        changedFields: ["isActive"],
        tx,
      });

      // US-03 chat — bật/tắt tài khoản QLCS đổi tập QLCS hiệu lực của cơ sở (nguồn v1
      // lọc isActive) → đồng bộ nhóm lớp của cơ sở trong cùng transaction.
      if (hasRole(user, "CENTER_MANAGER")) {
        await syncCenterClassConversations(tx, user.centerId);
      }
    }, { timeout: 30_000, maxWait: 10_000 });
  } catch (err) {
    console.error("[toggleUserActive] error:", err);
    return { ok: false, error: "Không cập nhật được trạng thái tài khoản — thử lại" };
  }

  // Phase T1.3 — sale SALES_CSM bị disable → chia lại lead OPEN cho người còn lại.
  // Gọi SAU tx (isActive đã false), best-effort: lỗi chia lead KHÔNG làm hỏng disable.
  if (!willBeActive && wasSalesCsm) {
    await reassignOpenLeads(id, { actorId, actorName }).catch((err) =>
      console.error("[toggleUserActive] reassign leads error:", err),
    );
    revalidatePath("/leads");
  }

  revalidatePath("/users");
  return { ok: true as const };
}

// ─── DELETE (soft) ───────────────────────────────────────────────────
// Soft-delete tài khoản ĐÃ vô hiệu hóa. KHÔNG hard delete (User có nhiều quan hệ:
// leads, lớp dạy, audit logs, con cái).

/** Lead đã kết thúc = rác, không phải việc đang sống → không chặn xoá vì mấy dòng này. */
const LEAD_DA_KET_THUC: LeadStatus[] = ["LOST", "DUPLICATE"];

/**
 * Lớp CHƯA kết thúc — GV/trợ giảng bị xoá ở mấy trạng thái này là bỏ rơi lớp thật.
 * COMPLETED/CANCELLED là vết lịch sử, chặn theo chúng thì không xoá được ai bao giờ.
 */
const LOP_CHUA_KET_THUC: ClassStatus[] = [
  "PLANNED",
  "RECRUITING",
  "PENDING_APPROVAL",
  "ACTIVE",
];

/**
 * Ghi danh CHƯA kết thúc — cùng lý lẽ với {@link LOP_CHUA_KET_THUC}, nhưng ràng buộc ở đây
 * chặt hơn một bậc: danh sách này phải TRÙNG tập trạng thái mà màn
 * `/admin/classes/<id>/students` nạp (`page.tsx:59-63` = `CAPACITY_COUNT_STATUSES` + PAUSED),
 * vì `setEnrollmentSaleAction` ở màn đó (`.../students/_actions.ts:117-155`) là đường DUY
 * NHẤT gỡ được `Enrollment.saleId` bằng giao diện.
 *
 * Bản trước đếm KHÔNG điều kiện ⇒ chặn bằng thứ không màn nào gỡ được:
 *   • chuyển lớp đặt ghi danh cũ = `TRANSFERRED` và GIỮ NGUYÊN `saleId`
 *     (`lib/transfer/service.ts:187-191`, `app/(admin)/admin/enrollments/_actions.ts:1032-1040`);
 *   • 4 trạng thái kết thúc (TRANSFERRED/COMPLETED/CANCELLED/WITHDREW) không nằm trong danh
 *     sách của màn HS lớp ⇒ không có ô chọn sale để gỡ;
 *   • `/admin/ban-giao-lead` cũng không chạm tới (nó lọc `leadChild.leadId ∈` lead CÒN gán
 *     cho chính người đó — `lib/lead-handover/service.ts:182,356-360`).
 * ⇒ tài khoản kẹt vĩnh viễn, đúng thứ rào này sinh ra để tránh.
 */
const GHI_DANH_CHUA_KET_THUC: EnrollmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "STUDYING",
  "ACTIVE",
  "PAUSED",
];

/** Số tên lớp nêu trong câu chặn — đủ để đi tìm, không dài thành một đoạn văn. */
const SO_LOP_NEU_TEN = 4;

/** Một loại việc còn sống đang gắn với tài khoản + nơi người dùng đi gỡ nó. */
type RangBuocConSong = { moTa: string; huongDan: string };

/**
 * Câu chặn phải TỰ NÓI ĐỦ: nó hiện trong một cái toast, không có chỗ bấm tiếp. Người đọc
 * cần biết còn bao nhiêu, thuộc loại gì, và đi đâu để gỡ — nếu không họ sẽ đi tìm nút
 * "xóa mạnh hơn" thay vì đi bàn giao.
 */
function loiConRangBuoc(
  items: RangBuocConSong[],
  hienTrongManBanGiao: boolean,
): string {
  const huongDan = [...new Set(items.map((i) => i.huongDan))];
  // Câu đuôi CHỈ đúng với tài khoản màn bàn giao thật sự hiện: nó lọc
  // `roles: { has: "SALES_CSM" }` + `deletedAt: null` (ban-giao-lead/page.tsx:48-52). Với
  // người vốn đã không hiện ở đó thì xoá chẳng mất thêm đường nào — nói vậy là dạy người
  // vận hành một điều sai về hệ thống ngay trong câu đang bảo họ làm đúng.
  const duoi = hienTrongManBanGiao
    ? " Xóa trước thì màn Bàn giao lead không còn hiện tài khoản này nữa — mất luôn đường bàn giao."
    : "";
  return (
    `Tài khoản này còn ${items.map((i) => i.moTa).join(", ")} đang phụ trách. ` +
    `Cần làm trước khi xóa: ${huongDan.join("; ")}.${duoi}`
  );
}

/**
 * Tên các lớp đang giữ `Enrollment.saleId` của tài khoản — nguyên liệu cho câu chặn.
 *
 * Cố ý KHÔNG dùng `distinct: ["classId"]`: gộp trùng của Prisma không phải lúc nào cũng
 * chạy trong SQL, nên `take` nhỏ + `distinct` có thể trả về 1 lớp trong khi thực tế có
 * nhiều. Lấy một lô có TRẦN rồi gộp bằng JS cho kết quả ổn định.
 *
 * Thà thừa dấu "…" còn hơn khẳng định nhầm là đã liệt kê hết: người vận hành đi theo danh
 * sách này, tin nó đủ mà thiếu thì họ sẽ quay lại bấm Xóa và ăn đúng câu chặn cũ.
 */
async function tenLopCuaGhiDanh(
  cdb: ReturnType<typeof scopedDb>,
  where: Prisma.EnrollmentWhereInput,
): Promise<string[]> {
  const TRAN = 50;
  const rows = await cdb.enrollment.findMany({
    where,
    select: { classId: true, class: { select: { name: true } } },
    orderBy: { classId: "asc" },
    take: TRAN,
  });
  const theoLop = new Map<string, string>();
  for (const r of rows) theoLop.set(r.classId, r.class.name);
  const ten = [...theoLop.values()];
  const hienThi = ten.slice(0, SO_LOP_NEU_TEN);
  if (ten.length > SO_LOP_NEU_TEN || rows.length === TRAN) hienThi.push("…");
  return hienThi;
}

export async function deleteUserAction(id: string) {
  const session = await requireUsersManage();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const me = session.user;

  if (id === me.id) {
    return { ok: false, error: "Không thể tự xóa chính mình" };
  }

  const user = await sdb.user.findUnique({
    where: { id },
    select: { isActive: true, email: true, role: true, roles: true },
  });
  if (!user) return { ok: false, error: "Không tìm thấy user" };

  if (user.isActive) {
    return { ok: false, error: "Chỉ xóa tài khoản đã vô hiệu hóa" };
  }

  // Last SUPER_ADMIN guard (mirror page.tsx / toggle).
  //
  // ⚠️ Điều kiện ở đây TỪNG mang thêm `&& user.isActive` — mà nhánh `user.isActive` ngay
  // trên đã `return` ⇒ khối này là MÃ CHẾT, chưa từng chạy lần nào. Đã bỏ vế đó: xoá
  // SUPER_ADMIN cuối cùng là khoá cứng hệ thống kể cả khi tài khoản đó đang bị vô hiệu
  // hoá, vì xoá xong không còn ai bật lại được. `remaining` đếm người còn ACTIVE, nên
  // tài khoản disable vẫn xoá được bình thường miễn còn một SUPER_ADMIN đang hoạt động.
  if (user.role === "SUPER_ADMIN" || user.roles.includes("SUPER_ADMIN")) {
    const remaining = await sdb.user.count({
      where: {
        roles: { has: "SUPER_ADMIN" },
        isActive: true,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (remaining === 0) {
      return { ok: false, error: "Không thể xóa SUPER_ADMIN duy nhất" };
    }
  }

  // ─ RÀO RÀNG BUỘC: xoá trước khi bàn giao là TỰ KHOÁ MẤT ĐƯỜNG ─────────────────
  //
  // /admin/ban-giao-lead lọc danh sách "từ sale" bằng `deletedAt: null` (page.tsx:51) ⇒
  // người ĐÃ XOÁ không còn hiện trong ô chọn. Lead và ghi danh của họ khi đó không còn
  // đường bàn giao nào qua giao diện — phải đụng SQL tay. Đã suýt xảy ra thật một lần
  // (tài khoản bị xoá thay vì vô hiệu hoá trước khi bàn giao); lần đó may mắn cả lead
  // lẫn ghi danh đều = 0. Nên rào đứng ở ĐÂY, trước mọi lệnh ghi.
  //
  // ⚠️ Đếm bằng client BYPASS scope, KHÔNG bằng `sdb`: Lead/Enrollment/Class/Student đều
  // ∈ SCOPED_MODELS (lib/db-scope.ts:11-50) ⇒ người xoá đứng ở cơ sở A mà đếm bằng `sdb`
  // sẽ KHÔNG thấy lead của cơ sở B, guard cho qua, mồ côi vẫn còn nguyên. Bypass ở đây
  // an toàn vì đây là truy vấn ĐẾM thuần: không dòng dữ liệu nào của cơ sở khác chảy ra,
  // chỉ một con số dùng để CHẶN (không phải để xem).
  const cdb = scopedDb(actor, { bypass: true });

  // Tài khoản này có hiện trong ô "Từ sale" của /admin/ban-giao-lead không?
  //
  // ⚠️ KHÔNG phải kiểm tra quyền (luật cứng #1) — quyền của người BẤM đã do
  // `requireUsersManage()` ở đầu hàm quyết. Đây là câu hỏi về GIAO DIỆN của một màn khác:
  // tài khoản MỤC TIÊU có nằm trong danh sách màn đó dựng ra không. Nó chỉ chọn câu chữ
  // cho thông báo, không mở/đóng bất cứ đường nào.
  //
  // Màn đó dựng danh sách bằng ĐÚNG `roles: { has: "SALES_CSM" }` + `deletedAt: null`
  // (ban-giao-lead/page.tsx:48-56) — KHÔNG có ô nhập id tay. Cố ý KHÔNG dùng `hasRole()`
  // ở đây: helper đó còn xét `role` chính, nên nó sẽ trả `true` cho tài khoản cũ chưa
  // backfill `roles[]` — đúng nhóm mà màn bàn giao KHÔNG hiện. Câu chặn phải nói theo
  // những gì màn kia thật sự làm, không theo thứ "đáng lẽ".
  //
  // Vai gỡ được tự do: `updateUserAction` ghi thẳng `roles` mà không đụng lead nào, và
  // `reassignOpenLeads` chỉ chạy ở nhánh disable KHI còn `SALES_CSM`. Đường import "đã
  // đăng ký" còn gán `Lead.assignedToId` cho tài khoản KHÔNG phải sale (khớp theo TÊN —
  // `lib/lead/import-registered.ts:610-634`, vd một CENTER_MANAGER). Chỉ họ về màn bàn
  // giao là chỉ vào chỗ không mở được ⇒ chặn xoá vĩnh viễn bằng một chỉ dẫn bất khả thi.
  const hienTrongManBanGiao = user.roles.includes("SALES_CSM");

  /** ĐÚNG một định nghĩa "ghi danh còn sống của người này" — đếm và liệt kê phải trùng nhau. */
  const whereGhiDanhConSong: Prisma.EnrollmentWhereInput = {
    saleId: id,
    deletedAt: null,
    status: { in: GHI_DANH_CHUA_KET_THUC },
  };

  let rangBuoc: RangBuocConSong[];
  try {
    const [soLead, soGhiDanh, soLop, soCon] = await Promise.all([
      // Lead ∉ SOFT_DELETE_MODELS (lib/soft-delete.ts:12-17) → phải TỰ lọc `deletedAt`.
      // Và KHÔNG dùng lại bộ lọc của `reassignOpenLeads`: nó loại cả ENROLLED
      // (TERMINAL_LEAD_STATUSES, lib/lead/assign.ts:10-14), mà ENROLLED chính là nhóm
      // mang `Enrollment.saleId` + kênh chat Sale↔PH — nhóm cần bàn giao nhất.
      cdb.lead.count({
        where: {
          assignedToId: id,
          deletedAt: null,
          status: { notIn: LEAD_DA_KET_THUC },
        },
      }),
      cdb.enrollment.count({ where: whereGhiDanhConSong }),
      cdb.class.count({
        where: {
          deletedAt: null,
          status: { in: LOP_CHUA_KET_THUC },
          OR: [{ teacherId: id }, { assistantId: id }],
        },
      }),
      cdb.student.count({ where: { parentUserId: id, deletedAt: null } }),
    ]);

    // KHÔNG màn nào trong repo liệt kê "ghi danh do sale X phụ trách" (grep `saleId` toàn
    // `app/` chỉ ra màn HS của lớp + nút "Nhắn riêng" ở /admin/enrollments) ⇒ người vận
    // hành biết CÓ N ghi danh nhưng không biết chúng nằm ở lớp nào để mà mở. Nêu thẳng
    // tên lớp trong câu chặn — đó là thứ duy nhất biến con số thành việc làm được.
    // Chỉ chạy ở nhánh ĐÃ bị chặn, và `where` phải là chính bộ đã đếm.
    const tenLop = soGhiDanh > 0 ? await tenLopCuaGhiDanh(cdb, whereGhiDanhConSong) : [];

    rangBuoc = [
      soLead > 0 && {
        moTa: `${soLead} khách hàng (lead)`,
        huongDan: hienTrongManBanGiao
          ? "vào /admin/ban-giao-lead bàn giao cho người khác"
          : `mở /admin/leads?assignedToId=${id} rồi đổi người phụ trách ở từng lead — ` +
            "tài khoản này KHÔNG mang vai SALES_CSM nên không hiện trong ô chọn của /admin/ban-giao-lead",
      },
      soGhiDanh > 0 && {
        moTa: `${soGhiDanh} ghi danh`,
        huongDan:
          'vào /admin/classes mở màn Học sinh của lớp rồi gỡ ô "Sale phụ trách"' +
          (tenLop.length > 0 ? ` (lớp: ${tenLop.join(", ")})` : "") +
          (hienTrongManBanGiao
            ? " — /admin/ban-giao-lead chỉ chuyển được ghi danh còn truy về lead đang gán cho chính người này"
            : ""),
      },
      soLop > 0 && {
        moTa: `${soLop} lớp đang dạy hoặc trợ giảng`,
        huongDan: "vào /admin/classes đổi giáo viên/trợ giảng của lớp",
      },
      soCon > 0 && {
        moTa: `${soCon} học viên đang gắn làm con`,
        huongDan: "vào /admin/students gỡ liên kết con khỏi phụ huynh",
      },
    ].filter((x): x is RangBuocConSong => x !== false);
  } catch (err) {
    // Fail-closed: không đếm được thì KHÔNG xoá. Đếm hỏng mà vẫn cho xoá là đúng cái
    // kịch bản rào này sinh ra để chặn.
    console.error("[deleteUser] không đếm được ràng buộc:", err);
    return {
      ok: false,
      error: "Không kiểm tra được ràng buộc của tài khoản — thử lại",
    };
  }
  if (rangBuoc.length > 0) {
    return { ok: false, error: loiConRangBuoc(rangBuoc, hienTrongManBanGiao) };
  }

  const { actorId, actorName } = getAuditActor(session);
  // Một mốc thời gian duy nhất cho cả cụm (khuôn của org-role-sync.ts:123).
  const now = new Date();

  try {
    await sdb.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: now,
          isActive: false,
          tokenVersion: { increment: 1 }, // force logout
        },
      });

      await logUserAudit({
        userId: id,
        action: "DISABLE",
        actorId,
        actorName,
        reason: "Xóa tài khoản (soft delete — dọn dữ liệu test)",
        oldValues: { deletedAt: null, isActive: user.isActive },
        newValues: { deletedAt: now.toISOString(), isActive: false },
        changedFields: ["deletedAt", "isActive"],
        tx,
      });

      // THU HỒI VAI — phải nằm TRONG CÙNG transaction với việc đặt `deletedAt`.
      //
      // Trước bản vá, xoá tài khoản không đụng `UserOrgRole` ⇒ prod tích 10 dòng
      // `status=ACTIVE` thuộc về tài khoản đã xoá, kéo dài từ 08/07/2026, trong đó có
      // một SUPER_ADMIN tại HO. KHÔNG phải lỗ đăng nhập (`lib/auth.ts:157` chặn cả
      // `deletedAt` lẫn `!isActive`), nhưng là rác thật: `UserOrgRole` KHÔNG có quan hệ
      // Prisma về `User` (schema.prisma:525-567 chỉ có cột `userId String`), nên KHÔNG
      // chỗ nào viết được `where: { user: { deletedAt: null } }` — mọi nơi đếm/liệt kê
      // nhân sự theo `UserOrgRole` đều tính nhầm người đã nghỉ. Ví dụ đang chạy:
      // `lib/crm/marketing-alerts.ts:9-19` gửi cảnh báo marketing hằng ngày cho cả
      // SUPER_ADMIN đã bị xoá.
      //
      // EXPIRED + `effectiveTo`, KHÔNG xoá cứng — giữ vết để còn truy được ai từng giữ
      // vai gì (đúng khuôn org-role-sync.ts:307-315, và đúng truy vấn đã chạy tay dọn
      // 10 dòng cũ trên prod 26/08/2026).
      //
      // ⚠️ KHÔNG lọc theo cột `source`, khác có chủ đích với nhánh thu hồi của
      // `reconcileUserOrgRoles` (bất biến SL-01 chừa dòng `source="MANUAL"` cho người).
      // Ở đó máy SUY LUẬN vai nào nên mất nên phải nhường quyết định cho người; ở đây
      // người đã bị xoá khỏi hệ thống nên không còn ai để nhường — chừa dòng gán tay lại
      // ACTIVE chính là để nguyên đúng loại rác bản vá này sinh ra để dọn.
      const { count } = await tx.userOrgRole.updateMany({
        where: { userId: id, status: "ACTIVE" },
        data: { status: "EXPIRED", effectiveTo: now },
      });
      // Không ghi audit REVOKE cho việc đã không xảy ra.
      if (count > 0) {
        await logRbacAudit({
          entity: "ASSIGNMENT",
          entityId: `${id}:*`,
          action: "REVOKE",
          actorId,
          actorName,
          reason: "Xóa tài khoản — thu hồi toàn bộ vai RBAC còn hiệu lực",
          oldValues: { status: "ACTIVE" },
          newValues: {
            userId: id,
            status: "EXPIRED",
            effectiveTo: now,
            count,
            auto: true,
          },
          tx,
        });
      }
    });
  } catch (err) {
    console.error("[deleteUser] error:", err);
    return { ok: false, error: "Không xóa được tài khoản — thử lại" };
  }

  revalidatePath("/users");
  return { ok: true as const };
}

// ─── RESET PASSWORD ──────────────────────────────────────────────────
export async function resetUserPasswordAction(id: string, formData: FormData) {
  const session = await requireUsersManage();
  const sdb = await scopedDbForSession(session);

  const parsed = passwordResetSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Mật khẩu không hợp lệ",
    };
  }

  const user = await sdb.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true, role: true, roles: true },
  });
  if (!user) return { ok: false, error: "Không tìm thấy user" };

  const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
  const { actorId, actorName } = getAuditActor(session);

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    await tx.user.update({
      where: { id },
      data: {
        password: hashed,
        tokenVersion: { increment: 1 }, // force logout
        // BGĐ 31/07 — MK do admin đặt lại → bắt đổi ngay lần đăng nhập kế tiếp.
        mustChangePassword: true,
      },
    });

    await logUserAudit({
      userId: id,
      action: "PASSWORD_RESET",
      actorId,
      actorName,
      // KHÔNG log oldValues/newValues — không leak hash
      tx,
    });
  });

  // BGĐ 31/07 — báo user mật khẩu mới (email kèm MK — log mask; ZNS không MK).
  notifyStaffAccountGranted({
    email: user.email,
    phone: user.phone,
    name: user.name,
    roles: user.roles.length > 0 ? user.roles : [user.role],
    password: parsed.data.newPassword,
  }).catch(() => {});

  revalidatePath("/users");
  return { ok: true as const };
}
