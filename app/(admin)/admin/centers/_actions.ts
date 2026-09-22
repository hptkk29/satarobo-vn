"use server";

import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type ActionResult = { error?: string };

const centerSchema = z.object({
  name: z.string().trim().min(1, "Tên cơ sở không được để trống"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug không được để trống")
    .regex(/^[a-z0-9-]+$/, "Slug chỉ chứa chữ thường, số và dấu gạch"),
  address: z.string().trim().min(1, "Địa chỉ không được để trống"),
  ward: z.string().trim().optional(),
  district: z.string().trim().optional(),
  city: z.string().trim().min(1, "Tỉnh/TP không được để trống"),
  phone: z.string().trim().optional(),
  email: z
    .union([z.string().trim().email("Email không hợp lệ"), z.literal("")])
    .optional(),
  googleMapUrl: z.string().trim().optional(),
  workingHours: z.string().trim().optional(),
  managerName: z.string().trim().optional(),
  logoUrl: z.string().trim().optional(),
  bannerUrl: z.string().trim().optional(),
  description: z.string().trim().optional(),
  isActive: z.boolean(),
  displayOrder: z.number().int().default(0),
  // Phase NHÓM 4 — geofence chấm công.
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  allowedRadiusMeters: z.number().int().min(10).max(5000).nullable(),
});

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function parseInteger(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseFloatOrNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function parseIntOrNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

// Quản trị tổ chức (tạo/sửa/xoá/đổi trạng thái Center) là cấu trúc tổ chức →
// SUPER_ADMIN-only (Doc 15: chỉ SUPER_ADMIN tạo/sửa cấu trúc tổ chức). `centers:edit`
// trong ma trận quyền = ["SUPER_ADMIN"]. Trước đây gate cho cả CENTER_MANAGER ⇒
// BẤT KỲ CM nào sửa/xoá Center BẤT KỲ qua id (Center ∉ SCOPED_MODELS, không cách ly).
//
// RBAC-DECISION #5 (06/07): Center ∈ SCOPE_EXEMPT (ranh giới tenant, không tự scope) →
// scopedDb pass-through, hành vi y nguyên; lớp bảo vệ là gate `centers:edit` ở trên.
async function requireOrgAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("centers:edit"))) {
    redirect("/dashboard?error=unauthorized");
  }
  const actor = await resolveActor(session.user.id);
  return { user: session.user, sdb: scopedDb(actor) };
}

function readForm(formData: FormData) {
  return {
    name: emptyToUndefined(formData.get("name")) ?? "",
    slug: emptyToUndefined(formData.get("slug")) ?? "",
    address: emptyToUndefined(formData.get("address")) ?? "",
    ward: emptyToUndefined(formData.get("ward")),
    district: emptyToUndefined(formData.get("district")),
    city: emptyToUndefined(formData.get("city")) ?? "",
    phone: emptyToUndefined(formData.get("phone")),
    email: emptyToUndefined(formData.get("email")) ?? "",
    googleMapUrl: emptyToUndefined(formData.get("googleMapUrl")),
    workingHours: emptyToUndefined(formData.get("workingHours")),
    managerName: emptyToUndefined(formData.get("managerName")),
    logoUrl: emptyToUndefined(formData.get("logoUrl")),
    bannerUrl: emptyToUndefined(formData.get("bannerUrl")),
    description: emptyToUndefined(formData.get("description")),
    isActive: formData.get("isActive") === "on",
    displayOrder: parseInteger(formData.get("displayOrder")),
    latitude: parseFloatOrNull(formData.get("latitude")),
    longitude: parseFloatOrNull(formData.get("longitude")),
    allowedRadiusMeters: parseIntOrNull(formData.get("allowedRadiusMeters")),
  };
}

function toData(c: z.infer<typeof centerSchema>): Prisma.CenterCreateInput {
  return {
    name: c.name,
    slug: c.slug,
    address: c.address,
    ward: emptyToNull(c.ward),
    district: emptyToNull(c.district),
    city: c.city,
    phone: emptyToNull(c.phone),
    email: c.email ? c.email : null,
    googleMapUrl: emptyToNull(c.googleMapUrl),
    workingHours: emptyToNull(c.workingHours),
    managerName: emptyToNull(c.managerName),
    logoUrl: emptyToNull(c.logoUrl),
    bannerUrl: emptyToNull(c.bannerUrl),
    description: emptyToNull(c.description),
    isActive: c.isActive,
    displayOrder: c.displayOrder,
    latitude: c.latitude,
    longitude: c.longitude,
    allowedRadiusMeters: c.allowedRadiusMeters,
  };
}

export async function createCenter(formData: FormData): Promise<ActionResult> {
  const { sdb } = await requireOrgAdmin();

  const parsed = centerSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await sdb.center.create({ data: toData(parsed.data) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Slug đã tồn tại — chọn slug khác" };
    }
    return { error: "Lỗi cơ sở dữ liệu — không tạo được cơ sở" };
  }

  revalidatePath("/centers");
  revalidatePath("/lien-he");
  // Thành công → trả {} để client toast + điều hướng (QA 20/07 — không redirect âm thầm).
  return {};
}

export async function updateCenter(id: string, formData: FormData): Promise<ActionResult> {
  const { sdb } = await requireOrgAdmin();

  const parsed = centerSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await sdb.center.update({ where: { id }, data: toData(parsed.data) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Slug đã tồn tại — chọn slug khác" };
    }
    return { error: "Cơ sở không tồn tại hoặc lỗi cơ sở dữ liệu" };
  }

  revalidatePath("/centers");
  revalidatePath(`/centers/${id}/edit`);
  revalidatePath("/lien-he");
  return {};
}

export async function deleteCenter(id: string): Promise<ActionResult> {
  const { sdb } = await requireOrgAdmin();

  // Check linked relations — Center có quan hệ với users, leads, classes, students, employees.
  // Prisma onDelete mặc định Restrict — sẽ throw nếu có liên kết.
  // Đếm trước để báo lỗi rõ ràng.
  const counts = await sdb.center
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
            // 30/08/2026 — phương thức thanh toán RIÊNG của cơ sở. FK là RESTRICT ở tầng
            // DB, nên thiếu dòng này thì xoá cơ sở chỉ còn phương thức treo sẽ ném lỗi
            // Prisma và người dùng nhận câu "Không thể xoá cơ sở này" không nói vì sao.
            paymentMethods: true,
          },
        },
      },
    })
    .catch(() => null);

  if (counts) {
    const c = counts._count;
    const total =
      c.users + c.leads + c.classes + c.students + c.employees + c.paymentMethods;
    if (total > 0) {
      return {
        error: `Không thể xoá — cơ sở đang liên kết: ${c.users} user, ${c.leads} lead, ${c.classes} lớp, ${c.students} HV, ${c.employees} nhân sự, ${c.paymentMethods} phương thức thanh toán. Vui lòng chuyển liên kết trước.`,
      };
    }
  }

  try {
    await sdb.center.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá cơ sở này" };
  }

  revalidatePath("/centers");
  revalidatePath("/lien-he");
  return {};
}

export async function toggleCenterActive(id: string, newValue: boolean): Promise<ActionResult> {
  const { sdb } = await requireOrgAdmin();
  try {
    await sdb.center.update({ where: { id }, data: { isActive: newValue } });
  } catch {
    return { error: "Không thể cập nhật trạng thái" };
  }
  revalidatePath("/centers");
  revalidatePath("/lien-he");
  return {};
}
