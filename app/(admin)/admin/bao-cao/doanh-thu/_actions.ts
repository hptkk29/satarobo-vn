"use server";

import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type ActionResult = { ok: boolean; error?: string };

const targetSchema = z.object({
  // "" / "ALL" → null = mục tiêu toàn hệ thống.
  centerId: z
    .string()
    .optional()
    .transform((s) => (!s || s === "" || s === "ALL" ? null : s)),
  period: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Kỳ phải dạng YYYY-MM"),
  targetAmount: z.coerce
    .number()
    .int("Mục tiêu phải là số nguyên")
    .min(0, "Mục tiêu không được âm"),
  note: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim();
      return t && t.length > 0 ? t : null;
    }),
});

/**
 * Đặt/sửa mục tiêu doanh thu cho (center, period). centerId null = toàn hệ thống.
 * Vì @@unique([centerId, period]) coi NULL là DISTINCT (không match được qua upsert),
 * nhánh global PHẢI findFirst + create/update tay; nhánh có center dùng upsert bình thường.
 */
export async function setRevenueTargetAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("payments:manage"))) {
    return { ok: false, error: "Không có quyền đặt mục tiêu doanh thu" };
  }

  const parsed = targetSchema.safeParse({
    centerId: formData.get("centerId") ?? undefined,
    period: formData.get("period") ?? "",
    targetAmount: formData.get("targetAmount") ?? "",
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { centerId, period, targetAmount, note } = parsed.data;

  // Cách ly cơ sở: user không phải HO/SUPER_ADMIN chỉ được đặt mục tiêu cho cơ sở
  // mình thấy. centerId null (toàn hệ thống) chỉ HO-level/SUPER_ADMIN.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor); // RevenueTarget là SCOPE_EXEMPT → pass-through (thoả R6-F1)
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;
  if (centerId === null) {
    if (!isGlobalAllowed) {
      return { ok: false, error: "Chỉ cấp hội sở mới đặt được mục tiêu toàn hệ thống" };
    }
  } else if (!isGlobalAllowed && !actor.visibleCenterIds.includes(centerId)) {
    return { ok: false, error: "Cơ sở ngoài phạm vi quản lý của bạn" };
  }

  try {
    if (centerId === null) {
      // NULL distinct trong unique index → tự tìm rồi update/create.
      const existing = await sdb.revenueTarget.findFirst({
        where: { centerId: null, period },
        select: { id: true },
      });
      if (existing) {
        await sdb.revenueTarget.update({
          where: { id: existing.id },
          data: { targetAmount, note },
        });
      } else {
        await sdb.revenueTarget.create({
          data: { centerId: null, period, targetAmount, note, createdById: session.user.id },
        });
      }
    } else {
      await sdb.revenueTarget.upsert({
        where: { centerId_period: { centerId, period } },
        update: { targetAmount, note },
        create: { centerId, period, targetAmount, note, createdById: session.user.id },
      });
    }
  } catch {
    return { ok: false, error: "Lỗi cơ sở dữ liệu — không lưu được mục tiêu" };
  }

  revalidatePath("/bao-cao/doanh-thu");
  return { ok: true };
}
