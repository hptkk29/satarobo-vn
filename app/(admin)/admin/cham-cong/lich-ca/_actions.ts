"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WorkShift } from "@prisma/client";
import { needsLeaveRequest, emergencyLimitReached } from "@/lib/shifts";
import { getSetting } from "@/lib/settings/service";

type Result = { ok: true; status?: string } | { ok: false; error: string };

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
  shifts: z.array(z.nativeEnum(WorkShift)).max(3),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

/** Đợt 3E phần 2 — nhân viên tự lưu/sửa ca của CHÍNH MÌNH cho 1 ngày. */
export async function saveMyShifts(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // Mọi nhân viên (trừ PARENT) được đăng ký ca.
  if (session.user.role === "PARENT") return { ok: false, error: "Không có quyền" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { note } = parsed.data;
  const shifts = [...new Set(parsed.data.shifts)];
  // Ngày làm (chuẩn hoá về 00:00 local → lưu @db.Date).
  const workDate = new Date(`${parsed.data.date}T00:00:00`);

  // Sát ngày (<2 ngày) → đánh dấu xin nghỉ khẩn để quản lý sắp người bù.
  const status = needsLeaveRequest(new Date(), workDate) ? "LEAVE_REQUESTED" : "REGISTERED";

  // PHẦN 6 — chặn khẩn cấp quá 3 lần/tháng/nhân viên. Chỉ tính khi đây là MỘT
  // emergency MỚI (ngày này chưa đang ở trạng thái khẩn cấp).
  if (status === "LEAVE_REQUESTED") {
    const monthStart = new Date(workDate.getFullYear(), workDate.getMonth(), 1);
    const monthEnd = new Date(workDate.getFullYear(), workDate.getMonth() + 1, 1);
    const existingToday = await db.shiftRegistration.findUnique({
      where: { userId_date: { userId: session.user.id, date: workDate } },
      select: { status: true },
    });
    const alreadyEmergency = existingToday?.status === "LEAVE_REQUESTED";
    if (!alreadyEmergency) {
      const used = await db.shiftRegistration.count({
        where: {
          userId: session.user.id,
          status: "LEAVE_REQUESTED",
          date: { gte: monthStart, lt: monthEnd },
        },
      });
      const emergencyLimit = await getSetting("shift.emergencyMonthlyLimit");
      if (emergencyLimitReached(used, emergencyLimit)) {
        return {
          ok: false,
          error: `Đã dùng hết ${emergencyLimit} lần đổi/nghỉ khẩn cấp trong tháng. Liên hệ quản lý.`,
        };
      }
    }
  }

  try {
    if (shifts.length === 0) {
      // Bỏ hết ca = xoá đăng ký (nếu sát ngày, vẫn lưu LEAVE_REQUESTED rỗng để quản lý thấy).
      if (status === "LEAVE_REQUESTED") {
        await db.shiftRegistration.upsert({
          where: { userId_date: { userId: session.user.id, date: workDate } },
          update: { shifts: [], status, note: note || null, centerId: session.user.centerId },
          create: {
            userId: session.user.id,
            date: workDate,
            shifts: [],
            status,
            note: note || null,
            centerId: session.user.centerId,
          },
        });
      } else {
        await db.shiftRegistration.deleteMany({
          where: { userId: session.user.id, date: workDate },
        });
      }
    } else {
      await db.shiftRegistration.upsert({
        where: { userId_date: { userId: session.user.id, date: workDate } },
        update: { shifts, status, note: note || null, centerId: session.user.centerId },
        create: {
          userId: session.user.id,
          date: workDate,
          shifts,
          status,
          note: note || null,
          centerId: session.user.centerId,
        },
      });
    }
  } catch (err) {
    return { ok: false, error: `Lỗi lưu ca: ${err instanceof Error ? err.message : "Unknown"}` };
  }

  revalidatePath("/cham-cong/lich-ca");
  revalidatePath("/cham-cong/lich-ca-nhan-vien");
  return { ok: true, status };
}
