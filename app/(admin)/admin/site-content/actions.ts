"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assertCan } from "@/lib/auth/permissions";

interface SaveInput {
  pageKey: string;
  contentKey: string;
  contentValue: string;
}

// Upsert SitePageContent row. Empty value → delete row (revert to fallback).
export async function saveSiteContentAction(
  input: SaveInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user, "honors:settings");
  } catch {
    return { ok: false, error: "Không có quyền" };
  }

  const { pageKey, contentKey, contentValue } = input;

  if (!pageKey || !contentKey) {
    return { ok: false, error: "Thiếu pageKey hoặc contentKey" };
  }

  if (!contentValue) {
    // Empty → delete row (fallback to default)
    await db.sitePageContent.deleteMany({ where: { pageKey, contentKey } });
  } else {
    await db.sitePageContent.upsert({
      where: { pageKey_contentKey: { pageKey, contentKey } },
      update: { contentValue, updatedById: session.user.id },
      create: { pageKey, contentKey, contentValue, updatedById: session.user.id },
    });
  }

  // Revalidate matching public path
  const pathMap: Record<string, string> = {
    home: "/",
    "khoa-hoc": "/khoa-hoc",
    "khoa-hoc/laptrinhrobot": "/khoa-hoc/laptrinhrobot",
    "khoa-hoc/luyenthirobosim": "/khoa-hoc/luyenthirobosim",
    "ve-chung-toi": "/ve-chung-toi",
    "tuyen-dung": "/tuyen-dung",
    "lien-he": "/lien-he",
    "hoc-cu": "/hoc-cu",
  };
  const publicPath = pathMap[pageKey];
  if (publicPath) revalidatePath(publicPath);
  revalidatePath("/site-content");

  return { ok: true };
}
