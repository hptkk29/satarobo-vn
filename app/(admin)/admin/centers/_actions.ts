"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = { error?: string };

const centerSchema = z.object({
  name: z.string().trim().min(1, "Tên cơ sở không được để trống"),
  address: z.string().trim().min(1, "Địa chỉ không được để trống"),
  phone: z.string().trim().optional(),
  email: z
    .union([z.string().trim().email("Email không hợp lệ"), z.literal("")])
    .optional(),
  isActive: z.boolean(),
});

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToNull(value: string | undefined): string | null {
  return value ?? null;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

function readForm(formData: FormData) {
  return {
    name: emptyToUndefined(formData.get("name")) ?? "",
    address: emptyToUndefined(formData.get("address")) ?? "",
    phone: emptyToUndefined(formData.get("phone")),
    email: emptyToUndefined(formData.get("email")) ?? "",
    isActive: formData.get("isActive") === "on",
  };
}

export async function createCenter(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = centerSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const c = parsed.data;
  const data: Prisma.CenterCreateInput = {
    name: c.name,
    address: c.address,
    phone: emptyToNull(c.phone),
    email: c.email ? c.email : null,
    isActive: c.isActive,
  };

  try {
    await db.center.create({ data });
  } catch {
    return { error: "Lỗi cơ sở dữ liệu — không tạo được cơ sở" };
  }

  revalidatePath("/admin/centers");
  revalidatePath("/lien-he");
  redirect("/admin/centers");
}

export async function updateCenter(id: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = centerSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const c = parsed.data;
  const data: Prisma.CenterUpdateInput = {
    name: c.name,
    address: c.address,
    phone: emptyToNull(c.phone),
    email: c.email ? c.email : null,
    isActive: c.isActive,
  };

  try {
    await db.center.update({ where: { id }, data });
  } catch {
    return { error: "Cơ sở không tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/admin/centers");
  revalidatePath(`/admin/centers/${id}/edit`);
  revalidatePath("/lien-he");
  redirect("/admin/centers");
}

export async function deleteCenter(id: string): Promise<ActionResult> {
  await requireAdmin();

  // Check linked relations — Center có quan hệ với users, leads, classes, students, employees.
  // Prisma onDelete mặc định Restrict — sẽ throw nếu có liên kết.
  // Đếm trước để báo lỗi rõ ràng.
  const counts = await db.center
    .findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            users: true,
            leads: true,
            classes: true,
            students: true,
            employees: true,
          },
        },
      },
    })
    .catch(() => null);

  if (counts) {
    const c = counts._count;
    const total = c.users + c.leads + c.classes + c.students + c.employees;
    if (total > 0) {
      return {
        error: `Không thể xoá — cơ sở đang liên kết: ${c.users} user, ${c.leads} lead, ${c.classes} lớp, ${c.students} HV, ${c.employees} nhân sự. Vui lòng chuyển liên kết trước.`,
      };
    }
  }

  try {
    await db.center.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá cơ sở này" };
  }

  revalidatePath("/admin/centers");
  revalidatePath("/lien-he");
  return {};
}

export async function toggleCenterActive(id: string, newValue: boolean): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.center.update({ where: { id }, data: { isActive: newValue } });
  } catch {
    return { error: "Không thể cập nhật trạng thái" };
  }
  revalidatePath("/admin/centers");
  revalidatePath("/lien-he");
  return {};
}
