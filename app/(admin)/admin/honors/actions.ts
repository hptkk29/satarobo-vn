"use server";

import { auth } from "@/lib/auth";
import { assertCan } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  honorCreateSchema,
  timelineCreateSchema,
  sitePageContentUpdateSchema,
} from "@/lib/validators/honor";

function revalidatePublic(slug?: string) {
  revalidatePath("/honors");
  revalidatePath("/vinh-danh");
  revalidatePath("/vinh-danh/tat-ca");
  revalidatePath("/vinh-danh/spark");
  revalidatePath("/vinh-danh/growth");
  revalidatePath("/vinh-danh/impact");
  revalidatePath("/vinh-danh/grand-champion");
  if (slug) revalidatePath(`/vinh-danh/${slug}`);
}

// ─── Honors ─────────────────────────────────────────────────────────────────
export async function createHonorAction(input: unknown) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "honors:create");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = honorCreateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };

  // Verify Employee tồn tại
  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
  });
  if (!employee) return { ok: false, error: "Nhân sự không tồn tại" };

  const existing = await db.honor.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return { ok: false, error: "Slug đã tồn tại, vui lòng chọn slug khác" };

  // Nếu đặt isFeatured=true → bỏ featured của tất cả honors khác
  if (parsed.data.isFeatured) {
    await db.honor.updateMany({
      where: { isFeatured: true },
      data: { isFeatured: false },
    });
  }

  const honor = await db.honor.create({
    data: {
      ...parsed.data,
      // 2-phase: vẫn populate old fields cho code cũ fallback
      fullName: employee.fullName,
      jobTitle: parsed.data.jobTitleAtTime || employee.jobTitle,
      avatarUrl: employee.avatarUrl,
      yearsAtCompany: parsed.data.yearsAtTime,
      createdById: session.user.id,
    },
  });

  revalidatePublic(honor.slug);
  return { ok: true, id: honor.id };
}

export async function updateHonorAction(id: string, input: unknown) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "honors:edit");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = honorCreateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };

  const employee = await db.employee.findUnique({
    where: { id: parsed.data.employeeId },
  });
  if (!employee) return { ok: false, error: "Nhân sự không tồn tại" };

  if (parsed.data.isFeatured) {
    await db.honor.updateMany({
      where: { isFeatured: true, NOT: { id } },
      data: { isFeatured: false },
    });
  }

  const honor = await db.honor.update({
    where: { id },
    data: {
      ...parsed.data,
      fullName: employee.fullName,
      jobTitle: parsed.data.jobTitleAtTime || employee.jobTitle,
      avatarUrl: employee.avatarUrl,
      yearsAtCompany: parsed.data.yearsAtTime,
    },
  });

  revalidatePublic(honor.slug);
  return { ok: true };
}

export async function deleteHonorAction(id: string) {
  const session = await auth();
  if (!session?.user) return { ok: false };
  try {
    assertCan(session.user, "honors:delete");
  } catch {
    return { ok: false, error: "Chỉ SUPER_ADMIN được xoá" };
  }

  const honor = await db.honor.delete({ where: { id } });
  revalidatePublic(honor.slug);
  return { ok: true };
}

export async function toggleFeaturedAction(id: string) {
  const session = await auth();
  if (!session?.user) return { ok: false };
  try {
    assertCan(session.user, "honors:edit");
  } catch {
    return { ok: false };
  }

  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor) return { ok: false, error: "Không tìm thấy honor" };

  if (!honor.isFeatured) {
    await db.honor.updateMany({
      where: { isFeatured: true },
      data: { isFeatured: false },
    });
    await db.honor.update({
      where: { id },
      data: { isFeatured: true },
    });
  } else {
    await db.honor.update({
      where: { id },
      data: { isFeatured: false },
    });
  }

  revalidatePublic();
  return { ok: true };
}

export async function togglePublishedAction(id: string) {
  const session = await auth();
  if (!session?.user) return { ok: false };
  try {
    assertCan(session.user, "honors:edit");
  } catch {
    return { ok: false };
  }

  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor) return { ok: false };

  await db.honor.update({
    where: { id },
    data: { isPublished: !honor.isPublished },
  });

  revalidatePublic(honor.slug);
  return { ok: true };
}

// ─── Timeline ───────────────────────────────────────────────────────────────
export async function createTimelineAction(input: unknown) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "honors:create");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = timelineCreateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };

  const item = await db.timelineItem.create({
    data: {
      ...parsed.data,
      coverImageUrl: parsed.data.coverImageUrl || null,
    },
  });

  revalidatePath("/honors/timeline");
  revalidatePath("/vinh-danh");
  return { ok: true, id: item.id };
}

export async function updateTimelineAction(id: string, input: unknown) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "honors:edit");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = timelineCreateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };

  await db.timelineItem.update({
    where: { id },
    data: {
      ...parsed.data,
      coverImageUrl: parsed.data.coverImageUrl || null,
    },
  });

  revalidatePath("/honors/timeline");
  revalidatePath("/vinh-danh");
  return { ok: true };
}

export async function deleteTimelineAction(id: string) {
  const session = await auth();
  if (!session?.user) return { ok: false };
  try {
    assertCan(session.user, "honors:delete");
  } catch {
    return { ok: false, error: "Chỉ SUPER_ADMIN được xoá" };
  }

  await db.timelineItem.delete({ where: { id } });
  revalidatePath("/honors/timeline");
  revalidatePath("/vinh-danh");
  return { ok: true };
}

// ─── Site Page Content (Settings) ───────────────────────────────────────────
export async function updatePageContentAction(input: unknown) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "honors:settings");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = sitePageContentUpdateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };

  await db.sitePageContent.upsert({
    where: {
      pageKey_contentKey: {
        pageKey: parsed.data.pageKey,
        contentKey: parsed.data.contentKey,
      },
    },
    update: {
      contentValue: parsed.data.contentValue,
      updatedById: session.user.id,
    },
    create: {
      pageKey: parsed.data.pageKey,
      contentKey: parsed.data.contentKey,
      contentValue: parsed.data.contentValue,
      updatedById: session.user.id,
    },
  });

  revalidatePath("/honors/settings");
  if (parsed.data.pageKey === "honors") revalidatePath("/vinh-danh");
  return { ok: true };
}
