// lib/lms/session-project-name.ts — tên DỰ ÁN + NHÃN của một buổi học.
//
// 25/08 (chủ dự án): tên dự án gửi phụ huynh = TÊN BÀI TRẦN của giáo trình
// ("Bàn Tay Ma Thuật"), còn cột "Buổi học" của bảng điểm danh/nhận xét in nhãn đầy đủ
// "Buổi 1 - HP1 - Bàn Tay Ma Thuật" (deriveSessionLabel). Tên bài thật nạp từ
// `prisma/seed-curriculum-sata.ts` ← `lib/lms/curriculum-sata.ts`; trước đó bảng
// `Lesson` chỉ có chỗ trống tự sinh "Buổi N" nên mọi giáo trình in ra tên sai.
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
  /** Lesson.moduleCode — học phần của bài ("HP1"); null với khoá không chia học phần. */
  moduleCode?: string | null;
};

function clean(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * Ô TRỐNG mang hình dạng tiêu đề: `"Buổi 7"` và không gì khác.
 *
 * Hai nơi đẻ ra nó: nút "Áp dụng số buổi" ở /admin/curriculums (`lib/lms/curriculum.ts`
 * tạo `title: "Buổi N"`), và `createSessionPlansForClass` chép nguyên cái đó sang
 * `ClassSessionPlan.customTitle` lúc tạo lớp (`lib/classes/snapshot.ts`).
 *
 * Vì sao phải LOẠI nó khỏi chuỗi ưu tiên (25/08): `customTitle` là bản sao ĐÔNG CỨNG,
 * không bao giờ tự đồng bộ khi giáo trình đổi tên. Lớp tạo trước khi có giáo trình thật
 * mang `customTitle = "Buổi 7"`; nạp giáo trình xong thì `Lesson.title` đã là
 * "Bàn Tay Ma Thuật" nhưng `customTitle` vẫn thắng ⇒ nhãn in ra `"Buổi 7 - HP1 - Buổi 7"`
 * và phiếu gửi phụ huynh in `"Buổi 7"` — XẤU HƠN trước khi nạp. Coi ô trống là "không có
 * tên" thì nó tự rơi xuống `Lesson.title`, và mọi lớp cũ được vá mà không cần chạy
 * `--relink`.
 *
 * KHÔNG dùng `isPlaceholderTitle(title, order)` của curriculum-merge: ở đây không có số
 * thứ tự của plan để đối chiếu, và bất kỳ `"Buổi <số>"` nào cũng đều là ô trống.
 */
function isBlankSessionTitle(s: string): boolean {
  return /^buổi\s+\d+$/i.test(s);
}

/**
 * Bỏ tiền tố `"Buổi N"` thừa ở ĐẦU tên bài.
 *
 * Nhiều giáo trình đặt tên bài kèm sẵn số buổi — `"Buổi 1 — Làm quen bộ học cụ"`,
 * `"Buổi 3: Cảm biến"`. Nhãn buổi vốn đã mở đầu bằng `"Buổi N"` rồi, giữ nguyên là in ra
 * `"Buổi 1 - Buổi 1 — Làm quen bộ học cụ"` — đọc như lỗi. Cắt phần trùng, còn
 * `"Buổi 1 - Làm quen bộ học cụ"`.
 *
 * PHẢI có dấu ngăn (— – - : .) sau con số mới cắt: `"Buổi diễn tập"` hay
 * `"Buổi 2 ôn tập"` không phải tiền tố đánh số, cắt là mất chữ.
 */
function stripSessionNumberPrefix(s: string): string {
  return s.replace(/^buổi\s+\d+\s*[—–\-:.]\s*/i, "").trim();
}

/**
 * `clean()` + coi ô trống `"Buổi N"` như chuỗi rỗng + cắt tiền tố `"Buổi N —"` thừa.
 *
 * Export vì cổng phụ huynh cũng phải làm y hệt: `lib/portal/{feedback,photos,schedule}.ts`
 * tự ghép `"Buổi N: <tên bài>"` (portal V2 cắt lại tiền tố đó để in số buổi ở huy hiệu
 * riêng), nên nếu tên bài đã mang sẵn `"Buổi 7 — "` thì phụ huynh đọc ra
 * `"Buổi 7: Buổi 7 — Vòng lặp và điều kiện"`.
 */
export function meaningfulSessionTitle(s: string | null | undefined): string {
  const t = clean(s);
  if (isBlankSessionTitle(t)) return "";
  return stripSessionNumberPrefix(t);
}

/** Bí danh nội bộ cho gọn — cùng một hàm. */
const meaningful = meaningfulSessionTitle;

/**
 * TIÊU ĐỀ BUỔI lấy từ giáo trình của lớp — chuỗi TRẦN, không có tiền tố "Dự án N".
 *
 * Thứ tự ưu tiên là thứ tự "ai gần buổi này nhất" — BỎ QUA ô trống `"Buổi N"`
 * (xem `isBlankSessionTitle`):
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
  return meaningful(src.planTitle) || meaningful(src.lessonTitle) || meaningful(src.topic);
}

/**
 * TÊN DỰ ÁN in trên phiếu nhận xét gửi phụ huynh = TÊN BÀI TRẦN của giáo trình,
 * vd `Bàn Tay Ma Thuật`.
 *
 * 25/08 — bỏ tiền tố `Dự án {N}: ` (chủ dự án chốt: phụ huynh chỉ cần tên dự án).
 * Lý do kỹ thuật đi kèm: số N ở đây là số buổi THEO NGÀY của lớp
 * (`buildSessionNumberMap`), không phải `Lesson.order`; chèn buổi bù hay huỷ buổi làm
 * hai số lệch nhau, nên `Dự án 8` có thể dán vào bài số 7 của giáo trình. Bỏ tiền tố
 * là hết nguy cơ đó. Số buổi vẫn hiện đầy đủ ở NHÃN BUỔI (`deriveSessionLabel`).
 *
 * Không tra được tên bài → `Dự án {số buổi}`; không có gì → DEFAULT_PROJECT_NAME
 * (ô Dự án không bao giờ để trống).
 */
export function deriveSessionProjectName(src: SessionProjectSource): string {
  const title = deriveSessionTitle(src);
  if (title) return title;

  const n = sessionOrLessonNumber(src);
  if (n) return `Dự án ${n}`;
  return DEFAULT_PROJECT_NAME;
}

/** Số buổi để in ra: ưu tiên số buổi của lớp, thiếu thì lùi về `Lesson.order`. */
function sessionOrLessonNumber(src: SessionProjectSource): number | null {
  if (typeof src.sessionNumber === "number" && src.sessionNumber > 0) {
    return src.sessionNumber;
  }
  if (typeof src.lessonOrder === "number" && src.lessonOrder > 0) {
    return src.lessonOrder;
  }
  return null;
}

/**
 * NHÃN BUỔI HỌC cho cột "Buổi học" của bảng điểm danh / nhận xét:
 * `Buổi 1 - HP1 - Bàn Tay Ma Thuật`.
 *
 * 25/08 — gộp hai cột `Buổi` ("Buổi 1") và `Buổi học` ("Buổi học") vốn dư một cột, mà
 * cột thứ hai thì in hằng số vì `ClassSession.topic` gần như luôn null.
 *
 * Rút gọn dần khi thiếu mảnh, không bao giờ để lại dấu `-` cụt:
 *   đủ ba              → `Buổi 1 - HP1 - Bàn Tay Ma Thuật`
 *   không có học phần  → `Buổi 1 - Bàn Tay Ma Thuật`   (khoá luyện thi Sata1/2/8)
 *   chưa có giáo trình → `Buổi 1`
 *   chưa tra được số   → `HP1 - Bàn Tay Ma Thuật`
 *   không có gì        → `""` (chỗ gọi tự quyết, thường in "Buổi học")
 */
export function deriveSessionLabel(src: SessionProjectSource): string {
  const parts: string[] = [];

  const n = sessionOrLessonNumber(src);
  if (n) parts.push(`Buổi ${n}`);

  const mod = clean(src.moduleCode);
  if (mod) parts.push(mod);

  const title = deriveSessionTitle(src);
  if (title) parts.push(title);

  return parts.join(" - ");
}
