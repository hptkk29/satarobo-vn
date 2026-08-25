// lib/validators/table-preference.ts — G-04: cửa vào của Server Action lưu tuỳ chọn cột.
//
// Nguyên tắc: chặn khoá SAI ĐỊNH DẠNG, KHÔNG chặn khoá LẠ.
// Chặn khoá lạ nghe có vẻ chặt hơn nhưng nó khoá cứng người dùng ra khỏi màn hình
// của chính họ: một cột bị gỡ khỏi hệ thống ⇒ cấu hình cũ mang khoá đó ⇒ bấm Lưu
// là báo lỗi và không có cách nào sửa. Việc dọn khoá lạc thuộc về
// `normalizeColumnsForSave` (lib/tables/column-preference.ts), chạy SAU cửa này.
//
// `userId` CỐ Ý không có trong lược đồ: chủ sở hữu luôn lấy từ phiên đăng nhập.
// Zod mặc định loại bỏ khoá lạ, nên payload có nhét `userId` thì nó rơi ngay ở đây.
import { z } from "zod";
import { TABLE_KEYS } from "@/lib/tables/lead-columns";

/** Trần 64 phần tử: chặn nhồi JSON vào cột `columns`. */
const MAX_COLUMNS = 64;

const columnKeySchema = z
  .string()
  .min(1, "Khoá cột rỗng")
  .max(64, "Khoá cột quá dài")
  // Chữ/số/gạch dưới/gạch ngang + dấu chấm phân tầng (`child.fullName`).
  .regex(/^[A-Za-z0-9_.-]+$/, "Khoá cột sai định dạng");

export const tableColumnsInputSchema = z.object({
  tableKey: z.enum(TABLE_KEYS),
  visible: z
    .array(columnKeySchema)
    .min(1, "Phải giữ lại ít nhất một cột")
    .max(MAX_COLUMNS, "Quá nhiều cột")
    .refine((ks) => new Set(ks).size === ks.length, "Danh sách cột bị trùng"),
});

export type TableColumnsInput = z.infer<typeof tableColumnsInputSchema>;

export const tableKeyOnlySchema = z.object({ tableKey: z.enum(TABLE_KEYS) });
