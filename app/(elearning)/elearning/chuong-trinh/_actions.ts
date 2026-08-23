"use server";

import { defineAction } from "@/lib/actions/define";
import {
  cauHinhTaoPhieuNhuCau,
  cauHinhDuyetPhieuNhuCau,
} from "@/lib/elearning/training-need";
import { cauHinhTaoChuongTrinh } from "@/lib/elearning/program-create";

/**
 * EL-08 — phiếu nhu cầu + chương trình đào tạo.
 *
 * ⚠️ Tệp mỏng có chủ đích: cấu hình action nằm ở `lib/elearning/*` (quy ước 10)
 * để test chạy đúng cái máy chủ chạy, không phải một bản chép sang test.
 */
export const taoPhieuNhuCauAction = defineAction(cauHinhTaoPhieuNhuCau);

export const duyetPhieuNhuCauAction = defineAction(cauHinhDuyetPhieuNhuCau);

export const taoChuongTrinhAction = defineAction(cauHinhTaoChuongTrinh);
