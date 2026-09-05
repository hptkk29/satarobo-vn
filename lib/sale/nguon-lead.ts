/**
 * Site Sale — rút gọn chuỗi NGUỒN của lead cho chỗ hẹp (ô bảng, thẻ kanban, ngăn
 * chi tiết).
 *
 * ── BẢN ĐÔI CỦA `shortSource()` — bản admin khai NGAY TRONG
 *    `app/(admin)/admin/leads/_components/leads-table.tsx` ────────────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng. Hàm này THUẦN (không DB, không
 * session, không `Date`) nên nằm ở `lib/sale/` chứ không trong JSX — ba chỗ của
 * màn Leads Sale cùng gọi một bản, và bài kiểm soi được nó mà không cần dựng React.
 *
 * ⚠️ Tệp này CỐ Ý không có `import "server-only"`: cả ba chỗ gọi đều là component
 *    phía trình duyệt. `lib/sale/leads.ts` (truy vấn) thì ngược lại — đừng gộp hai
 *    thứ vào một tệp.
 *
 * Quy tắc giữ nguyên 100% từ bản admin: nguồn được ghi dạng nhiều đoạn nối bằng
 * `" - "`; lấy HAI đoạn đầu và nối lại bằng `" · "`. Rỗng thì trả về gạch ngang,
 * KHÔNG trả chuỗi rỗng — một ô trắng trong bảng đọc ra là "chưa nạp xong".
 */
export function rutGonNguon(nguon: string | null | undefined): string {
  if (!nguon) return "—";
  return nguon.split(" - ").slice(0, 2).join(" · ");
}
