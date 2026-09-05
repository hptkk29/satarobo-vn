/**
 * Site Sale — nhãn + thang màu ngữ nghĩa cho trạng thái GHI DANH.
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: hằng `STATUS_INFO` + `DEFAULT_ACTIVE_STATUSES` + danh sách `<option>`
 * nằm ngay trong `app/(admin)/admin/enrollments/page.tsx`.
 *
 * Chủ dự án chốt 04/09/2026: các màn site Sale **tách bản riêng**, không mount
 * lại và không dùng chung component với khu quản trị nữa, để thiết kế lại giao
 * diện Sale mà không đụng một pixel nào của khu quản trị. Rủi ro trôi lệch đã
 * được nêu và chủ dự án vẫn chọn đường này ⇒ tệp này là **nợ trôi lệch có ghi
 * sổ**: sửa nhãn/danh sách trạng thái ở admin thì phải sửa cả ở đây.
 *
 * ── CHỮ giữ nguyên 100%, MÀU thì không ──────────────────────────────────────
 * Nhãn ("Chờ xếp", "Đã xếp"…) chép NGUYÊN VĂN từ bản admin — người dùng hai khu
 * phải gọi cùng một thứ bằng cùng một tên.
 *
 * Màu thì đi qua `StatusPill` (thang ngữ nghĩa theo token) thay vì chuỗi class
 * gõ tay. Một chỗ đổi nghĩa có chủ đích: admin cho TRANSFERRED tone thương hiệu
 * (`bg-primary-soft text-primary`). Hệ thiết kế Sale CẤM điều đó —
 * `lib/sale/trang-thai-khach.ts` đã ghi: màu thương hiệu là màu của NÚT và MỤC
 * ĐANG CHỌN; cho nó thêm nghĩa "một trạng thái nào đó" là hỏng cả hai nghĩa.
 * Trên site Sale tím là màu khắp nơi (nút, mục đang đứng, liên kết) nên lỗi này
 * còn nặng hơn ở admin.
 *
 * ── LUẬT ĐẶT MÀU (soi chiếu `trang-thai-khach.ts`) ──────────────────────────
 * Chữ mang GIAI ĐOẠN, màu mang MỨC CẦN ĐỘNG TAY:
 *   warning → đúng MỘT trạng thái đòi Sale làm gì đó ngay: "Chờ xếp".
 *   danger  → đã mất học viên: "Đã rút", "Đã huỷ".
 *   success → đang học thật: "Đang học" (cả nhánh legacy `ACTIVE`).
 *   info    → trong luồng, không đòi việc: "Đã xếp", "Hoàn thành".
 *   muted   → gác lại / đã rời sổ này có chủ đích: "Bảo lưu", "Đã chuyển".
 * Trải sáu màu cho chín trạng thái là đổi bức tường chữ thành bức tường màu.
 *
 * Hàm THUẦN: không DB, không env, không `Date`.
 */
import { EnrollmentStatus } from "@prisma/client";
import type { PillTone } from "@/components/admin/ui/status-pill";

/** Nhãn tiếng Việt — chép nguyên văn `STATUS_INFO[...].label` của bản admin. */
export const NHAN_TRANG_THAI_DANG_KY: Record<EnrollmentStatus, string> = {
  PENDING: "Chờ xếp",
  CONFIRMED: "Đã xếp",
  STUDYING: "Đang học",
  PAUSED: "Bảo lưu",
  COMPLETED: "Hoàn thành",
  WITHDREW: "Đã rút",
  TRANSFERRED: "Đã chuyển",
  // Giá trị legacy — vẫn còn trên dữ liệu thật (xem `lib/enrollment-status.ts`:
  // ACTIVE là mặc định của schema và là thứ đường convert lead sinh ra).
  ACTIVE: "Đang học (legacy)",
  CANCELLED: "Đã huỷ",
};

