// lib/crm/dedupe.ts — R7-05 §8.4: dedupe parent (email + phone, 3 nhánh) + student
// (parent + tên chuẩn hoá + DOB). Logic phân loại THUẦN (test được); lookup DB tách riêng.
import { db } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";
import { canonicalPhone, phoneVariants } from "@/lib/phone";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Chuẩn hoá tên: trim + gộp khoảng trắng + casefold. THUẦN. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Chuẩn hoá SĐT → canonical `84XXXXXXXXX`. THUẦN.
 * AUTH-SĐT P1 — trước đây chỉ giữ chữ số nên `0905…` và `84905…` là 2 khoá khác
 * nhau, tức dedupe phụ huynh bỏ sót đúng những cặp trùng thật.
 */
export function normalizePhone(s: string | null | undefined): string {
  return canonicalPhone(s) ?? (s ?? "").replace(/\D/g, "");
}

export type ParentMatch =
  | { kind: "none" }
  | { kind: "reuse"; userId: string }
  | { kind: "conflict"; parentAId: string; parentBId: string };

/**
 * 3 nhánh dedupe parent (THUẦN — SRS §8.4):
 * - không khớp → none (tạo mới).
 * - chỉ 1 trong 2 khớp, hoặc cả 2 khớp CÙNG 1 hồ sơ → reuse.
 * - email∈A & phone∈B (KHÁC nhau) → conflict (khoá convert, Admin xử lý).
 */
export function classifyParentMatch(
  byEmailId: string | null,
  byPhoneId: string | null,
): ParentMatch {
  if (!byEmailId && !byPhoneId) return { kind: "none" };
  if (byEmailId && byPhoneId) {
    return byEmailId === byPhoneId
      ? { kind: "reuse", userId: byEmailId }
      : { kind: "conflict", parentAId: byEmailId, parentBId: byPhoneId };
  }
  return { kind: "reuse", userId: (byEmailId ?? byPhoneId) as string };
}

/** Tìm parent theo email (User.email) + phone (Student.parentPhone → parentUserId). */
export async function findParentMatch(
  input: { email?: string | null; phone?: string | null },
  client: DbClient = db,
): Promise<ParentMatch> {
  const email = (input.email ?? "").trim().toLowerCase();
  // AUTH-SĐT P1 — tra cả dạng canonical mới lẫn `0…` cũ (xem `phoneVariants`).
  const variants = phoneVariants(input.phone);
  const [byEmail, byPhoneStudent] = await Promise.all([
    email ? client.user.findFirst({ where: { email }, select: { id: true } }) : null,
    variants.length
      ? client.student.findFirst({
          where: {
            parentPhone: { in: variants },
            parentUserId: { not: null },
            deletedAt: null,
          },
          select: { parentUserId: true },
        })
      : null,
  ]);
  return classifyParentMatch(byEmail?.id ?? null, byPhoneStudent?.parentUserId ?? null);
}

/** So khớp 1 student ứng viên với student cũ (THUẦN): cùng tên chuẩn hoá + DOB. */
export function studentMatches(
  a: { name: string; dob: Date | null },
  b: { name: string; dob: Date | null },
): boolean {
  if (normalizeName(a.name) !== normalizeName(b.name)) return false;
  const ad = a.dob?.toISOString().slice(0, 10) ?? null;
  const bd = b.dob?.toISOString().slice(0, 10) ?? null;
  return ad === bd;
}

/**
 * Tìm student trùng CÙNG PARENT (chỉ same-parent — §6): tên chuẩn hoá + DOB.
 * Trả về studentId cũ để chỉ tạo Enrollment mới (AC4). null = không trùng.
 */
export async function findExistingStudent(
  input: { parentUserId: string; name: string; dob: Date | null },
  client: DbClient = db,
): Promise<string | null> {
  if (!input.parentUserId) return null;
  const candidates = await client.student.findMany({
    where: { parentUserId: input.parentUserId, deletedAt: null },
    select: { id: true, name: true, dateOfBirth: true },
  });
  const hit = candidates.find((c) =>
    studentMatches({ name: input.name, dob: input.dob }, { name: c.name, dob: c.dateOfBirth }),
  );
  return hit?.id ?? null;
}
