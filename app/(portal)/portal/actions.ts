"use server";

import { cookies } from "next/headers";
import {
  assertOwnsStudent,
  makeActiveSiteToken,
  ACTIVE_SITE_COOKIE,
} from "@/lib/portal/session";

// Phase T2.2 — đổi "site con" đang xem. Verify ownership server-side trước khi
// ghi cookie đã ký.
export async function setActiveSite(
  studentId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await assertOwnsStudent(studentId))) {
    return { ok: false, error: "Không có quyền chọn học viên này" };
  }

  (await cookies()).set(ACTIVE_SITE_COOKIE, makeActiveSiteToken(studentId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}
