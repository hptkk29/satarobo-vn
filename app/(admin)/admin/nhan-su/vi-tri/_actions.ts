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
import { ReportingCycleError, assertNoReportingCycle } from "@/lib/org/positions";
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
