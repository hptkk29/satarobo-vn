"use server";

// app/(admin)/admin/cham-cong/diem-cham/_actions.ts — L4: điểm chấm công (WorkLocation): toạ độ dán từ
// Google Maps, bán kính, bật/tắt geofence từng cơ sở (Q-02: chưa toạ độ thì không bật). Quyền `config`.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { writeAudit } from "@/lib/audit/audit-log";

type Res = { ok: true } | { ok: false; error: string };

const schema = z
  .object({
    id: z.string().optional(),
    centerId: z.string().min(1),
    code: z.string().trim().min(1).max(16).regex(/^[A-Z0-9_-]+$/, "Mã chỉ gồm chữ hoa/số"),
    name: z.string().trim().min(1).max(80),
    latitude: z.coerce.number().min(-90).max(90).nullable().default(null),
    longitude: z.coerce.number().min(-180).max(180).nullable().default(null),
    radiusMeters: z.coerce.number().int().min(10).max(2000).default(100),
    geofenceEnabled: z.coerce.boolean().default(false),
    isActive: z.coerce.boolean().default(true),
  })
  .refine((v) => !v.geofenceEnabled || (v.latitude != null && v.longitude != null), { message: "Chưa có toạ độ thì không bật geofence được" });

export async function saveWorkLocationAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  if (!(await checkPermission("hr_attendance:config", { centerId: p.data.centerId }))) return { ok: false, error: "Không có quyền cấu hình điểm chấm công ở cơ sở này" };
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const { id, ...data } = p.data;
  if (id) {
    const existing = await sdb.workLocation.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Không tìm thấy điểm chấm công" };
    if (!(await checkPermission("hr_attendance:config", { centerId: existing.centerId }))) return { ok: false, error: "Không có quyền" };
    await sdb.workLocation.update({ where: { id }, data });
    await writeAudit({ actor: { id: session.user.id, name: session.user.name ?? "" }, module: "hr_attendance", entityType: "WorkLocation", entityId: id, action: "UPDATE", oldValues: { latitude: existing.latitude, longitude: existing.longitude, radiusMeters: existing.radiusMeters, geofenceEnabled: existing.geofenceEnabled, isActive: existing.isActive }, newValues: data });
  } else {
    const created = await sdb.workLocation.create({ data, select: { id: true } });
    await writeAudit({ actor: { id: session.user.id, name: session.user.name ?? "" }, module: "hr_attendance", entityType: "WorkLocation", entityId: created.id, action: "CREATE", newValues: data });
  }
  revalidatePath("/cham-cong/diem-cham");
  return { ok: true };
}
