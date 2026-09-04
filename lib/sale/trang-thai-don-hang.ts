/**
 * Site Sale — thang màu ngữ nghĩa + danh sách lựa chọn cho màn "Đơn hàng".
 *
 * ── BẢN ĐÔI CỦA CÁI GÌ, VÀ CÁI GÌ THÌ KHÔNG ─────────────────────────────────
 * Bản gốc: bốn hằng nằm THẲNG trong
 * `app/(admin)/admin/orders/_components/orders-list-client.tsx`:
 * `ALL_STATUSES`, `ALL_TYPES`, `STATUS_BADGE_CLASS`, và nhánh màu của
 * `deriveInstallmentBadge`.
 *
 * ⚠️ NHÃN THÌ KHÔNG CHÉP. `ORDER_STATUS_LABEL` / `ORDER_TYPE_LABEL` /
 *    `deriveInstallmentBadge` đã là hàng dùng chung ở `@/lib/orders/status` —
 *    tệp này GỌI LẠI, không chép. Chép nhãn là hai màn cùng tên gọi một trạng
 *    thái bằng hai chữ khác nhau, đúng thứ nguy hiểm nhất của đợt tách bản.
 *    Chỉ chép thứ KHÔNG có bản dùng chung: thứ tự mục lọc và cách chọn màu.
 *
 * Chủ dự án chốt 04/09/2026: màn site Sale tách bản riêng để thiết kế lại mà
 * không đụng một pixel nào của khu quản trị. Rủi ro trôi lệch đã nêu; đây là
 * **nợ trôi lệch có ghi sổ** — thêm một `OrderStatus` mới ở admin thì `Record`
 * đầy đủ dưới đây làm typecheck đỏ, nên chỗ này hỏng TO TIẾNG chứ không im lặng.
 *
 * ── LUẬT ĐẶT MÀU (soi chiếu `trang-thai-dang-ky.ts` + `trang-thai-khach.ts`) ──
 * Chữ mang GIAI ĐOẠN, màu mang MỨC CẦN ĐỘNG TAY:
 *   warning → đúng một trạng thái đòi làm gì đó ngay: "Chờ thanh toán".
 *   info    → trong luồng, không đòi việc: "Đã xác nhận đơn".
 *   success → đã xong xuôi: "Hoàn tất".
 *   danger  → mất đơn: "Đã huỷ".
 *   muted   → chưa vào sổ ("Nháp") hoặc đã rời sổ có chủ đích ("Đã hoàn tiền").
 *
 * ⚠️ MỘT CHỖ CỐ Ý ĐỔI NGHĨA SO VỚI ADMIN — `REFUNDED`. Bản admin cho nó tone
 *    thương hiệu (`bg-primary-soft text-primary`). Hệ thiết kế Sale CẤM: trên
 *    site này tím là màu của NÚT và MỤC ĐANG ĐỨNG (`sale.css` §s-nav-link),
 *    gán thêm cho nó nghĩa "một trạng thái đơn nào đó" là hỏng cả hai nghĩa.
 *    Đây đúng tiền lệ đã xử ở `trang-thai-dang-ky.ts` (TRANSFERRED brand→muted).
 *    Không dùng `danger` để tránh "Đã huỷ" và "Đã hoàn tiền" ra cùng một màu —
 *    hai việc khác hẳn nhau về sổ sách.
 *
 * Hàm THUẦN: không DB, không env, không `Date`.
 */
import type { OrderStatus, OrderType } from "@prisma/client";
import type { PillTone } from "@/components/admin/ui/status-pill";
import type { InstallmentBadge } from "@/lib/orders/status";

/**
 * Thứ tự mục trong ô lọc "Trạng thái" — chép NGUYÊN thứ tự `ALL_STATUSES` của
 * bản admin.
 *
 * ⚠️ Cố ý KHÔNG sinh từ `Object.values(OrderStatus)`: thứ tự enum Prisma là thứ
 *    tự khai báo trong schema, đổi schema là đổi thứ tự ô lọc mà không ai thấy.
 */
export const MOI_TRANG_THAI_DON: readonly OrderStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

/** Thứ tự mục trong ô lọc "Loại" — chép NGUYÊN `ALL_TYPES` của bản admin. */
export const MOI_LOAI_DON: readonly OrderType[] = [
  "COURSE",
  "PACKAGE",
  "EXAM",
  "PRODUCT",
  "COMBO",
];

/** `Record` đầy đủ — thêm trạng thái mà quên khai là lỗi typecheck, không phải lỗi lúc chạy. */
const TONE_THEO_TRANG_THAI: Record<OrderStatus, PillTone> = {
  DRAFT: "muted",
  PENDING_PAYMENT: "warning",
  CONFIRMED: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
  REFUNDED: "muted",
};

export function toneTrangThaiDon(trangThai: OrderStatus): PillTone {
  return TONE_THEO_TRANG_THAI[trangThai];
}

/**
 * Màu của nhãn suy diễn "tiến độ trả góp".
 *
 * `deriveInstallmentBadge` trả `color: "emerald" | "amber"` — tên MÀU THÔ, di
 * sản của thời badge gõ tay class. Đổi kiểu trả về là sửa `lib/orders/status.ts`
 * dùng chung (kéo theo bản admin), ngoài phạm vi đợt tách này ⇒ dịch tại đây.
 */
export function toneTraGop(mau: InstallmentBadge["color"]): PillTone {
  return mau === "emerald" ? "success" : "warning";
}
