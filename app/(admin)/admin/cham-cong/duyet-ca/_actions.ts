"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { WorkShift } from "@prisma/client";

// Module Chấm công PHẦN 2 — quản lý import lịch ca → ĐÈ HOÀN TOÀN lịch CHÍNH THỨC
// (APPROVED) của cơ sở trong tháng. Chỉ APPROVED dùng để tính công.

export interface ShiftImportRow {
  email: string;
  date: string; // yyyy-mm-dd (đã validate format ở client)
  shifts: WorkShift[];
  note: string;
}

const rowSchema = z.object({
  email: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shifts: z.array(z.string()).max(3),
  note: z.string().max(500).optional().default(""),
});

const inputSchema = z.object({
  centerId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rows: z.array(rowSchema).max(5000),
});

type Result = { success: number; errors: { row: number; error: string }[] };

export async function importApprovedShifts(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { success: 0, errors: [{ row: 0, error: "Chưa đăng nhập" }] };
  if (!can(session.user, "hr_attendance:view")) {
    return { success: 0, errors: [{ row: 0, error: "Không có quyền duyệt ca" }] };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: 0, errors: [{ row: 0, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }] };
  }
  let { centerId } = parsed.data;
  const { month, rows } = parsed.data;

  // CM chỉ import cơ sở mình.
  if (hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")) {
    centerId = session.user.centerId ?? "";
  }
  if (!centerId) return { success: 0, errors: [{ row: 0, error: "Thiếu cơ sở" }] };

  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1;
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 1);

  // Nhân viên thuộc cơ sở (để validate "mã NV tồn tại + thuộc cơ sở").
  const staff = await db.user.findMany({
    where: { centerId, role: { not: "PARENT" }, deletedAt: null },
    select: { id: true, email: true },
  });
  const userByEmail = new Map(staff.map((u) => [u.email.toLowerCase(), u.id]));

  const errors: { row: number; error: string }[] = [];
  const valid: { userId: string; date: Date; shifts: WorkShift[]; note: string | null }[] = [];

  rows.forEach((r, i) => {
    const rowNo = i + 2; // +2: dòng 1 là header
    const userId = userByEmail.get(r.email.trim().toLowerCase());
    if (!userId) {
      errors.push({ row: rowNo, error: `Mã NV "${r.email}" không thuộc cơ sở này` });
      return;
    }
    const d = new Date(`${r.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) {
      errors.push({ row: rowNo, error: `Ngày không hợp lệ: ${r.date}` });
      return;
    }
    if (d < monthStart || d >= monthEnd) {
      errors.push({ row: rowNo, error: `Ngày ${r.date} không thuộc tháng ${month}` });
      return;
    }
    const okShifts: WorkShift[] = [];
    for (const s of r.shifts) {
      if (s === "CA_SANG" || s === "CA_CHIEU" || s === "CA_TOI") okShifts.push(s);
      else {
        errors.push({ row: rowNo, error: `Ca không hợp lệ: ${s}` });
        return;
      }
    }
    valid.push({ userId, date: d, shifts: okShifts, note: r.note.trim() || null });
  });

  // Trùng (userId, date) trong file → giữ dòng cuối; báo lỗi dòng trước.
  const byKey = new Map<string, (typeof valid)[number]>();
  for (const v of valid) byKey.set(`${v.userId}|${v.date.getTime()}`, v);
  const finalRows = [...byKey.values()];

  if (finalRows.length === 0) {
    return { success: 0, errors: errors.length ? errors : [{ row: 0, error: "Không có dòng hợp lệ" }] };
  }

  const staffIds = staff.map((s) => s.id);

  try {
    await db.$transaction([
      // ĐÈ: xoá toàn bộ lịch tháng đó của nhân viên cơ sở rồi tạo lại APPROVED.
      db.shiftRegistration.deleteMany({
        where: { userId: { in: staffIds }, date: { gte: monthStart, lt: monthEnd } },
      }),
      ...finalRows.map((v) =>
        db.shiftRegistration.create({
          data: {
            userId: v.userId,
            centerId,
            date: v.date,
            shifts: v.shifts,
            status: "APPROVED",
            note: v.note,
          },
        }),
      ),
    ]);
  } catch (err) {
    return {
      success: 0,
      errors: [{ row: 0, error: `Lỗi ghi lịch: ${err instanceof Error ? err.message : "Unknown"}` }],
    };
  }

  revalidatePath("/cham-cong/lich-ca-nhan-vien");
  revalidatePath("/cham-cong");
  revalidatePath("/cham-cong/duyet-ca");
  return { success: finalRows.length, errors };
}
