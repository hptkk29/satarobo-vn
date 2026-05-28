"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = { error?: string };

const ROOM_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"] as const;

const roomSchema = z.object({
  name: z.string().trim().min(1, "Tên phòng không được để trống"),
  code: z
    .string()
    .trim()
    .min(1, "Mã phòng không được để trống")
    .regex(/^[A-Z0-9-]+$/, "Mã chỉ A-Z, 0-9, dấu -"),
  centerId: z.string().trim().min(1, "Chọn cơ sở"),
  capacity: z.number().int().min(1, "Sức chứa tối thiểu 1"),
  equipment: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(ROOM_STATUSES).default("ACTIVE"),
  notes: z.string().nullable().optional(),
  displayOrder: z.number().int().default(0),
});

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseInteger(value: FormDataEntryValue | null, fallback = 0): number {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseEquipment(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((s) => (typeof s === "string" ? s.trim() : String(s).trim()))
        .filter((s) => s.length > 0);
    }
  } catch {
    // fall through
  }
  return [];
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "CENTER_MANAGER") {
    redirect("/dashboard?error=unauthorized");
  }
  return session.user;
}

function readForm(formData: FormData) {
  return {
    name: emptyToUndefined(formData.get("name")) ?? "",
    code: (emptyToUndefined(formData.get("code")) ?? "").toUpperCase(),
    centerId: emptyToUndefined(formData.get("centerId")) ?? "",
    capacity: parseInteger(formData.get("capacity"), 15),
    equipment: parseEquipment(formData.get("equipment")),
    status: (emptyToUndefined(formData.get("status")) ?? "ACTIVE") as
      | "ACTIVE"
      | "MAINTENANCE"
      | "INACTIVE",
    notes: emptyToUndefined(formData.get("notes")) ?? null,
    displayOrder: parseInteger(formData.get("displayOrder"), 0),
  };
}

function toCreate(c: z.infer<typeof roomSchema>): Prisma.RoomCreateInput {
  return {
    name: c.name,
    code: c.code,
    capacity: c.capacity,
    equipment: c.equipment,
    status: c.status,
    notes: c.notes ?? null,
    displayOrder: c.displayOrder,
    center: { connect: { id: c.centerId } },
  };
}

function toUpdate(c: z.infer<typeof roomSchema>): Prisma.RoomUpdateInput {
  return {
    name: c.name,
    code: c.code,
    capacity: c.capacity,
    equipment: c.equipment,
    status: c.status,
    notes: c.notes ?? null,
    displayOrder: c.displayOrder,
    center: { connect: { id: c.centerId } },
  };
}

export async function createRoom(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = roomSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.room.create({ data: toCreate(parsed.data) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Mã phòng đã tồn tại trong cơ sở này" };
    }
    return { error: "Lỗi cơ sở dữ liệu — không tạo được phòng" };
  }

  revalidatePath("/rooms");
  redirect("/rooms");
}

export async function updateRoom(id: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = roomSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.room.update({ where: { id }, data: toUpdate(parsed.data) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Mã phòng đã tồn tại trong cơ sở này" };
    }
    return { error: "Phòng không tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${id}/edit`);
  redirect("/rooms");
}

export async function deleteRoom(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.room.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá phòng này" };
  }
  revalidatePath("/rooms");
  return {};
}
