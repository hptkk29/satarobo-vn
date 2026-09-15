/**
 * MỘT ĐƠN — NHIỀU CON. Luật "khoản tiền này của đứa trẻ nào" hỏi ở ĐÚNG MỘT chỗ.
 *
 * ── Vì sao có file này (15/09/2026) ──
 * Trước đợt này `/orders/new` chỉ dựng được đơn một dòng, nên "học viên của đơn"
 * (`Order.studentId`) và "học viên của dòng" là cùng một thứ và không ai phải phân
 * biệt. Từ khi một phụ huynh hai con học hai khoá gộp được vào MỘT đơn (một công nợ,
 * một mã QR — đúng yêu cầu của chủ dự án), hai khái niệm đó tách hẳn ra:
 *
 *   · `OrderItem.studentId` — của TỪNG DÒNG. Đây là sự thật.
 *   · `Order.studentId`     — chỉ còn nghĩa khi cả đơn về ĐÚNG MỘT em.
 *
 * Đơn hai con mà vẫn nhét một `Order.studentId` vào là nói dối một cách im lặng: hoàn
 * tiền, ZNS học phí và cổng phụ huynh đều đọc cột đó, nên tất cả sẽ nói sai tên một
 * đứa trẻ mà không lỗi nào nổ ra.
 *
 * ⚠️ File THUẦN — KHÔNG `import "server-only"`. Form tạo đơn (client component) và
 * `createOrderManualAction` (server) phải dùng CHUNG hàm này, kẻo hai bên suy ra hai
 * kết quả khác nhau cho cùng một đơn. Server vẫn là bên quyết định: client gửi gì thì
 * gửi, action tính lại từ các dòng.
 */

import { canonicalPhone } from "@/lib/phone";

/** Đủ để trả lời "em này là con của SĐT nào" — cố ý hẹp, đừng đòi cả bản ghi học viên. */
export type HocVienTheoSdt = { id: string; parentPhone: string | null };

/**
 * CON CỦA SỐ ĐIỆN THOẠI NÀY — một luật, ba chỗ gọi [15/09/2026].
 *
 * Chủ dự án: *"ở phần khoá học, học viên thì lấy đúng số con trong lead nhập ở sđt ở trên
 * session khách hàng, chứ không hiển thị full như vậy"* và *"ở dưới khoá học thì tên học
 * viên được chọn sẵn 1 trong số con của PH luôn"*.
 *
 * Ba nơi cần đúng CÙNG một câu trả lời, nếu không thì ô lọc bày ra một tập còn ô chọn sẵn
 * lại trỏ vào em ngoài tập đó:
 *   1. danh sách gợi ý trong ô "Học viên" của dòng hàng;
 *   2. lúc người bán bấm chọn một lead từ gợi ý SĐT;
 *   3. lúc mở `/orders/new?leadId=…` từ trang lead (đường CHÍNH, và là đường trước bản này
 *      KHÔNG chọn sẵn con nào — đo thật: tên PH + SĐT điền sẵn, lọc đúng "1 con", mà ô học
 *      viên vẫn rỗng).
 *
 * ⚠️ So bằng `canonicalPhone`, KHÔNG so chuỗi thô. `Student.parentPhone` trong DB đang có
 * cả `0…` lẫn `84…` (di sản 6 hàm chuẩn hoá cũ) và `Lead.phone` cũng vậy — đo trên
 * `satarobo_local`: lead mẫu mang `84930000001`, nên so thô là lọc mất đúng bản ghi cần tìm.
 *
 * ⚠️ SĐT rỗng/không đọc được ⇒ mảng RỖNG, KHÔNG phải "tất cả". Đây là hàm trả lời "con của
 * ai", và "chưa biết ai" thì câu trả lời đúng là không ai. Việc "chưa có SĐT thì bày đủ
 * danh sách cho đơn walk-in" là quyết định của MÀN HÌNH, và nó phải nằm ở màn hình — trộn
 * vào đây là biến một hàm tra cứu thành một hàm đôi lúc trả về cả thế giới.
 */
export function conCuaPhuHuynh<T extends HocVienTheoSdt>(
  hocVien: readonly T[],
  sdt: string | null | undefined,
): T[] {
  const chuan = canonicalPhone(sdt);
  if (!chuan) return [];
  return hocVien.filter((hv) => canonicalPhone(hv.parentPhone) === chuan);
}

/**
 * Em được CHỌN SẴN ở dòng đầu — `null` khi SĐT chưa có hoặc không con nào khớp.
 *
 * Lấy em ĐẦU TIÊN theo đúng thứ tự danh sách gợi ý đang bày, để thứ được chọn sẵn luôn là
 * thứ người bán nhìn thấy đầu bảng.
 *
 * ⚠️ Phụ huynh NHIỀU CON thì đây là một PHỎNG ĐOÁN, và nó gán tiền cho một đứa trẻ. Chủ dự
 * án chốt vẫn chọn sẵn ("chọn sẵn 1 trong số con của PH luôn") vì đa số đơn là một con;
 * bù lại màn hình phải NÓI RA số con đang khớp để người bán biết mà đổi — xem lời nhắc
 * dưới ô Học viên. Đừng bỏ lời nhắc đó đi cùng lúc với việc giữ phép đoán này.
 */
export function conChonSan(
  hocVien: readonly HocVienTheoSdt[],
  sdt: string | null | undefined,
): string | null {
  return conCuaPhuHuynh(hocVien, sdt)[0]?.id ?? null;
}

/** Bỏ khoảng trắng, bỏ rỗng, bỏ trùng — danh sách học viên KHÁC NHAU trên các dòng. */
export function hocVienTrenCacDong(
  items: readonly { studentId?: string | null }[],
): string[] {
  return [
    ...new Set(
      items
        .map((it) => it.studentId?.trim())
        .filter((v): v is string => !!v),
    ),
  ];
}

/**
 * Giá trị ĐÚNG cho `Order.studentId`, suy từ các dòng.
 *
 * - 1 em trên các dòng  → chính em đó (dù client gửi gì).
 * - ≥2 em               → `null`. Đơn nhiều con KHÔNG quy về một em.
 * - 0 em khai trên dòng → giữ `studentIdGuiLen` (đường convert-lead vẫn dựa vào nó;
 *   người gọi có trách nhiệm đã tra scope giá trị này trước khi truyền vào).
 */
export function studentIdChoDon(
  items: readonly { studentId?: string | null }[],
  studentIdGuiLen: string | null | undefined,
): string | null {
  const tren = hocVienTrenCacDong(items);
  if (tren.length === 1) return tren[0]!;
  if (tren.length > 1) return null;
  return studentIdGuiLen?.trim() || null;
}

/**
 * Đơn có từ HAI em trở lên mà còn dòng chưa khai học viên → chặn.
 *
 * Đơn một con để trống ô học viên vẫn hợp lệ (khách vãng lai, con chưa có hồ sơ —
 * tên con lúc đó nằm trong tên khoá học). Nhưng ngay khi đơn mang hai em, một dòng
 * trống là một khoản tiền KHÔNG AI BIẾT của ai — và nó chỉ lộ ra lúc hoàn tiền hoặc
 * lúc phụ huynh hỏi, tức là muộn nhất có thể.
 */
export function thieuHocVienODong(
  items: readonly { studentId?: string | null }[],
): boolean {
  return (
    hocVienTrenCacDong(items).length > 1 &&
    items.some((it) => !it.studentId?.trim())
  );
}
