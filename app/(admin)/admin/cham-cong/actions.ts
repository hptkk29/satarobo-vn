"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { verifyQrToken, distanceMeters } from "@/lib/attendance/qr";
import { getSetting } from "@/lib/settings/service";

// =============================================================================
// EMPLOYEE CHECK-IN — Phase NHÓM 4 (Module Chấm công PHẦN 1)
// Nhân viên scan QR CỐ ĐỊNH của cơ sở → gửi kèm GPS → ghi EmployeeCheckin.
// Verify: token đúng cơ sở (cố định, không hết hạn) + GPS trong bán kính 100m.
// qrToken lưu kèm ngày → unique [userId, type, qrToken] = 1 lần/loại/ngày.
// =============================================================================

const schema = z.object({
  centerId: z.string().min(1),
  token: z.string().min(1),
  type: z.enum(["CHECK_IN", "CHECK_OUT"]),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export async function recordCheckin(input: {
  centerId: string;
  token: string;
  type: "CHECK_IN" | "CHECK_OUT";
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ ok: boolean; error?: string; withinGeofence?: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("hr_attendance:checkin", { centerId: input.centerId }))) {
    return { ok: false, error: "Không có quyền chấm công" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;

  if (!verifyQrToken(d.token, d.centerId)) {
    return { ok: false, error: "Mã QR không đúng cơ sở — quét lại mã tại quầy" };
  }

  // Cách ly cơ sở (A0-04): EmployeeCheckin ∈ SCOPED_MODELS → đọc/ghi qua scopedDb.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Geofence (nếu cơ sở có toạ độ).
  const center = await sdb.center.findUnique({
    where: { id: d.centerId },
    select: { latitude: true, longitude: true, allowedRadiusMeters: true, name: true },
  });
  if (!center) return { ok: false, error: "Cơ sở không tồn tại" };

  let dist: number | null = null;
  let withinGeofence = true;
  if (center.latitude != null && center.longitude != null) {
    if (d.latitude == null || d.longitude == null) {
      return { ok: false, error: "Cần bật định vị (GPS) để chấm công" };
    }
    dist = distanceMeters(d.latitude, d.longitude, center.latitude, center.longitude);
    const radius = center.allowedRadiusMeters ?? (await getSetting("shift.geofenceRadiusMeters"));
    withinGeofence = dist <= radius;
    if (!withinGeofence) {
      return {
        ok: false,
        error: `Ngoài vùng cho phép: bạn cách ${center.name} ~${dist}m (cho phép ${radius}m). Hãy đến trong bán kính ${radius}m của cơ sở.`,
        withinGeofence: false,
      };
    }
  }

  // QR cố định → lưu qrToken kèm NGÀY để unique [userId,type,qrToken] = 1 lần/loại/ngày.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayKey = `${startOfDay.getFullYear()}-${String(startOfDay.getMonth() + 1).padStart(2, "0")}-${String(startOfDay.getDate()).padStart(2, "0")}`;
  const storedToken = `${d.centerId}:${dayKey}`;
  const dupToday = await sdb.employeeCheckin.findFirst({
    where: { userId: session.user.id, type: d.type, checkedAt: { gte: startOfDay } },
    select: { id: true },
  });
  if (dupToday) {
    return {
      ok: false,
      error: d.type === "CHECK_IN" ? "Hôm nay đã check-in rồi" : "Hôm nay đã check-out rồi",
    };
  }

  try {
    await sdb.employeeCheckin.create({
      data: {
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? null,
        centerId: d.centerId,
        type: d.type,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        distanceMeters: dist,
        withinGeofence,
        qrToken: storedToken,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { ok: false, error: "Mã QR này đã được dùng" };
    }
    return { ok: false, error: "Lỗi ghi chấm công" };
  }

  revalidatePath("/cham-cong");
  return { ok: true, withinGeofence: true };
}
