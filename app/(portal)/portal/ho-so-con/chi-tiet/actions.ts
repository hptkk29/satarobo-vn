"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActiveStudent } from "@/lib/portal/session";
import { updateChildDetail } from "@/lib/portal/child-detail";

// Portal v2 — phụ huynh sửa hồ sơ CON ĐANG CHỌN (requireActiveStudent đã verify quyền
// sở hữu). Chỉ cho sửa trường "mềm" — mã HV / lớp / khoá do admin quản lý (chỉ xem).
const schema = z.object({
  dateOfBirth: z.string().trim().optional().default(""),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullish(),
  currentGrade: z.coerce.number().int().min(1).max(12).nullish(),
  school: z.string().trim().max(160).optional().default(""),
  healthNotes: z.string().trim().max(1000).optional().default(""),
  allergies: z.array(z.string().trim()).optional().default([]),
  notes: z.string().trim().max(1000).optional().default(""),
});

export async function updateChildProfile(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const { studentId } = await requireActiveStudent();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
  const nz = (s: string) => (s.length ? s : null);

  let dob: Date | null = null;
  if (d.dateOfBirth) {
    const t = new Date(d.dateOfBirth);
    if (Number.isNaN(t.getTime())) return { ok: false, error: "Ngày sinh không hợp lệ" };
    dob = t;
  }

  await updateChildDetail(studentId, {
    dateOfBirth: dob,
    gender: d.gender ?? null,
    currentGrade: d.currentGrade ?? null,
    school: nz(d.school),
    healthNotes: nz(d.healthNotes),
    allergies: d.allergies.filter((a) => a.length > 0),
    notes: nz(d.notes),
  });

  revalidatePath("/portal/ho-so-con/chi-tiet");
  revalidatePath("/portal/ho-so-con");
  return { ok: true };
}
