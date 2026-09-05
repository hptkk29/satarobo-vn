"use server";

// lib/attendance/checkin-action.ts — Server Action chấm công QR, DÙNG CHUNG cho
// màn check-in ở admin (`/cham-cong/checkin`) và site GV (`/teacher/cham-cong/checkin`).
//
// Dời từ `app/(admin)/admin/cham-cong/actions.ts` ở L0 (05/09/2026) theo tiền lệ
// `lib/lead/intake/quick-form-action.ts`: một action + một client component, hai trang
// chỉ ghép lại. Chép logic sang chỗ thứ hai là mở đường cho hai màn lệch nhau.
//
// Luồng: nhân viên quét QR CỐ ĐỊNH của cơ sở → gửi kèm GPS → ghi EmployeeCheckin.
// Verify: token đúng cơ sở (cố định, không hết hạn) + gác cơ sở (L0 0.3) + GPS trong
// bán kính nếu cơ sở có toạ độ. qrToken lưu kèm NGÀY VN → unique [userId,type,qrToken]
// = 1 lần/loại/ngày.
//
// ⚠️ Ngày tính theo GIỜ VIỆT NAM (`lib/time/vn.ts`), không theo giờ máy chủ: Vercel chạy
// UTC nên bản cũ (`setHours(0,0,0,0)`) coi 06:30 sáng VN là "hôm qua" và cửa sổ "đã
// check-in hôm nay" chạy từ 07:00 VN hôm nay tới 07:00 VN hôm sau.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { verifyQrToken, distanceMeters } from "@/lib/attendance/qr";
import { decideCheckinCenter } from "@/lib/attendance/checkin-center-guard";
import { getSetting } from "@/lib/settings/service";
import { vnStartOfDay, vnYmd } from "@/lib/time/vn";

const schema = z.object({
  centerId: z.string().min(1),
  token: z.string().min(1),
  type: z.enum(["CHECK_IN", "CHECK_OUT"]),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export type RecordCheckinInput = {
  centerId: string;
  token: string;
  type: "CHECK_IN" | "CHECK_OUT";
  latitude?: number | null;
  longitude?: number | null;
};

export type RecordCheckinResult = { ok: boolean; error?: string; withinGeofence?: boolean };

export async function recordCheckin(input: RecordCheckinInput): Promise<RecordCheckinResult> {
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

  // Center ∈ SCOPE_EXEMPT — đọc được mọi cơ sở, nên gác cơ sở phải làm riêng bên dưới.
  const center = await sdb.center.findUnique({
    where: { id: d.centerId },
    select: { latitude: true, longitude: true, allowedRadiusMeters: true, name: true },
  });
  if (!center) return { ok: false, error: "Cơ sở không tồn tại" };

  // L0 0.3 — chấm chéo cơ sở. Luật thuần + test ở checkin-center-guard.ts.
  const centerGate = decideCheckinCenter(actor, d.centerId, center.name);
  if (!centerGate.ok) return { ok: false, error: centerGate.error };

  // Geofence (nếu cơ sở có toạ độ).
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

  // QR cố định → lưu qrToken kèm NGÀY VN để unique [userId,type,qrToken] = 1 lần/loại/ngày.
  const now = new Date();
  const startOfDay = vnStartOfDay(now);
  const storedToken = `${d.centerId}:${vnYmd(now)}`;
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
  revalidatePath("/teacher/cham-cong");
  return { ok: true, withinGeofence: true };
}
