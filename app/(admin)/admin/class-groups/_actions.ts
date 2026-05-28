"use server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { classGroupCreateSchema } from "@/lib/validators/class-group";
import { genClassGroupCode } from "@/lib/codegen";

type ActionResult = { error?: string };

async function requireWrite(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const map = {
    create: "class_group:create",
    edit: "class_group:edit",
    delete: "class_group:delete",
  } as const;
  if (!can(session.user, map[action])) {
    redirect("/dashboard?error=unauthorized");
  }
  return session;
}

function readForm(formData: FormData) {
  const s = (name: string): string | undefined => {
    const v = formData.get(name);
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };
  return {
    displayCode: s("displayCode") ?? "",
    name: s("name"),
    centerId: s("centerId") ?? "",
    status: s("status") ?? "ACTIVE",
    notes: s("notes"),
  };
}

export async function createClassGroup(
  formData: FormData,
): Promise<ActionResult> {
  await requireWrite("create");

  const parsed = classGroupCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const center = await db.center.findUnique({
    where: { id: data.centerId },
    select: { code: true },
  });
  if (!center) return { error: "Cơ sở không tồn tại" };

  try {
    // Atomic: sinh code + tạo group trong cùng transaction.
    await db.$transaction(async (tx) => {
      const code = await genClassGroupCode(center.code ?? "CS", tx);
      await tx.classGroup.create({
        data: {
          code,
          displayCode: data.displayCode,
          name: data.name,
          centerId: data.centerId,
          status: data.status,
          notes: data.notes,
        },
      });
    });
  } catch {
    return { error: "Lỗi cơ sở dữ liệu — không tạo được nhóm lớp" };
  }

  revalidatePath("/class-groups");
  redirect("/class-groups");
}

export async function updateClassGroup(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireWrite("edit");

  const parsed = classGroupCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const existing = await db.classGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { error: "Nhóm lớp không tồn tại" };

  await db.classGroup.update({
    where: { id },
    data: {
      displayCode: data.displayCode,
      name: data.name,
      centerId: data.centerId,
      status: data.status,
      notes: data.notes,
    },
  });

  revalidatePath("/class-groups");
  revalidatePath(`/class-groups/${id}`);
  redirect("/class-groups");
}

export async function deleteClassGroup(id: string): Promise<ActionResult> {
  await requireWrite("delete");
  await db.classGroup.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/class-groups");
  return {};
}
