// app/(admin)/admin/lop-trial/_lib/schemas.ts — GĐ2.
//
// Zod schema + helper giờ VN riêng cho màn "Lớp Trial". CỐ Ý không dùng lại
// `lib/validators/trial.ts`: schema cũ nhận `scheduledAt` là chuỗi ISO do CLIENT dựng
// từ `new Date(...)`, tức phụ thuộc múi giờ máy người dùng. Màn mới đổi hợp đồng sang
// `scheduledAtVn` là chuỗi đồng hồ VN và để SERVER quy đổi bằng `lib/time/vn.ts`.
//
// File này THUẦN (không chạm DB, không server-only) để test được bằng vitest.
import { z } from "zod";
import { vnDateAt, vnParts } from "@/lib/time/vn";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** Định dạng của `<input type="datetime-local">`. */
const YMD_HM = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

// ─── Giờ VN: đổi qua lại giữa Date và chuỗi ô nhập ───────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Date → "YYYY-MM-DDTHH:mm" theo đồng hồ VN, để đổ vào `<input type="datetime-local">`.
 * KHÔNG dùng `getFullYear()`/`getHours()` vì chúng đọc múi giờ của tiến trình
 * (Vercel chạy UTC, máy dev +07) — đó chính là bug đang có ở màn cũ.
 */
export function toVnInput(d: Date): string {
  const p = vnParts(d);
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DDTHH:mm" (đồng hồ VN) → Date. Sai định dạng → null. */
export function parseVnInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = vnDateAt(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Mặt phẳng V2 ────────────────────────────────────────────────────────────

export const configSchema = z.object({
  name: z.string().trim().min(1, "Tên cấu hình bắt buộc").max(120),
  sessionCount: z.coerce
    .number()
    .int("Số buổi phải là số nguyên")
    .min(1, "Số buổi phải ≥ 1")
    .max(60, "Số buổi quá lớn"),
});

export const createClassSchema = z
  .object({
    name: z.string().trim().min(1, "Tên lớp bắt buộc").max(160),
    centerId: z.string().trim().min(1, "Chọn cơ sở"),
    roomId: z.string().trim().min(1).nullable().optional(),
    teacherId: z.string().trim().min(1).nullable().optional(),
    // QĐ-R2-1: lớp là slot tái sử dụng → KHÔNG có ngày khai giảng, số buổi nhập thẳng.
    sessionCount: z.coerce
      .number()
      .int("Số buổi phải là số nguyên")
      .min(1, "Số buổi phải ≥ 1")
      .max(20, "Số buổi quá lớn"),
    startTime: z.string().regex(HHMM, "Giờ bắt đầu không hợp lệ"),
    endTime: z.string().regex(HHMM, "Giờ kết thúc không hợp lệ"),
    capacity: z.coerce
      .number()
      .int("Sĩ số phải là số nguyên")
      .min(1, "Sĩ số phải ≥ 1")
      .max(100, "Sĩ số quá lớn"),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endTime"],
  });

export const addSessionSchema = z
  .object({
    trialClassId: z.string().trim().min(1, "Thiếu lớp trải nghiệm"),
    date: z.string().regex(YMD, "Ngày buổi học không hợp lệ"),
    startTime: z.string().regex(HHMM, "Giờ bắt đầu không hợp lệ"),
    endTime: z.string().regex(HHMM, "Giờ kết thúc không hợp lệ"),
    // Bỏ trống → kế thừa GV/phòng của lớp (service tự fallback).
    teacherId: z.string().trim().min(1).nullable().optional(),
    roomId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endTime"],
  });

export const attendanceSchema = z.object({
  trialSessionId: z.string().trim().min(1, "Thiếu buổi học"),
  records: z
    .array(
      z.object({
        trialEnrollmentId: z.string().trim().min(1),
        status: z.enum(["PRESENT", "ABSENT"]),
        note: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .min(1, "Chưa có học viên để điểm danh"),
});

// ─── Mặt phẳng V1 ────────────────────────────────────────────────────────────

const nullableStr = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === "" ? null : v));

export const updateBookingSchema = z.object({
  // Hợp đồng MỚI (khác `lib/validators/trial.ts`): chuỗi đồng hồ VN, không phải ISO.
  scheduledAtVn: z.string().regex(YMD_HM, "Thời gian không hợp lệ"),
  status: z.enum([
    "SCHEDULED",
    "CONFIRMED",
    "ATTENDED",
    "MISSED",
    "POSTPONED",
    "ENROLLED",
    "REJECTED",
  ]),
  teacherId: nullableStr,
  roomId: nullableStr,
  classId: nullableStr,
  notes: z.string().trim().max(2000).nullable().optional().transform((v) => (v ? v : null)),
});

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
