"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { verifyQrToken, distanceMeters } from "@/lib/attendance/qr";

// =============================================================================
// EMPLOYEE CHECK-IN — Phase NHÓM 4
// Nhân viên scan QR (token) trên điện thoại → gửi kèm GPS → ghi EmployeeCheckin.
// Verify: token hợp lệ (cửa sổ 30s), geofence theo Center, single-use (unique
// [userId, type, qrToken]). Bắt buộc cả check-in lẫn check-out trong ngày.
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
  if (!can(session.user, "hr_attendance:checkin")) {
    return { ok: false, error: "Không có quyền chấm công" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;

  if (!verifyQrToken(d.token, d.centerId)) {
    return { ok: false, error: "Mã QR hết hạn — quét lại mã trên màn hình" };
  }

  // Geofence (nếu cơ sở có toạ độ).
  const center = await db.center.findUnique({
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
    const radius = center.allowedRadiusMeters ?? 150;
    withinGeofence = dist <= radius;
    if (!withinGeofence) {
      return {
        ok: false,
        error: `Bạn đang cách ${center.name} ~${dist}m (cho phép ${radius}m). Hãy đến gần cơ sở.`,
        withinGeofence: false,
      };
    }
  }

  // Single-use token + 1 lần mỗi loại / ngày.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dupToday = await db.employeeCheckin.findFirst({
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
    await db.employeeCheckin.create({
      data: {
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? null,
        centerId: d.centerId,
        type: d.type,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        distanceMeters: dist,
        withinGeofence,
        qrToken: d.token,
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
