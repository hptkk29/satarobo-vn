/**
 * Site Sale — nhãn + THANG MÀU NGỮ NGHĨA cho trạng thái ảnh lớp học.
 *
 * ── Vì sao file này tồn tại (04/09/2026) ────────────────────────────────────
 * Chủ dự án chốt 04/09: màn `/sale/anh-lop-hoc` TÁCH BẢN RIÊNG, không mount lại
 * component của khu quản trị nữa. Bốn nhãn trạng thái ở bản admin được ghép
 * bằng một biểu thức ba ngôi bốn tầng ngay trong JSX
 * (`media-client.tsx` — `m.status === "APPROVED" ? "Duyệt" : …`), không export
 * được, nên nhãn phải nằm ở một chỗ dùng chung — chỗ đó là file này.
 *
 * ⚠️ ĐÂY LÀ BẢN ĐÔI CÓ CHỦ ĐÍCH. Nhãn ở đây phải KHỚP TỪNG CHỮ với biểu thức
 *    trong `app/(admin)/admin/media/_components/media-client.tsx`. Đổi nhãn một
 *    bên mà quên bên kia thì hai site gọi cùng một trạng thái bằng hai cái tên —
 *    kiểu trôi lệch tệ nhất vì không có lỗi nào nổ ra.
 *
 * ⚠️ TONE KHỚP ĐÚNG bản admin, không tự ý xếp lại: `APPROVED`→success,
 *    `REJECTED`→danger, `DRAFT`→info, còn lại (`PENDING`)→warning. Khác biệt duy
 *    nhất là ĐƯỜNG ĐI: admin ghép class Tailwind theo token ngay trong JSX, site
 *    Sale đi qua `<StatusPill tone={…}>` — cùng thang ngữ nghĩa, một chỗ định
 *    nghĩa (luật `lib/sale/ky-luat-mau.test.ts`).
 *
 * ⚠️ KHÔNG trạng thái nào nhận tone `brand`: màu thương hiệu là màu của NÚT và
 *    MỤC ĐANG CHỌN. Xem `lib/sale/trang-thai-dao-tao.ts` cho luật đầy đủ.
 *
 * Hàm THUẦN: không đọc DB, không đọc env, không đụng `Date` — nên client
 * component import được mà không kéo theo Prisma.
 */
import type { PillTone } from "@/components/admin/ui/status-pill";

/**
 * `ClassSessionMedia.status` là `String` trong schema chứ không phải enum, nên
 * không có `Record` đầy đủ nào để typecheck bắt hộ. Bốn giá trị dưới đây là
 * toàn bộ những gì luồng ảnh sinh ra (`DRAFT` → `PENDING` → `APPROVED`/`REJECTED`);
 * giá trị lạ rơi vào nhánh mặc định "Chờ", y như bản admin.
 */
export function nhanTrangThaiAnh(trangThai: string): string {
  if (trangThai === "APPROVED") return "Duyệt";
  if (trangThai === "REJECTED") return "Từ chối";
  if (trangThai === "DRAFT") return "Trong kho";
  return "Chờ";
}

export function toneTrangThaiAnh(trangThai: string): PillTone {
  // Đã duyệt = ảnh đã tới phụ huynh, mọi thứ đúng như mong đợi.
  if (trangThai === "APPROVED") return "success";
  // Từ chối là một quyết định đã chốt và có hậu quả (ảnh không bao giờ tới PH).
  if (trangThai === "REJECTED") return "danger";
  // Trong kho: một dữ kiện — ảnh đang nằm chờ giáo viên chọn, không phải việc
  // của người đang xem màn này.
  if (trangThai === "DRAFT") return "info";
  // Chờ duyệt là việc DUY NHẤT trên màn này đòi người có `media:approve` động tay.
  return "warning";
}

/** Hai chế độ của ô lọc thư viện — khớp hợp đồng của `<select>` bản admin. */
export const NHAN_LOC_THU_VIEN = {
  ACTIVE: "Chờ duyệt / Đã duyệt / Từ chối",
  DRAFT: "Trong kho (GV chưa gửi)",
} as const;

export type LocThuVien = keyof typeof NHAN_LOC_THU_VIEN;
