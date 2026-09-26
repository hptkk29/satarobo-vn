// lib/agents/tools/kinh-doanh/dang-ky-thuan.ts — phần THUẦN của `kinh_doanh.lay_dang_ky`.
//
// Tách khỏi truy vấn để mỗi luật có ca test không cần DB và cấy lỗi được (luật 14). Mọi luật
// "dòng nào là gì" nằm ở đây; `lay-dang-ky.ts` chỉ đọc dữ liệu rồi gọi các hàm này.
import { ngayCuaCotDate, ngayVN } from "../../gateway/thoi-gian";

/** Mã khoá cho mọi dòng HỌC THỬ (spec §9: `khoa = "TRIAL_1_1"` cho buổi Test Trial 1-1). */
export const KHOA_HOC_THU = "TRIAL_1_1";

/**
 * Trạng thái ghi danh tính là "đã đăng ký".
 *
 * ⚠️ CÓ `ACTIVE` — lệch với mặc định BA Q-D12 (chỉ CONFIRMED/STUDYING/COMPLETED) vì ĐO được:
 * đường convert lead chính (`lib/crm/convert-lead-v2.ts`, `tx.enrollment.create`) KHÔNG đặt
 * `status` ⇒ ghi danh rơi về `@default(ACTIVE)` (giá trị legacy). Lọc theo Q-D12 là đánh rơi
 * phần lớn ghi danh thật. `PAUSED` (bảo lưu) vẫn là đã đăng ký.
 * KHÔNG có: PENDING (chưa chốt), CANCELLED/WITHDREW (huỷ/thôi học — nếu có hoàn tiền thì hiện
 * ở dòng `hoan_tien`), TRANSFERRED (đã chuyển — ghi danh MỚI ở lớp đích mới là dòng đếm).
 */
export const TRANG_THAI_DA_DANG_KY = ["ACTIVE", "CONFIRMED", "STUDYING", "PAUSED", "COMPLETED"] as const;

/**
 * Trạng thái hoàn tiền tính là "đã hoàn". Đo 26/09/2026: `RefundStatus.PAID` KHÔNG có đường ghi
 * nào trong mã (chỉ `approveRefund` → APPROVED và `rejectRefund` → REJECTED, `lib/finance/refund.ts`)
 * ⇒ "đã hoàn" thực tế = APPROVED, mốc ngày = `approvedAt`. Giữ PAID trong danh sách để ngày có
 * bước "đã chi" thì không phải sửa công cụ.
 */
export const TRANG_THAI_DA_HOAN = ["APPROVED", "PAID"] as const;

export type BuoiLop = { id: string; date: Date; status: string };

export type GhiDanhHocThu = {
  id: string;
  leadChildId: string;
  createdAt: Date;
  scheduledSessionId: string | null;
  trialClassId: string;
  theoKhung: boolean;
  sessions: readonly BuoiLop[];
};

/**
 * Ngày học thử của một lượt xếp lớp trải nghiệm ("YYYY-MM-DD") — thứ tự ưu tiên:
 *   1. ngày ĐÃ HỌC thật (`LeadTrialHistory.firstAttendedAt`, chỉ ghi khi điểm danh);
 *   2. buổi được xếp riêng (`scheduledSessionId`) nếu buổi đó chưa huỷ;
 *   3. lớp KHÔNG theo khung + chưa xếp buổi = "học cả lớp" (`lib/trial/nghia-null.ts`) ⇒ buổi
 *      sớm nhất chưa huỷ của lớp;
 *   4. lớp theo khung chưa xếp case ⇒ null (chưa có ngày — nói thật).
 */
export function ngayHocThuCua(te: GhiDanhHocThu, daHocLuc: Date | null): string | null {
  if (daHocLuc) return ngayVN(daHocLuc);
  const conSong = te.sessions.filter((s) => s.status !== "CANCELLED");
  if (te.scheduledSessionId) {
    const b = conSong.find((s) => s.id === te.scheduledSessionId);
    if (b) return ngayCuaCotDate(b.date);
  }
  if (te.theoKhung) return null;
  let som: string | null = null;
  for (const s of conSong) {
    const d = ngayCuaCotDate(s.date);
    if (som === null || d < som) som = d;
  }
  return som;
}

