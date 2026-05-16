"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { classCreateSchema } from "@/lib/validators/class";

type ActionResult = { error?: string };

async function requireClassWrite(action: "create" | "update" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user, action, "class")) {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

function toCreateData(
  parsed: ReturnType<typeof classCreateSchema.parse>,
): Prisma.ClassCreateInput {
  const {
    courseId,
    centerId,
    roomId,
    teacherId,
    assistantId,
    ...rest
  } = parsed;

  return {
    ...rest,
    course: { connect: { id: courseId } },
    center: { connect: { id: centerId } },
    ...(roomId ? { room: { connect: { id: roomId } } } : {}),
    ...(teacherId ? { teacher: { connect: { id: teacherId } } } : {}),
    ...(assistantId ? { assistant: { connect: { id: assistantId } } } : {}),
  };
}

function toUpdateData(
  parsed: ReturnType<typeof classCreateSchema.parse>,
): Prisma.ClassUpdateInput {
  const {
    courseId,
    centerId,
    roomId,
    teacherId,
    assistantId,
    ...rest
  } = parsed;

  return {
    ...rest,
    course: { connect: { id: courseId } },
    center: { connect: { id: centerId } },
    room: roomId ? { connect: { id: roomId } } : { disconnect: true },
    teacher: teacherId ? { connect: { id: teacherId } } : { disconnect: true },
    assistant: assistantId
      ? { connect: { id: assistantId } }
      : { disconnect: true },
  };
}

function readForm(formData: FormData) {
  const scheduleDaysRaw = formData.getAll("scheduleDays");
  const scheduleDays = scheduleDaysRaw
    .map((v) => (typeof v === "string" ? parseInt(v, 10) : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);

  function s(name: string): string | undefined {
    const v = formData.get(name);
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }

  return {
    name: s("name") ?? "",
    classCode: s("classCode"),
    description: s("description"),

    courseId: s("courseId") ?? "",
    centerId: s("centerId") ?? "",
    roomId: s("roomId"),
    teacherId: s("teacherId"),
    assistantId: s("assistantId"),

    startDate: s("startDate"),
    endDate: s("endDate"),
    scheduleDays,
    startTime: s("startTime"),
    endTime: s("endTime"),

    maxStudents: s("maxStudents") ?? 20,
    minStudents: s("minStudents") ?? 5,

    status: s("status") ?? "PLANNED",
    notes: s("notes"),
    schedule: s("schedule"),
  };
}

export async function createClass(formData: FormData): Promise<ActionResult> {
  await requireClassWrite("create");

  const raw = readForm(formData);
  const parsed = classCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.class.create({ data: toCreateData(parsed.data) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Mã lớp đã tồn tại" };
    }
    return { error: "Lỗi cơ sở dữ liệu — không tạo được lớp" };
  }

  revalidatePath("/admin/classes");
  redirect("/admin/classes");
}

export async function updateClass(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireClassWrite("update");

  const raw = readForm(formData);
  const parsed = classCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.class.update({
      where: { id },
      data: toUpdateData(parsed.data),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Mã lớp đã tồn tại" };
    }
    return { error: "Lớp không tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${id}/edit`);
  redirect("/admin/classes");
}

export async function deleteClass(id: string): Promise<ActionResult> {
  await requireClassWrite("delete");
  try {
    await db.class.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { error: "Không thể xoá lớp này" };
  }
  revalidatePath("/admin/classes");
  return {};
}
