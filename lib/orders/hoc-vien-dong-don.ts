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
