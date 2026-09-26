// lib/finance/hoa-don/feature.ts — NƠI DUY NHẤT ĐỌC CÔNG TẮC màn kế toán Hoá đơn điện tử.
//
// Chép khuôn `lib/finance/feature.ts` (công tắc thu học phí linh hoạt): cờ nằm trong DB
// (`SystemSetting`), người vận hành bật được, thấy được, `AuditLog` ghi ai bật lúc nào. Lưới
// `[HDF-02]` đếm số chỗ nhắc chuỗi khoá ngoài tệp này = 0 — rải `getSetting(...)` khắp nơi là mỗi
// chỗ tự quyết nghĩa của "bật", và tắt cờ sẽ tắt được 9 chỗ trong 10.
//
// ⚠️ Cờ chỉ gác MÀN HÌNH + route tải tệp + việc gửi email. Các cổng chặn trong sổ tiền (khoản đã
// có hoá đơn thì không từ chối / tách được — docs/ke-toan-hoa-don/PLAN.md §5) LUÔN chạy, KHÔNG
// hỏi hàm này: tắt cờ mà mở lại được `rejectPayment` trên khoản đã xuất hoá đơn là lỗ.

import { getSetting } from "@/lib/settings/service";

export const KHOA_HOA_DON = "billing.hoaDonEnabled" as const;

/** Màn Hoá đơn điện tử có đang bật không (toàn hệ — không có công tắc theo cơ sở). */
export async function laHoaDonBat(): Promise<boolean> {
  return await getSetting(KHOA_HOA_DON);
}
