// F-20 — cầu nối giữa Cấu hình vận hành và hàm thuần tính hạn duyệt.
//
// TÁCH RIÊNG khỏi `media-review-deadline.ts` để file kia ở lại THUẦN: nó không kéo
// theo `@/lib/settings/service` → `@/lib/db`, nên test chạy được mà không cần DB.
//
// Hai key này `centerOverridable: true` ⇒ luôn truyền `orgUnitId` của cơ sở dạy khi
// có. Bỏ trống thì rơi về GLOBAL → default (10h sáng hôm sau), không phải lỗi.
import { getSetting } from "@/lib/settings/service";
import {
  computeReviewDeadline,
  type ReviewDeadlineConfig,
} from "./media-review-deadline";

/** Đọc cấu hình hạn duyệt hiện hành (Center → Global → default). */
export async function loadReviewDeadlineConfig(
  orgUnitId?: string | null,
): Promise<ReviewDeadlineConfig> {
  const [hour, offsetDays] = await Promise.all([
    getSetting("media.reviewDeadlineHour", { orgUnitId }),
    getSetting("media.reviewDeadlineOffsetDays", { orgUnitId }),
  ]);
  return { hour, offsetDays };
}

/**
 * Hạn duyệt cho một buổi dạy theo cấu hình HIỆN HÀNH.
 *
 * ⚠️ Chỉ gọi lúc SINH RA folder duyệt rồi lưu kết quả lại (F-20-2 — đóng băng).
 * Đừng gọi mỗi lần hiển thị: làm vậy là hạn của quá khứ chạy theo cấu hình hôm nay
 * và báo cáo SLA đổi số ngược thời gian.
 */
export async function resolveReviewDeadlineFor(
  sessionAt: Date,
  orgUnitId?: string | null,
): Promise<Date> {
  return computeReviewDeadline(sessionAt, await loadReviewDeadlineConfig(orgUnitId));
}
