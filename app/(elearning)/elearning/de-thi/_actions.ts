"use server";

import { defineAction } from "@/lib/actions/define";
import {
  cauHinhTaoDe,
  cauHinhThemCauVaoDe,
  cauHinhGoCauKhoiDe,
  cauHinhSapXepDe,
  cauHinhKichHoatDe,
} from "@/lib/elearning/exam-authoring";
import { cauHinhMoKhoaThi } from "@/lib/elearning/exam-unlock";

/**
 * EL-14c — dựng đề thi.
 *
 * ⚠️ Tệp CỐ Ý mỏng (quy ước 10): cấu hình nằm ở `lib/elearning/exam-authoring.ts`,
 * vì tệp `"use server"` không nạp được trong vitest — để logic ở đây là buộc test
 * chép lại cấu hình, và bản được kiểm sẽ không phải bản đang chạy.
 */
export const taoDeAction = defineAction(cauHinhTaoDe);
export const themCauVaoDeAction = defineAction(cauHinhThemCauVaoDe);
export const goCauKhoiDeAction = defineAction(cauHinhGoCauKhoiDe);
export const sapXepDeAction = defineAction(cauHinhSapXepDe);
export const kichHoatDeAction = defineAction(cauHinhKichHoatDe);

/**
 * EL-14d — mở thêm một lượt thi.
 *
 * ⚠️ Nối vào ĐÂY, không để `exam-unlock.ts` nằm không đường gọi. Trình phát nói với
 * người học "liên hệ Đào tạo nếu cần mở thêm lượt" — mà Đào tạo không có nút nào
 * để bấm thì câu đó là lời hứa suông, và người học chờ mãi.
 */
export const moKhoaThiAction = defineAction(cauHinhMoKhoaThi);
