"use server";

// P2 · US-08 — Server Actions cho VỊ TRÍ CÔNG VIỆC.
//
// ⚠️ Quyền: `roles:manage` (chỉ SUPER_ADMIN). Vị trí mang bộ vai trò, nên sửa vị trí =
// sửa quyền của mọi người đang giữ nó — cùng hạng nguy hiểm với sửa RoleDef, phải cùng
// một cổng. Đừng hạ xuống `employees:edit` cho tiện.
//
// ⚠️ Chống vòng lặp gọi TRONG transaction cùng lệnh ghi (`assertNoReportingCycle`):
// kiểm ngoài transaction là để hở khe hai request song song cùng đóng vòng.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assertCan } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import {
  PrimaryAssignmentConflictError,
  ReportingCycleError,
  assertNoReportingCycle,
  assertSinglePrimary,
} from "@/lib/org/positions";
import { writeAudit } from "@/lib/audit/audit-log";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const schema = z.object({
  id: z.string().trim().max(64).optional(),
  title: z.string().trim().min(2, "Tên vị trí quá ngắn").max(120),
  orgUnitId: z.string().trim().min(1, "Chưa chọn đơn vị"),
  isManagerial: z.boolean().optional().default(false),
  reportsToPositionId: z.string().trim().max(64).nullable().optional(),
  roleIds: z.array(z.string().trim().min(1)).default([]),
});

async function guard() {
  const session = await auth();
  if (!session?.user) return { loi: "Chưa đăng nhập" as const, session: null };
  try {
    assertCan(session.user.role, "roles:manage");
  } catch {
    return { loi: "Không có quyền cấu hình vị trí" as const, session: null };
  }
  return { loi: null, session };
}

export async function luuViTri(input: unknown): Promise<ActionResult> {
  const { loi, session } = await guard();
  if (loi || !session) return { ok: false, error: loi ?? "Không có quyền" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
  const reportsTo = d.reportsToPositionId?.trim() ? d.reportsToPositionId.trim() : null;

  try {
    // `scopedDb` theo luật R6-F1; Position/PositionRole không thuộc SCOPED_MODELS nên
    // không bị lọc, và mọi ghi ở đây đã qua cổng `roles:manage` (chỉ SUPER_ADMIN).
    const sdb = scopedDb(await resolveActor(session.user.id));
    const id = await sdb.$transaction(async (tx) => {
      if (d.id) {
        // Kiểm vòng lặp TRƯỚC khi ghi, trong CÙNG transaction.
        await assertNoReportingCycle(d.id, reportsTo, tx as never);
        await tx.position.update({
          where: { id: d.id },
          data: {
            title: d.title,
            orgUnitId: d.orgUnitId,
            isManagerial: d.isManagerial,
            reportsToPositionId: reportsTo,
          },
        });
        // Bộ vai đặt lại theo đúng danh sách gửi lên — vị trí là NGUỒN SỰ THẬT của bộ
        // quyền, không cộng dồn lịch sử.
        await tx.positionRole.deleteMany({ where: { positionId: d.id } });
        if (d.roleIds.length > 0) {
          await tx.positionRole.createMany({
            data: d.roleIds.map((roleId) => ({ positionId: d.id as string, roleId })),
            skipDuplicates: true,
          });
        }
        return d.id;
      }
      const created = await tx.position.create({
        data: {
          title: d.title,
          orgUnitId: d.orgUnitId,
          isManagerial: d.isManagerial,
          reportsToPositionId: reportsTo,
          roles: { create: d.roleIds.map((roleId) => ({ roleId })) },
        },
        select: { id: true },
      });
      // Vị trí mới cũng phải kiểm: `reportsTo` có thể trỏ vào chuỗi đã vòng sẵn.
      await assertNoReportingCycle(created.id, reportsTo, tx as never);
      return created.id;
    });

    await writeAudit({
      actor: { id: session.user.id, name: session.user.name ?? session.user.email ?? "" },
      module: "rbac",
      entityType: "Position",
      entityId: id,
      action: d.id ? "UPDATE" : "CREATE",
      newValues: { title: d.title, orgUnitId: d.orgUnitId, roleIds: d.roleIds, reportsTo },
      orgUnitId: d.orgUnitId,
    }).catch(() => null);

    revalidatePath("/admin/nhan-su/vi-tri");
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ReportingCycleError) return { ok: false, error: e.message };
    console.error("[vi-tri] luuViTri lỗi:", e);
    return { ok: false, error: "Không lưu được vị trí — vui lòng thử lại." };
  }
}

