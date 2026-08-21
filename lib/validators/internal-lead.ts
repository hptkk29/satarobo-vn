// lib/validators/internal-lead.ts — G-D (biên bản chốt 4 cổng, 21/08/2026).
//
// Biểu mẫu "Nhập khách hàng" bản có đăng nhập. Tách khỏi file `"use server"` vì
// file Server Action chỉ được export hàm async — export một `const` schema ở đó
// làm vỡ toàn bộ action trong module lúc chạy.
//
// KHÔNG có trường mã nhân viên: danh tính người nhập lấy từ phiên đăng nhập.
import { z } from "zod";
import { phoneVn } from "./phone";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const internalLeadSchema = z.object({
  // Ít nhất một trong hai: tên phụ huynh hoặc tên bé (mapper kiểm lại lần nữa).
  parentName: optionalText(120),
  childName: optionalText(120),
  phone: phoneVn,
  schoolName: optionalText(160),
  gradeLevel: optionalText(40),
  /** `Center.code` chọn từ danh sách thật; để trống thì hệ thống tự chia cơ sở. */
  centerCode: optionalText(20),
  email: optionalText(160),
  note: optionalText(2000),
});

export type InternalLeadInput = z.infer<typeof internalLeadSchema>;

/**
 * Kết quả trả về của `createInternalLeadAction`.
 *
 * ⚠️ Kiểu này BẮT BUỘC nằm ngoài file `"use server"`: loader của Next sinh
 * export VALUE cho mọi export trong module Server Action, nên một `export type`
 * ở đó thành `ReferenceError` lúc chạy và **giết toàn bộ action trong module**
 * — lỗi đã xảy ra thật trong repo này, không phải lo xa.
 */
export type InternalLeadResult = {
  ok: boolean;
  leadId?: string;
  /** Trùng SĐT trong cửa sổ chống trùng ⇒ KHÔNG tạo lead mới. */
  duplicate?: boolean;
  /** Trùng SĐT nhưng khác con ⇒ đã gắn thêm con vào khách cũ. */
  childAdded?: boolean;
  error?: string;
  /** Chuyện bất thường nhưng không đủ để từ chối — hiện cho người nhập thấy. */
  warnings?: string[];
};