/** `Record` đầy đủ — thêm trạng thái mà quên khai là lỗi typecheck, không phải lỗi lúc chạy. */
const TONE_THEO_TRANG_THAI: Record<EnrollmentStatus, PillTone> = {
  PENDING: "warning",
  CONFIRMED: "info",
  STUDYING: "success",
  ACTIVE: "success",
  PAUSED: "muted",
  COMPLETED: "info",
  WITHDREW: "danger",
  CANCELLED: "danger",
  TRANSFERRED: "muted",
};

export function toneTrangThaiDangKy(trangThai: EnrollmentStatus): PillTone {
  return TONE_THEO_TRANG_THAI[trangThai];
}

/**
 * Bộ trạng thái của lựa chọn "Đang hoạt động (mặc định)".
 * Chép từ `DEFAULT_ACTIVE_STATUSES` của bản admin.
 *
 * ⚠️ KHÔNG thay bằng `ENROLLMENT_ACTIVE_STATUSES` (lib/enrollment-status.ts) cho
 *    "gọn": bộ kia có PAUSED (bảo lưu vẫn thuộc lớp) còn bộ này thì không, nên
 *    đổi là bộ lọc mặc định của màn hiện thêm học viên bảo lưu — tức đổi NỘI
 *    DUNG màn, đúng thứ đợt tách này không được phép làm.
 */
export const TRANG_THAI_DANG_HOAT_DONG: EnrollmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "STUDYING",
  "ACTIVE",
];

/** Giá trị ảo của bộ lọc trạng thái (không phải giá trị enum). */
export const LOC_DANG_HOAT_DONG = "active";
export const LOC_TAT_CA = "all";

export type LocTrangThaiDangKy = EnrollmentStatus | typeof LOC_DANG_HOAT_DONG | typeof LOC_TAT_CA;

/**
 * Danh sách mục của ô lọc trạng thái — ĐÚNG thứ tự và ĐÚNG câu chữ của bản admin.
 *
 * ⚠️ Cố ý KHÔNG sinh tự động từ `NHAN_TRANG_THAI_DANG_KY`: bản admin không liệt
 *    kê ACTIVE và CANCELLED trong ô lọc (hai giá trị legacy), mà vẫn hiển thị
 *    chúng trong cột trạng thái. Sinh tự động là lặng lẽ thêm hai mục vào ô lọc.
 */
export const MUC_LOC_TRANG_THAI: ReadonlyArray<{ value: string; label: string }> = [
  { value: LOC_DANG_HOAT_DONG, label: "Đang hoạt động (mặc định)" },
  { value: LOC_TAT_CA, label: "Tất cả trạng thái" },
  { value: "PENDING", label: NHAN_TRANG_THAI_DANG_KY.PENDING },
  { value: "CONFIRMED", label: NHAN_TRANG_THAI_DANG_KY.CONFIRMED },
  { value: "STUDYING", label: NHAN_TRANG_THAI_DANG_KY.STUDYING },
  { value: "PAUSED", label: NHAN_TRANG_THAI_DANG_KY.PAUSED },
  { value: "COMPLETED", label: NHAN_TRANG_THAI_DANG_KY.COMPLETED },
  { value: "WITHDREW", label: NHAN_TRANG_THAI_DANG_KY.WITHDREW },
  { value: "TRANSFERRED", label: NHAN_TRANG_THAI_DANG_KY.TRANSFERRED },
];

/**
 * Đọc tham số `status` trên URL thành bộ lọc. Giá trị lạ → về mặc định
 * "đang hoạt động" (fail-safe: không bao giờ mở rộng phạm vi vì gõ sai URL).
 */
export function docLocTrangThai(thamSo: string | undefined): LocTrangThaiDangKy {
  if (thamSo === LOC_TAT_CA) return LOC_TAT_CA;
  if (thamSo && (Object.values(EnrollmentStatus) as string[]).includes(thamSo)) {
    return thamSo as EnrollmentStatus;
  }
  return LOC_DANG_HOAT_DONG;
}
