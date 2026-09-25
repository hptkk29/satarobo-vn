// lib/agents/gateway/cau-hinh.ts — tham số vận hành của cổng (spec §7.4), đọc từ SystemSetting.
//
// ⚠️ CÔNG TẮC ĐỌC THẲNG DB, KHÔNG QUA BỘ ĐỆM. `getSetting`/`getGlobalSetting` đệm 300 giây,
// và việc xoá đệm khi lưu chỉ có tác dụng trong tiến trình đang chạy
// (`lib/settings/read-global.ts:32-34`) ⇒ các lambda khác vẫn MỞ cổng tới 5 phút sau khi
// người duyệt bấm Tắt. Công tắc khẩn cấp mà trễ 5 phút là công tắc giả (ca B13).
// Cái giá: một câu `findUnique` theo khoá chính mỗi lượt gọi.
//
// Các hạn mức còn lại chấp nhận trễ ≤ 5 phút — chúng không phải đường thoát khẩn cấp.
//
// ⚠️ Công tắc KHÔNG nằm trong registry cấu hình chung (rà bảo mật 25/09, AG-01): khoá trong
// registry thì màn Cấu hình vận hành ghi được, tức bật cổng mà không qua người duyệt + 2FA.
// Nó vẫn là MỘT dòng `SystemSetting` (cùng bảng, không migration), nhưng chỉ file này đọc và
// chỉ `quan-tri/cong-tac.ts` ghi.
import { z } from "zod";
import { getGlobalSetting } from "@/lib/settings/read-global";
import { khoCong } from "../kho";

export const KHOA_CONG_TAC = "agentGateway.enabled";
/** Mặc định BẬT — spec §7.4. Không có client/grant nào được duyệt thì cổng bật cũng không mở gì. */
export const CONG_TAC_MAC_DINH = true;
const khuonCongTac = z.boolean();

export type HanMucCong = {
  tokenTtlSec: number;
  rateLimitPerMin: number;
  maxRowsPerCall: number;
  maxRowsPerDayCao: number;
  maxRangeDays: number;
  lockAfterAuthFailures: number;
};

/**
 * Cổng đang bật? Đọc DB mỗi lần gọi. Lỗi đọc (DB sập, giá trị hỏng) ⇒ `false`: không chắc
 * thì đóng (spec nguyên tắc 7), không "mặc định bật cho qua".
 */
export async function congDangBat(): Promise<boolean> {
  try {
    const row = await khoCong.systemSetting.findUnique({ where: { key: KHOA_CONG_TAC } });
    if (!row) return CONG_TAC_MAC_DINH;
    const p = khuonCongTac.safeParse(row.valueJson);
    // Giá trị hỏng (ai đó sửa tay sai kiểu) ⇒ ĐÓNG, không rơi về mặc định BẬT.
    return p.success ? p.data : false;
  } catch {
    return false;
  }
}

export async function docHanMuc(): Promise<HanMucCong> {
  const [tokenTtlSec, rateLimitPerMin, maxRowsPerCall, maxRowsPerDayCao, maxRangeDays, lockAfterAuthFailures] =
    await Promise.all([
      getGlobalSetting("agentGateway.tokenTtlSec"),
      getGlobalSetting("agentGateway.rateLimitPerMin"),
      getGlobalSetting("agentGateway.maxRowsPerCall"),
      getGlobalSetting("agentGateway.maxRowsPerDay.cao"),
      getGlobalSetting("agentGateway.maxRangeDays"),
      getGlobalSetting("agentGateway.lockAfterAuthFailures"),
    ]);
  return {
    tokenTtlSec: tokenTtlSec as number,
    rateLimitPerMin: rateLimitPerMin as number,
    maxRowsPerCall: maxRowsPerCall as number,
    maxRowsPerDayCao: maxRowsPerDayCao as number,
    maxRangeDays: maxRangeDays as number,
    lockAfterAuthFailures: lockAfterAuthFailures as number,
  };
}
