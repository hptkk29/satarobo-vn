// Định dạng + nhãn dùng chung của màn Cổng dữ liệu agent. THUẦN — không đọc DB, không
// directive, dùng được ở cả server lẫn client component.
import type { PillTone } from "@/components/admin/ui/status-pill";
import type { HangClient } from "@/lib/agents/quan-tri/doc";
// `kiem-grant.ts` là file THUẦN (không import gì) ⇒ kéo vào bundle client được.
import { MA_HOI_SO } from "@/lib/agents/gateway/kiem-grant";

const TZ = "Asia/Ho_Chi_Minh";

const FMT_NGAY_GIO = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const FMT_NGAY = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "en-CA" in ra đúng dạng YYYY-MM-DD — dùng cho giá trị của ô `<input type="date">`. */
const FMT_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function ngayGio(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return FMT_NGAY_GIO.format(typeof d === "string" ? new Date(d) : d);
}

export function ngay(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return FMT_NGAY.format(typeof d === "string" ? new Date(d) : d);
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function homNayVN(now: Date): string {
  return FMT_ISO.format(now);
}

/** Cộng `n` ngày vào chuỗi YYYY-MM-DD (tính trên lịch, không dính múi giờ máy). */
export function congNgay(yyyyMmDd: string, n: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * Ngày xa nhất ô `<input type="date">` nên cho chọn, với trần `toiDaNgay` lấy từ
 * `HAN_TOI_DA` (`lib/agents/quan-tri/chung.ts` — page đọc rồi truyền xuống, không chép số).
 *
 * Server so `hetHan (23:59:59 +07 của ngày chọn) > now + N ngày` ⇒ chọn đúng ngày thứ N là
 * VƯỢT trần (23:59 muộn hơn giờ hiện tại). Nên ngày xa nhất chọn được là hôm nay + (N − 1).
 * Server vẫn là nơi chặn thật; ở đây chỉ để ô ngày không mời chọn một ngày chắc chắn bị từ chối.
 */
export function ngayXaNhat(homNay: string, toiDaNgay: number): string {
  return congNgay(homNay, toiDaNgay - 1);
}

export { MA_HOI_SO };

export function nhanCoSo(ma: string): string {
  return ma === MA_HOI_SO ? "HO = toàn hệ thống" : ma;
}

export type TrangThaiAgent = HangClient["trangThai"];

const NHAN_TRANG_THAI: Record<TrangThaiAgent, { nhan: string; tone: PillTone }> = {
  PENDING: { nhan: "Chờ duyệt", tone: "warning" },
  ACTIVE: { nhan: "Hoạt động", tone: "success" },
  SUSPENDED: { nhan: "Tạm khoá", tone: "danger" },
  REVOKED: { nhan: "Thu hồi", tone: "muted" },
  REJECTED: { nhan: "Từ chối", tone: "muted" },
};

/**
 * Nhãn trạng thái. "Hết hạn" là thuộc tính tính lúc đọc (luật cứng #8) nên chỉ đè lên trạng
 * thái CÒN SỐNG — một mục đã Thu hồi/Từ chối thì trạng thái cuối đó mới là điều cần đọc.
 */
export function nhanTrangThai(tt: TrangThaiAgent, daHetHan: boolean): { nhan: string; tone: PillTone } {
  if (daHetHan && (tt === "PENDING" || tt === "ACTIVE" || tt === "SUSPENDED")) {
    return { nhan: "Hết hạn", tone: "muted" };
  }
  return NHAN_TRANG_THAI[tt];
}

/** Còn thu hồi được không — khớp điều kiện WHERE của `thuHoiClient` / `thuHoiGrant`. */
export function conThuHoiDuoc(tt: TrangThaiAgent): boolean {
  return tt === "PENDING" || tt === "ACTIVE" || tt === "SUSPENDED";
}

const NHAN_NHAY_CAM: Record<string, { nhan: string; tone: PillTone }> = {
  thap: { nhan: "Thấp", tone: "muted" },
  tb: { nhan: "Trung bình", tone: "warning" },
  cao: { nhan: "Cao", tone: "danger" },
};

export function nhanNhayCam(muc: string): { nhan: string; tone: PillTone } {
  return NHAN_NHAY_CAM[muc] ?? { nhan: muc, tone: "muted" };
}

/** Kết quả trả về của mọi Server Action ở màn này, rút gọn cho phía client. */
export type KetQuaAction = { ok: true } | { ok: false; error: string };

export const LOP_O_NHAP =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
