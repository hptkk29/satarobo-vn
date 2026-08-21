// lib/lms/session-project-name.ts — tên DỰ ÁN của một buổi học.
//
// Trước 21/08 ô "Dự án" trong phiếu nhận xét là một <input> trống được mồi sẵn hằng số
// DEFAULT_PROJECT_NAME ("Dự án 1: Làm quen hệ thống"), nên mỗi giáo viên gõ một kiểu và
// phiếu buổi 9 vẫn đề "Dự án 1". Yêu cầu 21/08: tên dự án SUY RA từ chính buổi học,
// không nhập tay nữa.
//
// PURE (không DB). Đây là nguồn tên cho Ô NHẬP của phiếu — nơi quyết định giá trị sẽ
// được LƯU. Các màn chỉ-đọc (PDF, portal phụ huynh, thẻ phiếu ở admin) vẫn in cột
// `StudentSessionFeedback.projectName` ĐÃ LƯU, nên phiếu cũ còn giữ tên cũ (thường là
// hằng "Dự án 1: Làm quen hệ thống") cho tới khi có người mở ra bấm Lưu lại. Cố ý:
// hộp thoại là trình sửa, phải hiện thứ nó sắp ghi; và tự suy lại ở mọi đường đọc thì
// giá trị đã lưu thành vô nghĩa.
import { DEFAULT_PROJECT_NAME } from "@/lib/lms/session-eval-rubric";

export type SessionProjectSource = {
  /** Số buổi trong lớp (lib/lms/session-order). */
  sessionNumber?: number | null;
  /** ClassSessionPlan.customTitle — tiêu đề buổi do lớp tự đặt (ưu tiên cao nhất). */
  planTitle?: string | null;
  /** Lesson.title của giáo án gắn buổi. */
  lessonTitle?: string | null;
  /** Lesson.order — dự phòng khi chưa tra được số buổi. */
  lessonOrder?: number | null;
  /** ClassSession.topic — chủ đề nhập tay ở cấp buổi. */
  topic?: string | null;
};

function clean(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * TIÊU ĐỀ BUỔI lấy từ giáo trình của lớp — chuỗi TRẦN, không có tiền tố "Dự án N".
 *
 * Thứ tự ưu tiên là thứ tự "ai gần buổi này nhất":
 *   1. `ClassSessionPlan.customTitle` — giáo trình đã ghim cho CHÍNH lớp này, giáo vụ
 *      sửa được từng buổi;
 *   2. `Lesson.title` — tên bài trong giáo trình gốc của khoá;
 *   3. `ClassSession.topic` — chủ đề gõ tay ở cấp buổi (lớp không ghim giáo trình).
 *
 * Trả `""` khi cả ba đều trống — chỗ gọi tự quyết hiển thị gì (bảng thì để trống cho
 * sạch, phiếu thì rơi về DEFAULT_PROJECT_NAME). Cố ý KHÔNG bịa "Buổi N" ở đây: đó là
 * việc của `sessionNumberLabel`, và trộn hai thứ vào một chuỗi thì cột "Buổi" và cột
 * "Tiêu đề" sẽ in trùng nhau.
 */
export function deriveSessionTitle(
  src: Pick<SessionProjectSource, "planTitle" | "lessonTitle" | "topic">,
): string {
  return clean(src.planTitle) || clean(src.lessonTitle) || clean(src.topic);
}

/**
 * Tên dự án hiển thị trên phiếu: `Dự án {số buổi}: {tên bài}`.
 * Thiếu tên bài → `Dự án {số buổi}`; thiếu cả số buổi → tên bài trần; không có gì →
 * DEFAULT_PROJECT_NAME (giữ nguyên chuỗi cũ để phiếu không bao giờ trống ô Dự án).
 */
export function deriveSessionProjectName(src: SessionProjectSource): string {
  const title = deriveSessionTitle(src);
  const n =
    typeof src.sessionNumber === "number" && src.sessionNumber > 0
      ? src.sessionNumber
      : typeof src.lessonOrder === "number" && src.lessonOrder > 0
        ? src.lessonOrder
        : null;

  // Tên bài đã tự mang tiền tố "Dự án …" (giáo trình cũ đặt vậy) → đừng lồng hai lần.
  if (title && /^dự án\b/i.test(title)) return title;

  if (n && title) return `Dự án ${n}: ${title}`;
  if (n) return `Dự án ${n}`;
  if (title) return title;
  return DEFAULT_PROJECT_NAME;
}
