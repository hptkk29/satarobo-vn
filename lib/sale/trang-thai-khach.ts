/**
 * Site Sale — ánh xạ trạng thái khách sang thang màu NGỮ NGHĨA của hệ thiết kế.
 *
 * ── LUẬT: chữ mang GIAI ĐOẠN, màu mang MỨC CẦN ĐỘNG TAY ─────────────────────
 * Nhãn đã in ra tên giai đoạn rồi ("Đang tư vấn", "Đã hẹn học thử"), nên nhuộm
 * mỗi giai đoạn một màu chỉ đổi bức tường chữ thành bức tường màu. Người tư vấn
 * quét bảng 40 dòng để trả lời đúng MỘT câu: *hôm nay gọi ai trước?* Màu phải
 * trả lời câu đó.
 *
 * ⚠️ Kho đang có BA bộ màu trạng thái song song, và bảng Sale trước 28/08 không
 *    dùng bộ nào:
 *      1. `LEAD_STATUS_BADGE` (lib/leads/status.ts) — mười màu Tailwind rời
 *         (`bg-sky-100`…), đúng thứ `DESIGN.md §1` cấm: hex/màu rời trong mã.
 *      2. `StatusPill` (components/admin/ui/status-pill.tsx) — thang ngữ nghĩa
 *         theo token. Đây là bộ ĐÚNG, và là bộ file này nạp vào.
 *      3. `<Badge variant="outline">` — bảng Sale từng dùng cái này: mười trạng
 *         thái ra MỘT màu tím nhạt, màu không mang tin gì.
 *    Không thêm bộ thứ tư. Muốn đổi màu một trạng thái thì sửa đúng bảng dưới.
 *
 * ⚠️ KHÔNG trạng thái nào được nhận tone `brand`. Màu thương hiệu là màu của NÚT
 *    và MỤC ĐANG CHỌN; cho nó thêm nghĩa "một trạng thái nào đó" là làm hỏng cả
 *    hai nghĩa. Cùng bài học đã ghi ở `DESIGN.md §1` (cam từng vừa nghĩa
 *    "thương hiệu" vừa nghĩa "ổn").
 *
 * Hàm THUẦN: không đọc DB, không đọc env, không đụng `Date` ngoài `toneDoNguoi`.
 */
import type { LeadStatus } from "@prisma/client";
import type { PillTone } from "@/components/admin/ui/status-pill";

/** Tone của trạng thái. `Record` đầy đủ — thêm trạng thái mà quên khai là lỗi typecheck. */
const TONE_THEO_TRANG_THAI: Record<LeadStatus, PillTone> = {
  // Chưa ai chạm. Đây là việc cần làm NGAY, và là nhóm duy nhất trong phễu đáng
  // được màu cảnh báo — để dành cảnh báo cho nhiều thứ là hết ai để ý tới nó.
  MOI: "warning",

  // Giữa phễu: đang chạy đúng hướng, không đòi hành động khẩn. Cùng một màu
  // trung tính cho cả sáu bước — bước nào là việc của CHỮ, không phải của màu.
  DA_LIEN_HE: "info",
  DANG_TU_VAN: "info",
  DA_HEN_HOC_THU: "info",
  DANG_HOC_THU: "info",
  DA_HOC_THU: "info",
  CHO_QUYET_DINH: "info",

  // Gác lại CÓ CHỦ ĐÍCH. Tô cảnh báo cho nhóm cố ý để lâu là dạy người dùng bỏ
  // qua màu cảnh báo ở mọi chỗ khác.
  DANG_NUOI_DUONG: "muted",

  DA_DANG_KY: "success",
  DA_MAT: "danger",
};

export function toneTrangThaiKhach(trangThai: LeadStatus): PillTone {
  return TONE_THEO_TRANG_THAI[trangThai];
}

// ─────────────────────────────────────────────────────────────────────────────
// ĐỘ NGUỘI — bao lâu rồi chưa chạm tới khách này
// ─────────────────────────────────────────────────────────────────────────────
// Bản cũ tô `text-amber-600` cho MỌI dòng quá 3 ngày *và* cho mọi khách chưa
// liên hệ. Trên dữ liệu thật gần như cả bảng vàng khè ⇒ màu vàng hết nghĩa.
// Nay ba mức, và mức thường nhất là KHÔNG TÔ GÌ.

/** Quá mốc này thì bắt đầu nhắc. */
const NGAY_NGUOI = 3;
/** Quá mốc này thì coi như đang rơi. */
const NGAY_RAT_NGUOI = 7;

/**
 * @returns `null` = còn ấm, đừng tô màu. Đây là kết quả PHỔ BIẾN NHẤT và phải
 *          im lặng — mọi dòng đều có màu thì không dòng nào nổi lên.
 */
export function toneDoNguoi(lanChamGanNhat: string | null): "warning" | "danger" | null {
  // Chưa chạm lần nào là nhóm dễ rơi nhất trong sổ. Không để nó thành ô trống.
  if (!lanChamGanNhat) return "danger";

  const moc = new Date(lanChamGanNhat).getTime();
  if (Number.isNaN(moc)) return "danger";

  const soNgay = (Date.now() - moc) / 86400_000;
  if (soNgay > NGAY_RAT_NGUOI) return "danger";
  if (soNgay > NGAY_NGUOI) return "warning";
  return null;
}

/** Câu giải thích cho người dùng, dùng chung giữa bảng và ô chú giải. */
export const CHU_GIAI_DO_NGUOI = `Chưa liên hệ hoặc quá ${NGAY_RAT_NGUOI} ngày không chạm: đỏ. Quá ${NGAY_NGUOI} ngày: vàng.`;
