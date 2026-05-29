"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WorkShift } from "@prisma/client";
import { needsLeaveRequest } from "@/lib/shifts";

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
