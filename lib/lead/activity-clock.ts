// lib/lead/activity-clock.ts — N-4: KHÁI NIỆM "đã tiếp cận khách", tách khỏi
// "có hoạt động".
//
// Sau khi vá N-4, MỌI dòng `LeadActivity` đều bump `Lead.lastActivityAt` — kể cả
// dòng do máy ghi ("Tự động chia cho Sale A", "[Trùng SĐT] …", "Chuyển trạng
// thái: Mới → Đã phân công"). Đó là điều ĐÚNG cho cột hiển thị "hoạt động gần
// nhất", nhưng SAI nếu đem thẳng cột đó làm "lần tiếp cận gần nhất" của C-05:
// máy tự chia lead lúc 2 giờ sáng không phải là Sale gọi cho phụ huynh. Dùng
// nhầm là dựng lại đúng cái làm-đẹp-giả mà spec cảnh báo (`:54`), chỉ đổi nguyên
// do — QLCS soi lead treo lại thấy sạch bong.
//
// ⚠️ CHƯA CÓ QUYẾT ĐỊNH của chủ dự án về danh sách loại nào được tính là "tiếp
// cận". Nên file này KHÔNG chốt gì: mọi hàm nhận danh sách TRUYỀN VÀO, còn giá
// trị đang dùng nằm ở đúng hai hằng số dưới đây. Lúc chốt thì sửa hằng số, không
// mở lại thân hàm, không đi sửa chỗ gọi.
//
// ⚠️ Module THUẦN — KHÔNG import `@/lib/db`. Cùng lý do đã tách `status-trail.ts`
// khỏi `status-trail-write.ts` ở C-07: nó được dùng cả ở component hiển thị lẫn
// ở unit test, kéo Prisma vào là biến mọi test dùng nó thành test cần DB.
import type { LeadActivityType } from "@prisma/client";

/**
 * Loại hoạt động ĐANG được tính là "đã tiếp cận khách". **Giá trị tạm** — bằng
 * đúng định nghĩa mà `hasSaleInteraction` (`lib/lead/auto-assign.ts`) đã dùng từ
 * trước cho việc khoá auto-chia-lại, nên hôm nay hai chỗ không lệch nhau. Test
 * `[N-4] định nghĩa 'đã tiếp cận' không được tách làm hai bản` ghim ràng buộc đó.
 *
 * `STATUS_CHANGE` cố ý VẮNG MẶT: máy đẩy trạng thái (ghi nhận tiền, điểm danh
 * học thử, tự chia) không phải một lần chạm khách.
 */
export const LEAD_OUTREACH_TYPES: readonly LeadActivityType[] = [
  "CALL",
  "MESSAGE",
  "EMAIL",
  "HANDOVER",
  "NOTE",
];

/**
 * `NOTE` là loại BỊ DÙNG CHUNG: Sale ghi tay "đã gọi, phụ huynh bận" cũng
 * `NOTE`, mà máy ghi "Tự động chia cho Sale A" cũng `NOTE`. Dấu phân biệt duy
 * nhất đang có trong dữ liệu là `metadata.system === true` (`SYSTEM_META` ở
 * `lib/lead/auto-assign.ts`). Mặc định: dòng máy KHÔNG tính là tiếp cận.
 */
export const LEAD_OUTREACH_COUNTS_SYSTEM_NOTE = false;

/** Đủ hình dạng để xét, không đòi nguyên bản ghi Prisma (test dựng tay được). */
export type LeadActivityLike = {
  type: LeadActivityType;
  createdAt: Date;
  metadata?: unknown;
};

/** Dòng này do MÁY ghi? Cột `metadata` là Json tự do nên phải chịu được rác. */
export function isSystemWrittenActivity(metadata: unknown): boolean {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).system === true;
}

/** Một dòng hoạt động có được tính là "đã tiếp cận khách" theo danh sách đưa vào. */
export function isLeadOutreach(
  activity: LeadActivityLike,
  outreachTypes: readonly LeadActivityType[],
  countSystemWritten: boolean = LEAD_OUTREACH_COUNTS_SYSTEM_NOTE,
): boolean {
  if (!outreachTypes.includes(activity.type)) return false;
  if (!countSystemWritten && isSystemWrittenActivity(activity.metadata)) return false;
  return true;
}

/**
 * Mốc TIẾP CẬN gần nhất trong một mớ hoạt động. THUẦN, không giả định thứ tự
 * mảng đưa vào (chỗ gọi có thể đã sắp theo chiều khác).
 *
 * Trả `null` khi chưa tiếp cận lần nào — CỐ Ý không tự rơi về `createdAt` của
 * lead: quy ước đó thuộc về chỗ hiển thị (C-05), không phải về hàm này.
 */
export function lastLeadOutreachAt(
  activities: readonly LeadActivityLike[],
  outreachTypes: readonly LeadActivityType[],
  countSystemWritten: boolean = LEAD_OUTREACH_COUNTS_SYSTEM_NOTE,
): Date | null {
  let moc: Date | null = null;
  for (const a of activities) {
    if (!isLeadOutreach(a, outreachTypes, countSystemWritten)) continue;
    if (moc === null || a.createdAt.getTime() > moc.getTime()) moc = a.createdAt;
  }
  return moc;
}
