import { formatPhoneVN } from "@/lib/phone";

// =============================================================================
// Bảng khai THAM SỐ của các mẫu ZNS đã được Zalo duyệt + hàm dựng params.
//
// ⚠️ Tên tham số là HỢP ĐỒNG với mẫu đã duyệt, KHÔNG phải tên ta tự đặt lúc soạn
// nội dung. Gửi sai tên / thiếu tham số → Zalo trả `-1122 template data is
// missing a parameter`, tin KHÔNG tới, mà luồng gọi vẫn báo thành công (mọi nơi
// gọi đều `.catch(() => {})` để không chặn luồng tiền). Đó đúng là bug PR #77:
// mẫu Xác thực bắt buộc tên `otp`, code gửi `code`.
//
// Trước bản vá này, hai nơi gọi mẫu học phí gửi bộ tham số hoàn toàn khác bảng
// khai của 616258 — đặt env `ZALO_ZNS_TEMPLATE_PAYMENT` là hỏng ngay cả hai
// đường mà không ai thấy. File này gom hợp đồng về một chỗ; `templates.test.ts`
// đối chiếu bộ khoá do hàm dựng sinh ra với bảng khai, nên sửa lệch một bên là
// test đỏ chứ không phải phụ huynh im lặng không nhận tin.
//
// Đổi mẫu bên Zalo (thêm/bớt/đổi tên tham số) ⇒ PHẢI sửa bảng này theo.
// =============================================================================

type ParamSpec = { readonly type: "string" | "number"; readonly max: number };

/**
 * Mẫu **"Thông báo xác nhận học phí"** — ZBS `616258`, Mẫu tuỳ chỉnh,
 * 700đ/tin qua SĐT · 490đ/tin qua UID · Ztime 7200s.
 *
 * `max` là giới hạn ký tự Zalo khai trong mẫu — vượt là bị từ chối.
 */
export const ZNS_TUITION_PARAM_SPEC = {
  date: { type: "string", max: 20 },
  phone: { type: "string", max: 15 },
  course: { type: "string", max: 200 },
  total_course_fee: { type: "number", max: 20 },
  paid_fee: { type: "number", max: 20 },
  studentName: { type: "string", max: 50 },
} as const satisfies Record<string, ParamSpec>;

/**
 * Mẫu **"Thông báo nhận mã OTP"** — ZBS `616128`, Mẫu OTP,
 * 400đ/tin qua SĐT · 280đ/tin qua UID · Ztime 15s.
 *
 * Mẫu chỉ khai đúng một tham số. `lib/zalo/otp-provider.ts` gửi kèm `minutes`:
 * Zalo bỏ qua tham số thừa (đã chứng minh bằng tin thật 01/08/2026) nên không
 * gãy, nhưng đó là dư thừa — đừng lấy làm tiền lệ.
 */
export const ZNS_OTP_PARAM_SPEC = {
  otp: { type: "string", max: 10 },
} as const satisfies Record<string, ParamSpec>;

const VN_TZ = "Asia/Ho_Chi_Minh";

/**
 * Định dạng `HH:mm:ss dd/MM/yyyy` — đúng bản mẫu khai ở ô "Nội dung tham số"
 * của 616258 (`12:00:00 31/07/2026`), dài 19 ký tự ≤ 20.
 *
 * Ép múi giờ Việt Nam: app chạy region `hnd1` (UTC+9), lấy giờ máy sẽ lệch 2
 * tiếng so với giờ phụ huynh đọc trên tin.
 */
export function formatZnsDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}:${get("second")} ${get("day")}/${get("month")}/${get("year")}`;
}

/** Cắt theo giới hạn mẫu + thay rỗng bằng chữ đỡ, để không gửi chuỗi trống. */
function clamp(raw: string | null | undefined, max: number, fallback: string): string {
  const s = (raw ?? "").trim() || fallback;
  return s.length > max ? s.slice(0, max) : s;
}

/** Tiền gửi đi phải là SỐ (mẫu khai kiểu number) — không phải chuỗi "1.000.000". */
function money(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

export type TuitionZnsInput = {
  /** Mốc thời gian hiển thị trên tin — dùng `paidAt` nếu đã thu, không thì `createdAt`. */
  at: Date;
  /** SĐT phụ huynh (dạng nào cũng được, hàm tự đưa về `0XXXXXXXXX` để đọc). */
  phone: string;
  courseName: string | null;
  totalFee: number;
  paidFee: number;
  studentName: string | null;
};

/**
 * Dựng params cho mẫu học phí `616258` — đúng 6 khoá, đúng kiểu, đúng giới hạn.
 * THUẦN: không chạm DB/mạng nên test được trực tiếp.
 */
export function buildTuitionZnsParams(input: TuitionZnsInput): Record<string, string | number> {
  return {
    date: formatZnsDateTime(input.at),
    phone: clamp(formatPhoneVN(input.phone), ZNS_TUITION_PARAM_SPEC.phone.max, "—"),
    course: clamp(input.courseName, ZNS_TUITION_PARAM_SPEC.course.max, "Khoá học"),
    total_course_fee: money(input.totalFee),
    paid_fee: money(input.paidFee),
    studentName: clamp(input.studentName, ZNS_TUITION_PARAM_SPEC.studentName.max, "Quý phụ huynh"),
  };
}
