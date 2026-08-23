// lib/validators/internal-lead.ts — biểu mẫu "Nhập khách hàng" (`/nhap-khach-hang`).
//
// Tách khỏi file `"use server"` vì file Server Action chỉ được export hàm async —
// export một `const` schema ở đó làm vỡ toàn bộ action trong module lúc chạy.
//
// KHÔNG có trường mã nhân viên: danh tính người nhập lấy từ phiên đăng nhập.
//
// ⚠️ 22/08/2026 — CHỦ DỰ ÁN CHỐT: **KHÔNG ô nào bắt buộc.** Kể cả số điện thoại.
// Lý do nghiệp vụ: lead thu từ quảng cáo Facebook rất thường chỉ có **link FB**
// (chưa xin được số) — bắt buộc SĐT là ép người nhập bịa số hoặc bỏ luôn lead.
// Ràng buộc duy nhất còn lại: phiếu phải có ÍT NHẤT một ô có nội dung (xem
// `hasAnyContent`) — lưu một phiếu trắng thì không phải là dữ liệu.
import { z } from "zod";
import { phoneVnNullable } from "./phone";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const internalLeadSchema = z.object({
  parentName: optionalText(120),
  /**
   * Rỗng → null. Có gõ thì phải là SĐT di động VN (sai chính tả vẫn phải bắt).
   *
   * `z.preprocess(v => v ?? null, …)` chứ không phải `phoneVnNullable` trần:
   * zod v4 coi khoá VẮNG MẶT là "nonoptional" và từ chối, kể cả khi schema con
   * đã nhận `undefined`. Không có lớp này thì client bỏ hẳn khoá `phone` (đúng
   * ca "không ô nào bắt buộc") sẽ ăn 400.
   */
  phone: z.preprocess((v) => v ?? null, phoneVnNullable),
  childName: optionalText(120),
  /** Nguồn khách — ô GÕ TỰ DO (chốt 22/08). Đi thẳng vào `Lead.source`. */
  source: optionalText(80),
  /** Link Facebook/Messenger của phụ huynh. Chuẩn hoá + chặn scheme lạ ở mapper. */
  facebookUrl: optionalText(300),
  /** `Center.code` chọn từ danh sách thật; để trống thì hệ thống tự chia cơ sở. */
  centerCode: optionalText(20),
  note: optionalText(2000),
});

export type InternalLeadInput = z.infer<typeof internalLeadSchema>;

/**
 * Phiếu có ít nhất một ô đã điền hay không.
 *
 * Đây KHÔNG phải "trường bắt buộc" trá hình: không ô nào riêng lẻ bị đòi hỏi,
 * chỉ chặn đúng ca bấm Lưu trên biểu mẫu trắng (bấm nhầm, hoặc script bơm phiếu
 * rỗng vào Server Action) — thứ sẽ đẻ ra lead "Phụ huynh (chưa rõ tên)" không có
 * một manh mối nào để liên hệ.
 */
export function hasAnyContent(input: InternalLeadInput): boolean {
  return Object.values(input).some((v) => typeof v === "string" && v.length > 0);
}

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
  /** Trùng SĐT nhưng khác con ⇒ đã gắn thêm bé vào khách cũ. */
  childAdded?: boolean;
  error?: string;
  /** Chuyện bất thường nhưng không đủ để từ chối — hiện cho người nhập thấy. */
  warnings?: string[];
};
