"use server";

// app/(admin)/admin/cham-cong/_actions.ts — L5: GHI ĐÈ CÔNG NGÀY (hộp cờ Quản lý — T-01: lượt quét chỉ
// sinh cờ, người quyết là Quản lý). Quyền `hr_attendance:adjust` tại cơ sở chịu công của ngày đó.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { writeAudit } from "@/lib/audit/audit-log";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { setDayOverride } from "@/lib/cham-cong/period";

type Res = { ok: true } | { ok: false; error: string };

const schema = z.object({
  userId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  units: z.coerce.number().min(0).max(3).nullable(),
  note: z.string().trim().max(300).nullable(),
});

export async function setDayOverrideAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const [y, m, d] = p.data.workDate.split("-").map(Number);
  const workDate = new Date(Date.UTC(y, m - 1, d));
  const sdb = scopedDb(await resolveActor(session.user.id));
  const row = await sdb.staffAttendanceDay.findUnique({ where: { userId_workDate: { userId: p.data.userId, workDate } }, select: { centerId: true } });
  if (!row) return { ok: false, error: "Ngày này chưa được tính" };
  if (!(await checkPermission("hr_attendance:adjust", { centerId: row.centerId }))) return { ok: false, error: "Không có quyền chỉnh công ở cơ sở này" };
  const r = await setDayOverride({ userId: p.data.userId, workDate, units: p.data.units, note: p.data.note, actorId: session.user.id });
  if (!r.ok) return r;
  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "" },
    module: "hr_attendance",
    entityType: "StaffAttendanceDay",
    entityId: `${p.data.userId}:${p.data.workDate}`,
    action: p.data.units == null ? "CLEAR_OVERRIDE" : "SET_OVERRIDE",
    oldValues: { overrideUnits: r.before },
    newValues: { overrideUnits: p.data.units },
    reason: p.data.note ?? undefined,
  });
  revalidatePath("/cham-cong");
  revalidatePath("/cham-cong/ky-cong");
  return { ok: true };
}
