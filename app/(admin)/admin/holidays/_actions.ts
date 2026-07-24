"use server";

import { auth } from "@/lib/auth";
import { hasAnyRole } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { applyHolidayShift } from "@/lib/holidays/apply";
import { centerIdForOrgUnit } from "@/lib/org/org-service";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";

type ActionResult = { error?: string };

// Cách ly cơ sở: Holiday ∈ SCOPED_MODELS. centerId=null = ngày nghỉ TOÀN HỆ THỐNG
// → chỉ SUPER_ADMIN/HO được tạo/sửa/xoá. CENTER_MANAGER chỉ thao tác ngày nghỉ
// thuộc cơ sở mình (chống IDOR ghi liên cơ sở).
// GHI đối xứng với ĐỌC (vá 24/07): scope per-model qua passesScope — ngày nghỉ TOÀN HỆ
// THỐNG (centerId null) đòi scope ALL (role HO có quyền holidays:/centers:), không còn
// mở cho mọi role @HO; center-level chỉ nhắm cơ sở trong scope.
function actorCanUseCenterTarget(actor: Actor, centerId: string | null): boolean {
  return passesScope("Holiday", { centerId }, actor);
}

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
  const user = await requireAdmin();

  const parsed = holidaySchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  // PR-C: suy centerId từ orgUnitId (HO → null; "ALL" → null).
  const centerId = await centerIdForOrgUnit(parsed.data.orgUnitId);

  // Cách ly cơ sở: center-level không được tạo ngày nghỉ toàn hệ thống / cơ sở khác.
  const actor = await resolveActor(user.id);
  if (!actorCanUseCenterTarget(actor, centerId)) {
    return { error: "Không có quyền tạo ngày nghỉ cho phạm vi cơ sở này" };
  }
  const sdb = scopedDb(actor);

  let created: { date: Date; endDate: Date | null; centerId: string | null };
  try {
    created = await sdb.holiday.create({
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
  // Thành công → trả {} để client toast + điều hướng (QA 20/07 — không redirect âm thầm).
  return {};
}

export async function updateHoliday(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const parsed = holidaySchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  // PR-C: suy centerId từ orgUnitId (HO → null; "ALL" → null).
  const centerId = await centerIdForOrgUnit(parsed.data.orgUnitId);

  // Cách ly cơ sở (chống IDOR ghi): ngày nghỉ HIỆN TẠI + phạm vi ĐÍCH đều phải
  // thuộc tầm nhìn actor. sdb.findUnique tự null-filter record ngoài scope.
  const actor = await resolveActor(user.id);
  const sdb = scopedDb(actor);
  const existing = await sdb.holiday.findUnique({ where: { id }, select: { centerId: true } });
  if (!existing || !passesScope("Holiday", existing, actor)) {
    return { error: "Ngày nghỉ không tồn tại" };
  }
  if (!actorCanUseCenterTarget(actor, centerId)) {
    return { error: "Không có quyền chuyển ngày nghỉ sang phạm vi cơ sở này" };
  }

  let updated: { date: Date; endDate: Date | null; centerId: string | null };
  try {
    updated = await sdb.holiday.update({
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
  return {};
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  // Cách ly cơ sở: chỉ xoá ngày nghỉ trong tầm nhìn cơ sở của actor (chống IDOR).
  const actor = await resolveActor(user.id);
  const sdb = scopedDb(actor);
  const existing = await sdb.holiday.findUnique({ where: { id }, select: { centerId: true } });
  if (!existing || !passesScope("Holiday", existing, actor)) {
    return { error: "Ngày nghỉ không tồn tại" };
  }
  try {
    await sdb.holiday.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá ngày nghỉ này" };
  }
  revalidatePath("/holidays");
  return {};
}
