"use server";

import { defineAction } from "@/lib/actions/define";
import { cauHinhXemTruoc } from "@/lib/elearning/assignment-preview";

/**
 * EL-05 — giao bài.
 *
 * ⚠️ Tệp này CỐ Ý mỏng: cấu hình action nằm ở `lib/elearning/*`, đây chỉ bọc lại
 * cho Next. Lý do ở đầu `assignment-preview.ts` — tệp `"use server"` không nạp
 * được trong vitest, nên logic để ở đây là buộc test phải chép lại cấu hình.
 *
 * ⚠️ `"use server"` chỉ được export HÀM async (luật của repo: `export const` lạc
 * vào đây làm Server Action vỡ LÚC CHẠY với E352 mà `pnpm build` vẫn xanh).
 * `defineAction` trả về một hàm async nên hợp lệ.
 */
export const xemTruocTapNguoiHocAction = defineAction(cauHinhXemTruoc);
