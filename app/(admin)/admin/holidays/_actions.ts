"use server";

import { auth } from "@/lib/auth";
import { hasAnyRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { applyHolidayShift } from "@/lib/holidays/apply";
import { centerIdForOrgUnit } from "@/lib/org/org-service";

type ActionResult = { error?: string };

const HOLIDAY_TYPES = ["HOLIDAY", "MAINTENANCE", "EVENT", "OTHER"] as const;

const dateOnly = z
  .string()
  .trim()
  .min(1)
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD")
  .transform((s) => {
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
    return new Date(Date.UTC(y, m - 1, d));
  });

const holidaySchema = z
  .object({
    name: z.string().trim().min(1, "Tên ngày nghỉ bắt buộc"),
    date: dateOnly,
    endDate: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s && s.length > 0 ? s : null))
      .pipe(
        z.union([
          z.null(),
          z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày kết thúc phải dạng YYYY-MM-DD")
            .transform((s) => {
              const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
              return new Date(Date.UTC(y, m - 1, d));
            }),
        ]),
      ),
    // PR-C: đơn vị (OrgUnit) là nguồn chính; "ALL"/"" = toàn hệ thống (null).
    orgUnitId: z
      .string()
      .optional()
      .transform((s) => {
        if (!s || s === "" || s === "ALL") return null;
        return s;
      }),
    type: z.enum(HOLIDAY_TYPES).default("HOLIDAY"),
    note: z
      .string()
      .optional()
      .transform((s) => {
        if (!s) return null;
        const t = s.trim();
        return t.length > 0 ? t : null;
      }),
  })
  .refine(
    (d) => d.endDate === null || d.endDate.getTime() >= d.date.getTime(),
    { message: "Ngày kết thúc phải >= ngày bắt đầu", path: ["endDate"] },
  );

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasAnyRole(session.user, ["SUPER_ADMIN", "CENTER_MANAGER"])) {
    redirect("/dashboard?error=unauthorized");
  }
  return session.user;
}

function readForm(formData: FormData) {
  return {
    name: emptyToUndefined(formData.get("name")) ?? "",
    date: emptyToUndefined(formData.get("date")) ?? "",
    endDate: emptyToUndefined(formData.get("endDate")),
    orgUnitId: emptyToUndefined(formData.get("orgUnitId")),
    type: (emptyToUndefined(formData.get("type")) ?? "HOLIDAY") as
      | "HOLIDAY"
      | "MAINTENANCE"
      | "EVENT"
      | "OTHER",
    note: emptyToUndefined(formData.get("note")),
  };
}

// PR-C dual-write: ghi orgUnitId (nguồn chính) + centerId (suy ra, scopedDb cũ).
// HO → orgUnitId set nhưng centerId null; "ALL" → cả 2 null (toàn hệ thống).
function toCreate(
  c: z.infer<typeof holidaySchema>,
  centerId: string | null,
): Prisma.HolidayCreateInput {
  return {
    name: c.name,
    date: c.date,
    endDate: c.endDate,
    type: c.type,
    note: c.note,
    orgUnitId: c.orgUnitId,
    center: centerId ? { connect: { id: centerId } } : undefined,
  };
}

function toUpdate(
  c: z.infer<typeof holidaySchema>,
  centerId: string | null,
): Prisma.HolidayUpdateInput {
  return {
    name: c.name,
    date: c.date,
    endDate: c.endDate,
    type: c.type,
    note: c.note,
    orgUnitId: c.orgUnitId,
    center: centerId ? { connect: { id: centerId } } : { disconnect: true },
  };
}

export async function createHoliday(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = holidaySchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  // PR-C: suy centerId từ orgUnitId (HO → null; "ALL" → null).
  const centerId = await centerIdForOrgUnit(parsed.data.orgUnitId);

  let created: { date: Date; endDate: Date | null; centerId: string | null };
  try {
    created = await db.holiday.create({
      data: toCreate(parsed.data, centerId),
      select: { date: true, endDate: true, centerId: true },
    });
  } catch {
    return { error: "Lỗi cơ sở dữ liệu — không tạo được ngày nghỉ" };
  }

  // P1-f — dời các buổi tương lai trùng ngày nghỉ + báo GV (best-effort).
  try {
    await applyHolidayShift(created);
  } catch (err) {
    console.error("[createHoliday] shift error:", err);
  }

  revalidatePath("/holidays");
  revalidatePath("/sessions");
  redirect("/holidays");
}

export async function updateHoliday(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = holidaySchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  // PR-C: suy centerId từ orgUnitId (HO → null; "ALL" → null).
  const centerId = await centerIdForOrgUnit(parsed.data.orgUnitId);

  let updated: { date: Date; endDate: Date | null; centerId: string | null };
  try {
    updated = await db.holiday.update({
      where: { id },
      data: toUpdate(parsed.data, centerId),
      select: { date: true, endDate: true, centerId: true },
    });
  } catch {
    return { error: "Ngày nghỉ không tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  // P1-f — dời buổi trùng ngày nghỉ + báo GV (best-effort).
  try {
    await applyHolidayShift(updated);
  } catch (err) {
    console.error("[updateHoliday] shift error:", err);
  }

  revalidatePath("/holidays");
  revalidatePath(`/holidays/${id}/edit`);
  revalidatePath("/sessions");
  redirect("/holidays");
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.holiday.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá ngày nghỉ này" };
  }
  revalidatePath("/holidays");
  return {};
}
