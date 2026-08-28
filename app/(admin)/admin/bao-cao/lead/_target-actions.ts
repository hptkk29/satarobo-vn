"use server";

import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// C-01 (§C.6.10) — đặt chỉ tiêu SỐ HỌC SINH theo tháng × cơ sở.
//
// Khuôn chép từ `bao-cao/doanh-thu/_actions.ts` (`setRevenueTargetAction`), kể cả cái
// bẫy NULL-DISTINCT bên dưới. Cố ý giữ hai hàm rời chứ không trừu tượng hoá chung: hai
// bảng khác nhau, hai permission key khác nhau, và gộp lại thì sửa một cái là đụng cái
// kia — đúng thứ vừa phải tách ra ở chỗ khác.
//
// ⚠️ ĐƠN VỊ LÀ HỌC SINH (CHUNG-2), không phải phụ huynh. Người nhập quen đếm "bao nhiêu
// khách" sẽ nhập số phụ huynh và chỉ tiêu thành ra thấp giả — nhãn trên form phải nói rõ.

type ActionResult = { ok: boolean; error?: string };

const leadTargetSchema = z.object({
  // "" / "ALL" → null = chỉ tiêu toàn hệ thống.
  centerId: z
    .string()
    .optional()
    .transform((s) => (!s || s === "" || s === "ALL" ? null : s)),
  period: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Kỳ phải dạng YYYY-MM"),
  targetCount: z.coerce
    .number()
    .int("Chỉ tiêu phải là số nguyên")
    .min(0, "Chỉ tiêu không được âm")
    .max(100_000, "Chỉ tiêu vượt ngưỡng hợp lý"),
  note: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim();
      return t && t.length > 0 ? t : null;
    }),
});

/**
 * Đặt/sửa chỉ tiêu lead cho (center, period). `centerId = null` = toàn hệ thống.
 *
 * 🔴 `@@unique([centerId, period])` với `centerId` nullable KHÔNG chặn được nhánh toàn
 * hệ thống: Postgres coi `NULL` là DISTINCT nên `upsert` không bao giờ match và mỗi lần
 * lưu lại đẻ thêm một dòng. Vì thế nhánh global PHẢI `findFirst` + create/update tay.
 * Đây không phải chuyện phong cách — hai dòng chỉ tiêu cùng kỳ sẽ được C2 CỘNG LẠI và
 * mẫu số gấp đôi.
 */
export async function setLeadTargetAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // Key RIÊNG (QĐ-C5): cố ý không mượn `leads:assign-config` — key đó gác màn cấu hình
  // CHIA lead, gộp vào là ai đặt chỉ tiêu cũng sửa được quy tắc chia lead.
  if (!(await checkPermission("lead_targets:manage"))) {
    return { ok: false, error: "Không có quyền đặt chỉ tiêu lead" };
  }

  const parsed = leadTargetSchema.safeParse({
    centerId: formData.get("centerId") ?? undefined,
    period: formData.get("period") ?? "",
    targetCount: formData.get("targetCount") ?? "",
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { centerId, period, targetCount, note } = parsed.data;

  const actor = await resolveActor(session.user.id);
  // `LeadTarget` ∈ SCOPE_EXEMPT ⇒ `scopedDb` là pass-through ở đây. Cách ly nằm ở
  // đúng hai nhánh kiểm dưới đây, KHÔNG ở tầng query — đừng gỡ chúng vì thấy có sdb.
  const sdb = scopedDb(actor);
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;
  if (centerId === null) {
    if (!isGlobalAllowed) {
      return { ok: false, error: "Chỉ cấp hội sở mới đặt được chỉ tiêu toàn hệ thống" };
    }
  } else if (!isGlobalAllowed && !actor.visibleCenterIds.includes(centerId)) {
    return { ok: false, error: "Cơ sở ngoài phạm vi quản lý của bạn" };
  }

  try {
    if (centerId === null) {
      const existing = await sdb.leadTarget.findFirst({
        where: { centerId: null, period },
        select: { id: true },
      });
      if (existing) {
        await sdb.leadTarget.update({ where: { id: existing.id }, data: { targetCount, note } });
      } else {
        await sdb.leadTarget.create({
          data: { centerId: null, period, targetCount, note, createdById: session.user.id },
        });
      }
    } else {
      await sdb.leadTarget.upsert({
        where: { centerId_period: { centerId, period } },
        update: { targetCount, note },
        create: { centerId, period, targetCount, note, createdById: session.user.id },
      });
    }
  } catch {
    return { ok: false, error: "Lỗi cơ sở dữ liệu — không lưu được chỉ tiêu" };
  }

  revalidatePath("/admin/bao-cao/lead");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
