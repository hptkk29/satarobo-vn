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

/**
 * Tạo lớp trải nghiệm — 28/08: chỉ còn CƠ SỞ + KHOÁ TRẢI NGHIỆM.
 *
 * Tên lớp KHÔNG nhận từ client: server tự sinh theo quy ước `Cơ sở_Lớp trial số`
 * (`tenLopTrial` trong `lib/trial/lop-moi.ts`). Cho client gửi tên là mời hai lớp trùng
 * tên và mời người sửa tay lệch khỏi quy ước.
 *
 * Giờ / phòng / giáo viên / sĩ số ĐÃ RỜI khỏi đây — chúng là thuộc tính của TỪNG BUỔI.
 * `sessionCount` cũng bỏ: số buổi nay là số buổi ĐÃ THÊM, không phải một con số khai
 * trước rồi không ai đối chiếu.
 */
export const createClassSchema = z.object({
  centerId: z.string().trim().min(1, "Chọn cơ sở"),
  courseId: z.string().trim().min(1).nullable().optional(),
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

/**
 * SỬA một buổi đã tạo (28/08/2026): ngày · giờ · phòng · giáo viên.
 *
 * `reason` BẮT BUỘC — chủ dự án: "nếu sửa lịch học của buổi thì cần xác nhận và ghi
 * chú là dời lịch". Lý do không phải để lưu trữ cho đẹp: nó là NỘI DUNG thông báo đẩy
 * sang giáo viên. Cho phép bỏ trống thì giáo viên nhận một tin "buổi đã đổi" trống
 * rỗng và phải đi hỏi lại từng người.
 */
export const updateSessionSchema = z
  .object({
    sessionId: z.string().trim().min(1, "Thiếu buổi học"),
    date: z.string().regex(YMD, "Ngày buổi học không hợp lệ"),
    startTime: z.string().regex(HHMM, "Giờ bắt đầu không hợp lệ"),
    endTime: z.string().regex(HHMM, "Giờ kết thúc không hợp lệ"),
    roomId: z.string().trim().min(1).nullable().optional(),
    teacherId: z.string().trim().min(1).nullable().optional(),
    reason: z.string().trim().min(3, "Ghi rõ lý do dời lịch (ít nhất 3 ký tự)").max(500),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endTime"],
  });

/** HUỶ một buổi. Lý do bắt buộc, và đi thẳng vào thông báo gửi giáo viên. */
export const cancelSessionSchema = z.object({
  sessionId: z.string().trim().min(1, "Thiếu buổi học"),
  reason: z.string().trim().min(3, "Ghi rõ lý do huỷ buổi (ít nhất 3 ký tự)").max(500),
});
