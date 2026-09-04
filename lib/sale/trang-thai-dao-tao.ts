/**
 * Site Sale — nhãn + THANG MÀU NGỮ NGHĨA cho trạng thái Học viên và Lớp học.
 *
 * ── Vì sao file này tồn tại (04/09/2026) ────────────────────────────────────
 * Chủ dự án chốt 04/09: hai màn `/sale/hoc-vien` và `/sale/lop-hoc` TÁCH BẢN
 * RIÊNG, không mount lại component của khu quản trị nữa, để thiết kế lại site
 * Sale mà không đụng một pixel nào của khu quản trị (9 vai đang dùng hằng ngày).
 * Hai bảng `STATUS_INFO` gõ tay trong `app/(admin)/admin/students/page.tsx` và
 * `app/(admin)/admin/classes/page.tsx` KHÔNG export được (chúng là hằng nội bộ
 * của trang), nên nhãn phải nằm ở một chỗ dùng chung — chỗ đó là file này.
 *
 * ⚠️ ĐÂY LÀ BẢN ĐÔI CÓ CHỦ ĐÍCH. Nhãn ở đây phải KHỚP TỪNG CHỮ với
 *    `STATUS_INFO` của hai trang admin nói trên. Đổi nhãn một bên mà quên bên
 *    kia thì hai site gọi cùng một trạng thái bằng hai cái tên — kiểu trôi lệch
 *    tệ nhất vì không có lỗi nào nổ ra. Rủi ro này đã được nêu với chủ dự án
 *    trước khi chọn đường tách bản.
 *
 * ⚠️ MÀU KHÔNG chép từ admin, và đó là chủ đích. Admin ghép class Tailwind theo
 *    token (`bg-state-success-soft text-state-success-ink`) ngay trong bảng;
 *    site Sale đi qua `<StatusPill tone={...}>` — cùng thang ngữ nghĩa, một chỗ
 *    định nghĩa. Xem `lib/sale/trang-thai-khach.ts` cho luật đầy đủ; hai luật
 *    quan trọng nhất lặp lại ở đây:
 *      · CHỮ mang GIAI ĐOẠN, MÀU mang MỨC CẦN ĐỘNG TAY.
 *      · KHÔNG trạng thái nào được nhận tone `brand` — màu thương hiệu là màu
 *        của NÚT và MỤC ĐANG CHỌN. Đây là lý do `PENDING_APPROVAL` ở đây là
 *        `info` chứ không phải `bg-primary-soft text-primary` như bản admin.
 *
 * Hàm THUẦN: không đọc DB, không đọc env, không đụng `Date`.
 */
import type { ClassStatus, StudentStatus } from "@prisma/client";
import type { PillTone } from "@/components/admin/ui/status-pill";

// ─────────────────────────────────────────────────────────────────────────────
// HỌC VIÊN
// ─────────────────────────────────────────────────────────────────────────────

/** Khớp từng chữ với `STATUS_INFO` ở `app/(admin)/admin/students/page.tsx`. */
export const NHAN_TRANG_THAI_HOC_VIEN: Record<StudentStatus, string> = {
  ACTIVE: "Đang học",
  PAUSED: "Bảo lưu",
  GRADUATED: "Hoàn thành",
  INACTIVE: "Nghỉ học",
};

/** `Record` đầy đủ — thêm trạng thái mà quên khai là lỗi typecheck, không phải lỗi chạy. */
const TONE_HOC_VIEN: Record<StudentStatus, PillTone> = {
  // Đang học = mọi thứ đúng như mong đợi.
  ACTIVE: "success",
  // Bảo lưu là trạng thái TẠM và có hạn — người tư vấn cần thấy để gọi lại trước
  // khi hết hạn. Đây là nhóm duy nhất của bảng học viên đáng màu cảnh báo.
  PAUSED: "warning",
  // Xong khoá: một dữ kiện, không phải một việc.
  GRADUATED: "info",
  // Nghỉ hẳn — lùi về sau mắt, đừng tô đỏ. Đỏ để dành cho thứ hỏng, không phải
  // thứ đã kết thúc bình thường.
  INACTIVE: "muted",
};

export function toneTrangThaiHocVien(trangThai: StudentStatus): PillTone {
  return TONE_HOC_VIEN[trangThai];
}

// ─────────────────────────────────────────────────────────────────────────────
// LỚP HỌC
// ─────────────────────────────────────────────────────────────────────────────

/** Khớp từng chữ với `STATUS_INFO` ở `app/(admin)/admin/classes/page.tsx`. */
export const NHAN_TRANG_THAI_LOP: Record<ClassStatus, string> = {
  PLANNED: "Đang lên KH",
  RECRUITING: "Tuyển sinh",
  PENDING_APPROVAL: "Chờ duyệt",
  ACTIVE: "Đang dạy",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Huỷ",
};

const TONE_LOP: Record<ClassStatus, PillTone> = {
  // Chưa mở bán. Không có việc gì cho tư vấn viên ở đây.
  PLANNED: "muted",
  // Lớp ĐANG NHẬN HỌC VIÊN — với người tư vấn thì đây là dòng đáng nhìn nhất
  // trong cả bảng, và là lý do màn này tồn tại trên site Sale.
  RECRUITING: "warning",
  // Đợi người khác duyệt: một trạng thái chờ, không phải một việc của Sale.
  // Bản admin tô `bg-primary-soft text-primary`; ở đây KHÔNG dùng tone `brand`
  // (xem ghi chú đầu file) nên nó về `info`.
  PENDING_APPROVAL: "info",
  ACTIVE: "success",
  COMPLETED: "info",
  CANCELLED: "danger",
};

export function toneTrangThaiLop(trangThai: ClassStatus): PillTone {
  return TONE_LOP[trangThai];
}

/** Nhãn thứ trong tuần cho cột "Lịch" — index 0 = Chủ nhật, khớp `Date.getDay()`. */
export const NHAN_THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