export type DongDangKy = {
  lead_id: string;
  khoa: string;
  trang_thai: "da_hen_hoc_thu" | "da_dang_ky" | "hoan_tien";
  ngay_hoc_thu: string | null;
  ngay_dang_ky: string | null;
  hoc_phi_niem_yet: number;
  van_ban_khuyen_mai: string | null;
  co_so: string;
  /** Trường THÊM (spec §7.2 cho phép): khoá mà lớp học thử gắn (nếu có). Chỉ dòng học thử. */
  khoa_quan_tam?: string | null;
};

/** Dòng kèm mốc sắp xếp — mốc không trả ra ngoài. */
export type DongCoMoc = { dong: DongDangKy; moc: string; khoaSap: string };

/** Dòng ghi danh: đã đăng ký, hoặc đã hoàn nếu có hoàn tiền trước hết ngày `den`. */
export function dongGhiDanh(p: {
  leadId: string;
  khoa: string;
  coSo: string;
  ngayDangKy: string;
  ngayHoan: string | null;
  ngayHocThu: string | null;
  giaNiemYet: number | null;
  vanBan: string | null;
  enrollmentId: string;
}): DongCoMoc {
  return {
    dong: {
      lead_id: p.leadId,
      khoa: p.khoa,
      trang_thai: p.ngayHoan ? "hoan_tien" : "da_dang_ky",
      ngay_hoc_thu: p.ngayHocThu,
      ngay_dang_ky: p.ngayDangKy,
      hoc_phi_niem_yet: p.giaNiemYet ?? 0,
      van_ban_khuyen_mai: p.vanBan,
      co_so: p.coSo,
    },
    moc: p.ngayHoan ?? p.ngayDangKy,
    khoaSap: `e:${p.enrollmentId}`,
  };
}

/**
 * Chọn lượt học thử đại diện cho mỗi bé: mốc SỚM nhất trong khoảng (mốc = ngày học thử, không
 * có thì ngày xếp lớp). Bé đã có dòng ghi danh trong kết quả ⇒ bỏ (bé đã đi tiếp khỏi bước
 * học thử; ngày học thử nằm sẵn trên dòng ghi danh). Một bé = tối đa MỘT dòng học thử: hai
 * lượt xếp lớp của cùng một bé (đổi lớp) không phải hai khách hẹn học thử.
 */
export function chonHocThu<T extends { leadChildId: string; id: string; moc: string }>(
  ds: readonly T[],
  tu: string,
  den: string,
  beDaDangKy: ReadonlySet<string>,
): T[] {
  const theoBe = new Map<string, T>();
  for (const x of ds) {
    if (x.moc < tu || x.moc > den) continue;
    if (beDaDangKy.has(x.leadChildId)) continue;
    const cu = theoBe.get(x.leadChildId);
    if (!cu || x.moc < cu.moc || (x.moc === cu.moc && x.id < cu.id)) theoBe.set(x.leadChildId, x);
  }
  return [...theoBe.values()];
}

/** Thứ tự ổn định cho phân trang: mốc ngày, rồi lead, rồi khoá nội bộ phá hoà. */
export function sapDong(ds: DongCoMoc[]): DongDangKy[] {
  return [...ds]
    .sort((a, b) =>
      a.moc !== b.moc
        ? a.moc < b.moc ? -1 : 1
        : a.dong.lead_id !== b.dong.lead_id
          ? a.dong.lead_id < b.dong.lead_id ? -1 : 1
          : a.khoaSap < b.khoaSap ? -1 : a.khoaSap > b.khoaSap ? 1 : 0,
    )
    .map((x) => x.dong);
}

/** Ngày học thử của một bé = ngày SỚM nhất trong các lượt đã biết ngày. */
export function ngaySomNhat(ds: readonly (string | null)[]): string | null {
  let som: string | null = null;
  for (const d of ds) if (d !== null && (som === null || d < som)) som = d;
  return som;
}