export async function doiTrangThaiViTri(id: string, isActive: boolean): Promise<ActionResult> {
  const { loi, session } = await guard();
  if (loi || !session) return { ok: false, error: loi ?? "Không có quyền" };
  // KHÔNG xoá cứng: vị trí là lịch sử tổ chức, và người từng giữ nó vẫn phải tra được.
  const sdb = scopedDb(await resolveActor(session.user.id));
  await sdb.position.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin/nhan-su/vi-tri");
  return { ok: true, id };
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 · US-09 — PHÂN CÔNG NGƯỜI VÀO VỊ TRÍ (PRIMARY / CONCURRENT / DELEGATED).
//
// ⚠️ AC3: LỊCH SỬ KHÔNG XOÁ. "Gỡ" một người khỏi vị trí = ĐÓNG HIỆU LỰC
// (`effectiveTo = hôm nay`), không `delete`. Quyền tắt ngay ở request kế tiếp vì bộ lọc
// thời gian nằm trong resolver (`loadPositionRoleRows`), không cần cron dọn (AC2).
// Vì vậy KHÔNG có action xoá phân công ở đây — cố ý.
// ─────────────────────────────────────────────────────────────────────────────

const phanCongSchema = z
  .object({
    id: z.string().trim().max(64).optional(),
    positionId: z.string().trim().min(1, "Chưa chọn vị trí"),
    userId: z.string().trim().min(1, "Chưa chọn người"),
    kind: z.enum(["PRIMARY", "CONCURRENT", "DELEGATED"]).default("PRIMARY"),
    effectiveFrom: z.string().trim().min(1, "Chưa chọn ngày bắt đầu"),
    effectiveTo: z.string().trim().optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((d, ctx) => {
    const tu = new Date(d.effectiveFrom);
    if (Number.isNaN(tu.getTime())) {
      ctx.addIssue({ code: "custom", message: "Ngày bắt đầu không hợp lệ", path: ["effectiveFrom"] });
      return;
    }
    if (d.effectiveTo) {
      const den = new Date(d.effectiveTo);
      if (Number.isNaN(den.getTime())) {
        ctx.addIssue({ code: "custom", message: "Ngày kết thúc không hợp lệ", path: ["effectiveTo"] });
      } else if (den < tu) {
        ctx.addIssue({ code: "custom", message: "Ngày kết thúc trước ngày bắt đầu", path: ["effectiveTo"] });
      }
    }
  });

export async function luuPhanCong(input: unknown): Promise<ActionResult> {
  const { loi, session } = await guard();
  if (loi || !session) return { ok: false, error: loi ?? "Không có quyền" };

  const parsed = phanCongSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
  const effectiveFrom = new Date(d.effectiveFrom);
  const effectiveTo = d.effectiveTo ? new Date(d.effectiveTo) : null;

  try {
    const sdb = scopedDb(await resolveActor(session.user.id));
    const id = await sdb.$transaction(async (tx) => {
      // US-09 AC1 — kiểm TRONG transaction: kiểm ngoài để hở khe hai request song song
      // cùng tạo PRIMARY cho một người.
      await assertSinglePrimary({
        userId: d.userId,
        kind: d.kind,
        effectiveFrom,
        effectiveTo,
        ignoreAssignmentId: d.id,
        client: tx as never,
      });
      if (d.id) {
        await tx.positionAssignment.update({
          where: { id: d.id },
          data: { kind: d.kind, effectiveFrom, effectiveTo, note: d.note ?? null },
        });
        return d.id;
      }
      const created = await tx.positionAssignment.create({
        data: {
          positionId: d.positionId,
          userId: d.userId,
          kind: d.kind,
          effectiveFrom,
          effectiveTo,
          note: d.note ?? null,
          createdById: session.user.id,
        },
        select: { id: true },
      });
      return created.id;
    });

    await writeAudit({
      actor: { id: session.user.id, name: session.user.name ?? session.user.email ?? "" },
      module: "rbac",
      entityType: "PositionAssignment",
      entityId: id,
      action: d.id ? "UPDATE" : "CREATE",
      newValues: {
        positionId: d.positionId,
        userId: d.userId,
        kind: d.kind,
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo ?? null,
      },
    }).catch(() => null);

    revalidatePath("/admin/nhan-su/vi-tri");
    return { ok: true, id };
  } catch (e) {
    if (e instanceof PrimaryAssignmentConflictError) return { ok: false, error: e.message };
    console.error("[vi-tri] luuPhanCong lỗi:", e);
    return { ok: false, error: "Không lưu được phân công — vui lòng thử lại." };
  }
}

/**
 * "Gỡ" người khỏi vị trí — ĐÓNG HIỆU LỰC, không xoá (US-09 AC3).
 * Đặt `effectiveTo = bây giờ` để quyền rụng ngay, nhưng bản ghi vẫn tra được về sau.
 */
export async function ketThucPhanCong(id: string): Promise<ActionResult> {
  const { loi, session } = await guard();
  if (loi || !session) return { ok: false, error: loi ?? "Không có quyền" };

  const bayGio = new Date();
  const sdb = scopedDb(await resolveActor(session.user.id));
  // CHỈ đặt `effectiveTo`, KHÔNG đụng `status`. `status` dùng cho đình chỉ (SUSPENDED);
  // còn-hiệu-lực-hay-không là KHOẢNG THỜI GIAN. Ghi cả hai chỗ = hai nguồn sự thật, và
  // sớm muộn sẽ có bản ghi `EXPIRED` mà `effectiveTo` còn ở tương lai.
  await sdb.positionAssignment.update({ where: { id }, data: { effectiveTo: bayGio } });

  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? session.user.email ?? "" },
    module: "rbac",
    entityType: "PositionAssignment",
    entityId: id,
    action: "UPDATE",
    newValues: { effectiveTo: bayGio.toISOString() },
  }).catch(() => null);

  revalidatePath("/admin/nhan-su/vi-tri");
  return { ok: true, id };
}
