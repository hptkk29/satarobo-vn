"use server";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { roleManagesCenter } from "@/lib/auth/managed-centers";
import { isCenterChecklistEnabled } from "@/lib/flags";
import { ALL_CHECKLIST_KEYS } from "@/lib/center-checklist";

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  centerId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  flags: z.record(z.string(), z.boolean()),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Phần 4 — lưu checklist mở/đóng 1 cơ sở 1 ngày. */
export async function saveCenterChecklist(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  // 20/08 — tính năng đã GỠ (cờ mặc định OFF). Layout của segment đã chặn đường VÀO trang,
  // nhưng Server Action là endpoint riêng: tab mở sẵn từ trước lúc tắt cờ, hay POST tay vào
  // action id, vẫn gọi thẳng vào đây mà không đi qua layout ⇒ phải tự chốt, kẻo "đã gỡ" mà
  // dữ liệu checklist vẫn ghi thêm được.
  if (!isCenterChecklistEnabled()) return { ok: false, error: "Tính năng checklist cơ sở đã tắt" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { centerId, note } = parsed.data;

  if (!(await checkPermission("hr_attendance:view", { centerId }))) {
    return { ok: false, error: "Không có quyền" };
  }

  const actor = await resolveActor(session.user.id);

  // QLCS (không kèm SUPER_ADMIN) chỉ ghi checklist của cơ sở MÌNH ĐANG QUẢN LÝ.
  //
  // A-01-6b (26/08/2026): trước đây vế phải là `session.user.centerId` — MỘT cơ sở neo,
  // ảnh chụp lúc đăng nhập. QLCS được giao hai cơ sở bị từ chối oan ở cơ sở thứ hai, và
  // người đổi cơ sở phải đăng xuất mới ghi được. Nguồn sự thật đúng là dòng `UserOrgRole`
  // đẻ ra vai CENTER_MANAGER — `roleManagesCenter` đọc đúng chỗ đó.
  //
  // ⚠️ KHÔNG thay bằng `actor.visibleCenterIds` (một mình hay AND với `passesScope`):
  // cả hai vế đều nở theo vai KIÊM NHIỆM (kế toán cơ sở CS2, hay HO_MARKETING neo tại HO)
  // ⇒ mở cổng GHI ở cơ sở người này chỉ được XEM. Lý lẽ đầy đủ + hai kịch bản đo được:
  // khối chú thích đầu `lib/auth/managed-centers.ts`.
  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  if (
    !isSuper &&
    hasRole(session.user, "CENTER_MANAGER") &&
    !roleManagesCenter(actor, "CENTER_MANAGER", centerId)
  ) {
    return { ok: false, error: "Cơ sở không thuộc phạm vi của bạn" };
  }

  // Chỉ nhận đúng các key hợp lệ.
  const flags: Record<string, boolean> = {};
  for (const k of ALL_CHECKLIST_KEYS) flags[k] = parsed.data.flags[k] === true;

  // Cách ly cơ sở (A0-04): CenterDayChecklist ∈ SCOPED_MODELS → ghi qua scopedDb.
  // ⚠️ scopedDb chỉ tự lọc đường ĐỌC (luật cứng #3) — cổng GHI ở trên phải tự chốt,
  // không trông vào `upsert` chặn hộ.
  const sdb = scopedDb(actor);

  const date = new Date(`${parsed.data.date}T00:00:00`);
  try {
    await sdb.centerDayChecklist.upsert({
      where: { centerId_date: { centerId, date } },
      update: { ...flags, note: note || null, byUserId: session.user.id },
      create: { centerId, date, ...flags, note: note || null, byUserId: session.user.id },
    });
  } catch (err) {
    return { ok: false, error: `Lỗi lưu: ${err instanceof Error ? err.message : "Unknown"}` };
  }
  revalidatePath("/cham-cong/checklist-co-so");
  revalidatePath("/dashboard");
  return { ok: true };
}
