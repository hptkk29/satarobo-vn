/**
 * Site Sale — ĐỔI ĐƯỜNG DẪN của khu quản trị sang bản Sale tương ứng.
 *
 * ── Vì sao tệp này tồn tại ──────────────────────────────────────────────────
 * `lib/pending-tasks.ts` là kho việc DÙNG CHUNG cho mọi site, nhưng mỗi nhóm
 * việc nó trả về mang sẵn một `href` viết theo đường SẠCH của khu quản trị
 * (`/leads`, `/students/sap-het-khoa`, `/sinh-nhat`…). Trên host
 * `sale.satarobo.vn`, `decideRoute` viết lại MỌI đường lạ thành `/sale/<đường>`
 * (`lib/auth/route-policy.ts`, nhánh host "sale") ⇒ `/leads` thành `/sale/leads`
 * (may mắn có thật) còn `/students/sap-het-khoa` thành
 * `/sale/students/sap-het-khoa` → **404 trắng trơn**.
 *
 * Đây KHÔNG phải lỗi của `lib/pending-tasks.ts`: nó không được phép biết mình
 * đang được vẽ trên site nào. Việc dịch đường là việc của site, và site Sale làm
 * nó ở đúng MỘT chỗ — tệp này — thay vì rải `href.replace(...)` vào JSX.
 *
 * ── Luật ────────────────────────────────────────────────────────────────────
 *   1. Đường nào site Sale ĐÃ CÓ bản riêng → trỏ bản Sale.
 *   2. Đường nào CHƯA CÓ → **giữ nguyên**, và đó là `⚠️ NỢ ĐÃ BIẾT` (xem cuối
 *      tệp). Giữ nguyên là không tạo hồi quy — bản mount cũ cũng hỏng y hệt —
 *      chứ không phải là đúng. Vá thật = dựng màn tương ứng trong
 *      `app/(sale)/sale/**`, và đó là việc THÊM MÀN, phải hỏi chủ dự án.
 *   3. Đường tuyệt đối (`http…`) không đụng tới: đó là site khác
 *      (`elearningHomeUrl()`), không phải đường nội bộ.
 *
 * Hàm THUẦN: không đọc DB, không đọc env, không đụng `Date`. Có bài kiểm riêng
 * (`duong-dan-sale.test.ts`) vì đây là loại lỗi im lặng — link hỏng không ném
 * ngoại lệ nào, chỉ ra một trang trắng khi người dùng bấm.
 */

/** Ánh xạ TRỌN ĐƯỜNG (không kèm truy vấn) admin → Sale. */
const DOI_NGUYEN_DUONG: Record<string, string> = {
  "/leads": "/sale/leads",
  "/students/sap-het-khoa": "/sale/sap-het-khoa",
  "/cham-soc-hv": "/sale/cham-soc-hv",
  "/sinh-nhat": "/sale/sinh-nhat",
};

/**
 * Chi tiết một lead. Bản Sale KHÔNG phải `/sale/leads/{id}` — site Sale có màn
 * hồ sơ khách của riêng nó (`/sale/khach-cua-toi/{id}`), và đó mới là màn dành
 * cho người trực tiếp chăm khách: không có nút đổi người phụ trách, không có
 * nút bàn giao (xem đầu `app/(sale)/sale/khach-cua-toi/[id]/page.tsx`).
 */
const CHI_TIET_LEAD = /^\/leads\/([^/?#]+)$/;

/**
 * @param href đường do một module dùng chung sinh ra, viết theo host quản trị.
 * @returns đường dùng được trên host Sale, hoặc chính nó nếu chưa có bản Sale.
 */
export function duongSale(href: string): string {
  if (!href.startsWith("/")) return href; // http(s), mailto, tel… — site khác
  if (href.startsWith("/sale/") || href === "/sale") return href; // đã là bản Sale

  // Tách truy vấn/neo trước khi tra bảng: `/leads?status=DA_DANG_KY` phải khớp
  // khoá `/leads` rồi mang nguyên `?status=…` sang bản Sale. Không tách thì mọi
  // đường có bộ lọc đều rơi xuống nhánh "chưa có bản Sale" mà không ai thấy.
  const cat = href.search(/[?#]/);
  const duong = cat === -1 ? href : href.slice(0, cat);
  const duoi = cat === -1 ? "" : href.slice(cat);

  const doi = DOI_NGUYEN_DUONG[duong];
  if (doi) return doi + duoi;

  const lead = CHI_TIET_LEAD.exec(duong);
  if (lead) return `/sale/khach-cua-toi/${lead[1]}${duoi}`;

  // ⚠️ NỢ ĐÃ BIẾT — về tới đây là đường CHƯA có bản Sale. Danh sách đã gặp thật
  // trong `lib/pending-tasks.ts`, kèm màn Sale sẽ phải dựng nếu muốn vá:
  //   `/students/{id}/edit`      → chưa có màn hồ sơ học viên bên Sale
  //   `/classes…` `/sessions…`   → `/sale/lop-hoc` `/sale/buoi-hoc` CÓ danh sách
  //                                nhưng KHÔNG có màn chi tiết/duyệt tương ứng,
  //                                nên trỏ sang là đổi một link 404 lấy một link
  //                                sai đích — tệ hơn.
  //   `/parent-requests…`        → mục này đã bị GỠ khỏi site Sale có chủ đích
  //                                (commit 25c6b0f3), đừng nối lại.
  //   `/media` `/report-cards` `/canh-bao-rui-ro` `/cham-cong/chinh-cong`
  //                              → nhóm việc của vai quản lý; chỉ hiện ra khi
  //                                người đang xem kiêm vai đó.
  return href;
}
