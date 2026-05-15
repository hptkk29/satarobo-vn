"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = { error?: string };

const recruitmentSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, "Slug chỉ gồm chữ thường, số và dấu gạch ngang")
    .optional(),
  title: z.string().trim().min(1, "Tiêu đề không được để trống"),
  department: z.string().trim().min(1, "Phòng ban không được để trống"),
  location: z.string().trim().min(1, "Địa điểm không được để trống"),
  workingHours: z.string().trim().optional(),
  salaryRange: z.string().trim().optional(),
  jobType: z.string().trim().min(1, "Hình thức không được để trống"),
  experienceLevel: z.string().trim().optional(),
  summary: z.string().trim().min(1, "Mô tả tổng quan không được để trống"),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  contactEmail: z.string().trim().email("Email không hợp lệ"),
  contactPhone: z.string().trim().min(1, "Số điện thoại không được để trống"),
  isPublished: z.boolean(),
  isFeatured: z.boolean(),
  displayOrder: z.number().int(),
});

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToNull(value: string | undefined): string | null {
  return value ?? null;
}

function parseInteger(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseStringArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "MANAGER" && role !== "HR") {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

function readForm(formData: FormData) {
  return {
    slug: emptyToUndefined(formData.get("slug")),
    title: emptyToUndefined(formData.get("title")) ?? "",
    department: emptyToUndefined(formData.get("department")) ?? "",
    location: emptyToUndefined(formData.get("location")) ?? "",
    workingHours: emptyToUndefined(formData.get("workingHours")),
    salaryRange: emptyToUndefined(formData.get("salaryRange")),
    jobType: emptyToUndefined(formData.get("jobType")) ?? "",
    experienceLevel: emptyToUndefined(formData.get("experienceLevel")),
    summary: emptyToUndefined(formData.get("summary")) ?? "",
    responsibilities: parseStringArray(formData.get("responsibilities")),
    requirements: parseStringArray(formData.get("requirements")),
    benefits: parseStringArray(formData.get("benefits")),
    contactEmail: emptyToUndefined(formData.get("contactEmail")) ?? "",
    contactPhone: emptyToUndefined(formData.get("contactPhone")) ?? "",
    isPublished: formData.get("isPublished") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    displayOrder: parseInteger(formData.get("displayOrder")),
  };
}

export async function createRecruitment(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = recruitmentSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const r = parsed.data;
  const data: Prisma.RecruitmentCreateInput = {
    slug: r.slug || slugify(r.title),
    title: r.title,
    department: r.department,
    location: r.location,
    workingHours: emptyToNull(r.workingHours),
    salaryRange: emptyToNull(r.salaryRange),
    jobType: r.jobType,
    experienceLevel: emptyToNull(r.experienceLevel),
    summary: r.summary,
    responsibilities: r.responsibilities as Prisma.InputJsonValue,
    requirements: r.requirements as Prisma.InputJsonValue,
    benefits: r.benefits as Prisma.InputJsonValue,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    isPublished: r.isPublished,
    isFeatured: r.isFeatured,
    displayOrder: r.displayOrder,
  };

  try {
    await db.recruitment.create({ data });
  } catch {
    return { error: "Slug đã tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/admin/recruitment");
  revalidatePath("/tuyen-dung");
  redirect("/admin/recruitment");
}

export async function updateRecruitment(id: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = recruitmentSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const r = parsed.data;
  const data: Prisma.RecruitmentUpdateInput = {
    slug: r.slug || undefined,
    title: r.title,
    department: r.department,
    location: r.location,
    workingHours: emptyToNull(r.workingHours),
    salaryRange: emptyToNull(r.salaryRange),
    jobType: r.jobType,
    experienceLevel: emptyToNull(r.experienceLevel),
    summary: r.summary,
    responsibilities: r.responsibilities as Prisma.InputJsonValue,
    requirements: r.requirements as Prisma.InputJsonValue,
    benefits: r.benefits as Prisma.InputJsonValue,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    isPublished: r.isPublished,
    isFeatured: r.isFeatured,
    displayOrder: r.displayOrder,
  };

  try {
    await db.recruitment.update({ where: { id }, data });
  } catch {
    return { error: "Vị trí không tồn tại, slug trùng, hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/admin/recruitment");
  revalidatePath(`/admin/recruitment/${id}/edit`);
  revalidatePath("/tuyen-dung");
  revalidatePath(`/tuyen-dung/${r.slug || ""}`);
  redirect("/admin/recruitment");
}

export async function deleteRecruitment(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.recruitment.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá vị trí này" };
  }
  revalidatePath("/admin/recruitment");
  revalidatePath("/tuyen-dung");
  return {};
}

export async function toggleRecruitmentPublished(id: string, newValue: boolean): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.recruitment.update({
      where: { id },
      data: { isPublished: newValue },
    });
  } catch {
    return { error: "Không thể cập nhật trạng thái" };
  }
  revalidatePath("/admin/recruitment");
  revalidatePath("/tuyen-dung");
  return {};
}
