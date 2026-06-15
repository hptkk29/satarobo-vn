"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, hasRole } from "@/lib/auth/permissions";
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
  if (!can(session.user, "hr_attendance:view")) {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { centerId, note } = parsed.data;

  // CENTER_MANAGER (không kèm SUPER_ADMIN) chỉ cơ sở mình.
  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  if (!isSuper && hasRole(session.user, "CENTER_MANAGER") && centerId !== session.user.centerId) {
    return { ok: false, error: "Cơ sở không thuộc phạm vi của bạn" };
  }

  // Chỉ nhận đúng các key hợp lệ.
  const flags: Record<string, boolean> = {};
  for (const k of ALL_CHECKLIST_KEYS) flags[k] = parsed.data.flags[k] === true;

  const date = new Date(`${parsed.data.date}T00:00:00`);
  try {
    await db.centerDayChecklist.upsert({
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
