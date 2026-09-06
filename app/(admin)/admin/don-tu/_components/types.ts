// Kiểu dùng chung của màn Duyệt đơn từ.
//
// Vì sao tách khỏi `request-queue-table.tsx`: bảng mở `RequestSheet`, còn Sheet cần đúng hình
// dạng một dòng để vẽ chi tiết ⇒ hai file import lẫn nhau và `depcruise` chặn (`no-circular`).
// Kiểu đứng riêng thì cả hai cùng nhìn về một chỗ, không ai phụ thuộc ai.
//
// Mọi trường ở đây đã được FORMAT SẴN Ở SERVER (nhãn ngày, giờ, tuổi đơn): component là client,
// mà `toLocaleString` trên máy người dùng thì lệch múi giờ — xem landmine TZ của repo.
import type { EffectTone } from "@/lib/cham-cong/request-effect";
import type { WorkRequestStatusV } from "@/lib/work-request";

export type QueueRow = {
  id: string;
  status: WorkRequestStatusV;
  statusLabel: string;
  kindLabel: string;
  requesterName: string;
  centerCode: string;
  centerLabel: string;
  /** "09/09" hoặc "09/09 → 12/09". */
  applyLabel: string;
  /** Ngày đầy đủ cho `title` (bảng chỉ đủ chỗ cho dd/MM). */
  applyTitle: string;
  timeLabel: string | null;
  dueLabel: string | null;
  dueTone: "danger" | "warning" | "muted";
  effectText: string;
  /** `warning` = đơn khuyết dữ liệu, bấm Duyệt sẽ báo lỗi — cột và panel đều tô cảnh báo. */
  effectTone: EffectTone;
  effectCode: string | null;
  effectHint: string | null;
  ageLabel: string;
  stale: boolean;
  submittedLate: boolean;
  applyError: string | null;
  applied: boolean;
  /** "Nguyễn A ngày 09/09" — câu xác nhận trước khi duyệt. */
  subject: string;
  reason: string;
  detail: string | null;
  className: string | null;
  requestedLabel: string | null;
  newShiftCode: string | null;
  leaveName: string | null;
  targetName: string | null;
  targetShiftCode: string | null;
  reviewedByName: string | null;
  reviewedAtLabel: string | null;
  reviewNote: string | null;
  createdAtLabel: string;
};
