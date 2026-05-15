"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = {
  error?: string;
};

const jsonArraySchema = z.array(z.unknown()).default([]);

const packageSchema = z.object({
  code: z.string().trim().min(1, "Code khong duoc de trong").optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, "Slug chi gom chu thuong, so va dau gach ngang")
    .optional(),
  name: z.string().trim().min(1, "Ten package khong duoc de trong"),
  shortName: z.string().trim().optional(),
  subtitle: z.string().trim().optional(),
  shortDescription: z.string().trim().optional(),
  description: z.string().trim().optional(),
  ageGroup: z.string().trim().optional(),
  level: z.string().trim().optional(),
  lessons: z.number().int().nonnegative().nullable(),
  duration: z.string().trim().optional(),
  priceOriginal: z.number().int().nonnegative().nullable(),
  priceEarlyBird: z.number().int().nonnegative().nullable(),
  priceMember: z.number().int().nonnegative().nullable(),
  features: jsonArraySchema,
  highlights: jsonArraySchema,
  curriculum: jsonArraySchema,
  badge: z.string().trim().optional(),
  color: z.string().trim().optional(),
  displayOrder: z.number().int(),
  isPublished: z.boolean(),
  isFeatured: z.boolean(),
  thumbnail: z.string().trim().optional(),
  seoTitle: z.string().trim().optional(),
  seoDescription: z.string().trim().optional(),
  parentCourseSlug: z.string().trim().optional(),
});

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToNull(value: string | undefined): string | null {
  return value ?? null;
}

function parseInteger(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseJsonArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    redirect("/admin/dashboard?error=unauthorized");
  }

  return session.user;
}

function readPackageForm(formData: FormData, includeCode: boolean) {
  const code = emptyToUndefined(formData.get("code"));
  const slug = emptyToUndefined(formData.get("slug"));

  return {
    code: includeCode ? code : undefined,
    slug,
    name: emptyToUndefined(formData.get("name")) ?? "",
    shortName: emptyToUndefined(formData.get("shortName")),
    subtitle: emptyToUndefined(formData.get("subtitle")),
    shortDescription: emptyToUndefined(formData.get("shortDescription")),
    description: emptyToUndefined(formData.get("description")),
    ageGroup: emptyToUndefined(formData.get("ageGroup")),
    level: emptyToUndefined(formData.get("level")),
    lessons: parseInteger(formData.get("lessons")),
    duration: emptyToUndefined(formData.get("duration")),
    priceOriginal: parseInteger(formData.get("priceOriginal")),
    priceEarlyBird: parseInteger(formData.get("priceEarlyBird")),
    priceMember: parseInteger(formData.get("priceMember")),
    features: parseJsonArray(formData.get("features")),
    highlights: parseJsonArray(formData.get("highlights")),
    curriculum: parseJsonArray(formData.get("curriculum")),
    badge: emptyToUndefined(formData.get("badge")),
    color: emptyToUndefined(formData.get("color")),
    displayOrder: parseInteger(formData.get("displayOrder")) ?? 0,
    isPublished: formData.get("isPublished") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    thumbnail: emptyToUndefined(formData.get("thumbnail")),
    seoTitle: emptyToUndefined(formData.get("seoTitle")),
    seoDescription: emptyToUndefined(formData.get("seoDescription")),
    parentCourseSlug: emptyToUndefined(formData.get("parentCourseSlug")),
  };
}

export async function createPackage(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = packageSchema.safeParse(readPackageForm(formData, true));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Du lieu khong hop le" };
  }

  const pkg = parsed.data;
  if (!pkg.code) return { error: "Code khong duoc de trong" };

  const data: Prisma.CoursePackageCreateInput = {
    code: pkg.code,
    slug: pkg.slug || slugify(pkg.code),
    name: pkg.name,
    shortName: emptyToNull(pkg.shortName),
    subtitle: emptyToNull(pkg.subtitle),
    shortDescription: emptyToNull(pkg.shortDescription),
    description: emptyToNull(pkg.description),
    ageGroup: emptyToNull(pkg.ageGroup),
    level: emptyToNull(pkg.level),
    lessons: pkg.lessons,
    duration: emptyToNull(pkg.duration),
    priceOriginal: pkg.priceOriginal,
    priceEarlyBird: pkg.priceEarlyBird,
    priceMember: pkg.priceMember,
    features: pkg.features as Prisma.InputJsonValue,
    highlights: pkg.highlights as Prisma.InputJsonValue,
    curriculum: pkg.curriculum as Prisma.InputJsonValue,
    badge: emptyToNull(pkg.badge),
    color: emptyToNull(pkg.color),
    displayOrder: pkg.displayOrder,
    isPublished: pkg.isPublished,
    isFeatured: pkg.isFeatured,
    thumbnail: emptyToNull(pkg.thumbnail),
    seoTitle: emptyToNull(pkg.seoTitle),
    seoDescription: emptyToNull(pkg.seoDescription),
    parentCourseSlug: emptyToNull(pkg.parentCourseSlug),
  };

  try {
    await db.coursePackage.create({ data });
  } catch {
    return { error: "Slug hoac code da ton tai, hoac co loi co so du lieu" };
  }

  revalidatePath("/admin/course-packages");
  redirect("/admin/course-packages");
}

export async function updatePackage(id: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = packageSchema.safeParse(readPackageForm(formData, false));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Du lieu khong hop le" };
  }

  const pkg = parsed.data;
  const data: Prisma.CoursePackageUpdateInput = {
    slug: pkg.slug || undefined,
    name: pkg.name,
    shortName: emptyToNull(pkg.shortName),
    subtitle: emptyToNull(pkg.subtitle),
    shortDescription: emptyToNull(pkg.shortDescription),
    description: emptyToNull(pkg.description),
    ageGroup: emptyToNull(pkg.ageGroup),
    level: emptyToNull(pkg.level),
    lessons: pkg.lessons,
    duration: emptyToNull(pkg.duration),
    priceOriginal: pkg.priceOriginal,
    priceEarlyBird: pkg.priceEarlyBird,
    priceMember: pkg.priceMember,
    features: pkg.features as Prisma.InputJsonValue,
    highlights: pkg.highlights as Prisma.InputJsonValue,
    curriculum: pkg.curriculum as Prisma.InputJsonValue,
    badge: emptyToNull(pkg.badge),
    color: emptyToNull(pkg.color),
    displayOrder: pkg.displayOrder,
    isPublished: pkg.isPublished,
    isFeatured: pkg.isFeatured,
    thumbnail: emptyToNull(pkg.thumbnail),
    seoTitle: emptyToNull(pkg.seoTitle),
    seoDescription: emptyToNull(pkg.seoDescription),
    parentCourseSlug: emptyToNull(pkg.parentCourseSlug),
  };

  try {
    await db.coursePackage.update({ where: { id }, data });
  } catch {
    return { error: "Package khong ton tai, slug bi trung, hoac co loi co so du lieu" };
  }

  revalidatePath("/admin/course-packages");
  revalidatePath(`/admin/course-packages/${id}/edit`);
  redirect("/admin/course-packages");
}

export async function deletePackage(id: string): Promise<ActionResult> {
  await requireAdmin();

  try {
    await db.coursePackage.delete({ where: { id } });
  } catch {
    return { error: "Khong the xoa package nay" };
  }

  revalidatePath("/admin/course-packages");
  return {};
}
