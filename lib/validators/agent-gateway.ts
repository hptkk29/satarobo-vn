// lib/validators/agent-gateway.ts — khuôn đầu vào của màn quản trị Cổng dữ liệu agent.
// Zod là nguồn sự thật; kiểu suy ra bằng `z.infer`.
import { z } from "zod";

/** Lý do là BẮT BUỘC ở mọi thao tác cấp/đổi quyền (spec §5.2) — đủ dài để đọc được. */
export const lyDo = z
  .string()
  .trim()
  .min(10, "Lý do tối thiểu 10 ký tự — người duyệt cần đọc được vì sao.")
  .max(500);

/** Mã TOTP 6 số của người thao tác (bước nâng xác thực 2 lớp). */
export const maXacThuc = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Mã xác thực gồm đúng 6 chữ số.");

/** "YYYY-MM-DD" (giờ VN) → hết ngày đó 23:59:59 +07:00. */
export const ngayHetHan = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hết hạn dạng YYYY-MM-DD.")
  .transform((s) => new Date(`${s}T23:59:59+07:00`))
  .refine((d) => !Number.isNaN(d.getTime()), "Ngày hết hạn không hợp lệ.");

export const taoClientSchema = z.object({
  ten: z.string().trim().min(3, "Tên tối thiểu 3 ký tự.").max(80),
  ipDuocPhep: z
    .array(z.string().trim().min(1))
    .min(1, "Agent chạy ngoài BẮT BUỘC khai ít nhất một IP (spec §4.2).")
    .max(20),
  vaiDichVu: z.string().trim().regex(/^AGENT_[A-Z0-9_]+$/, "Chỉ gán vai dịch vụ (mã bắt đầu bằng AGENT_)."),
  hetHan: ngayHetHan,
  lyDo,
  maXacThuc,
});
export type TaoClientInput = z.infer<typeof taoClientSchema>;

export const quyetDinhSchema = z.object({
  id: z.string().min(1),
  dongY: z.boolean(),
  ghiChu: z.string().trim().max(500).optional(),
  maXacThuc,
});
export type QuyetDinhInput = z.infer<typeof quyetDinhSchema>;

export const thaoTacClientSchema = z.object({
  id: z.string().min(1),
  lyDo,
});

export const thaoTacCoMaSchema = thaoTacClientSchema.extend({ maXacThuc });

export const sinhMatKhauSchema = z.object({ id: z.string().min(1), maXacThuc });

export const taoGrantSchema = z.object({
  clientId: z.string().min(1),
  congCu: z.string().trim().min(3),
  coSo: z.array(z.string().trim().min(1)).min(1, "Chọn ít nhất một cơ sở.").max(20),
  xemDuLieuGoc: z.boolean().default(false),
  hanMucNgay: z.number().int().min(1).max(100_000).nullable().optional(),
  hetHan: ngayHetHan,
  lyDo,
  maXacThuc,
});
export type TaoGrantInput = z.infer<typeof taoGrantSchema>;

export const congTacSchema = z.object({
  bat: z.boolean(),
  lyDo,
  /** Bắt buộc khi BẬT (mở cổng là thao tác cấp quyền); TẮT khẩn cấp thì không đòi. */
  maXacThuc: maXacThuc.optional(),
});

export const datLaiHaiLopSchema = z.object({ userId: z.string().min(1), lyDo, maXacThuc });
