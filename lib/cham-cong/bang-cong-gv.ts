/**
 * lib/cham-cong/bang-cong-gv.ts — dựng DÒNG cho bảng công site giáo viên.
 *
 * THUẦN — không `@/lib/db`, không `next/*`, không JSX. Test được không cần Postgres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO TÁCH RA KHỎI `app/(teacher)/teacher/bang-cong/page.tsx`
 *
 * Đây là LẦN THỨ BA site GV tự dựng lại con số mà admin đã tính (luật 12b). Phép nối
 * "ngày công đã tính × ca đã xếp" nằm inline trong một trang RSC thì không ai canh được:
 * không có chỗ nào cấy lỗi vào để thấy đỏ. Nay nó là một hàm, và
 * `bang-cong-gv.test.ts` cấy đúng ba lỗi đã xảy ra thật.
 *
 * Hàm này KHÔNG tính công. Nó JOIN `StaffAttendanceDay` (thứ admin đọc) vào từng dòng và
 * gắn nhãn qua `nhan-ca.ts` (thứ admin dùng). Mọi con số ở đây đều đến từ đối số.
 */
import {
  laNgayNghi,
  nhanGioCa,
  nhanLoaiCa,
  trangThaiBuoiDay,
  trangThaiNgay,
  type LoaiMaCa,
  type TrangThaiNgay,
} from "./nhan-ca";
import { gopNgayCong, type NgayCongGop } from "./tong-hop-cong";

export type LoaiOCa = "Dạy" | "Trải nghiệm" | "Ca làm" | "Nghỉ" | "Nghỉ phép";

/** Một buổi ĐỨNG LỚP (ClassSession) hoặc buổi trải nghiệm, đã chuẩn hoá phần hiển thị. */
export type BuoiDay = {
  key: string;
  /** "YYYY-MM-DD" giờ VN. */
  ngay: string;
  loai: "Dạy" | "Trải nghiệm";
  ten: string;
  phu: string | null;
  gio: string;
  /** Giờ ước tính từ khung giờ lớp — KHÔNG phải công. */
  soGio: number | null;
  /** `status === "COMPLETED"`. Đây là thứ duy nhất chốt được một buổi. */
  hoanTat: boolean;
};

/** Một ca đã xếp trên lưới (`ShiftAssignment` qua `getMyAssignments`). */
export type CaXep = {
  ngay: string;
  ma: string;
  ten: string;
  kind: LoaiMaCa;
  noi: string;
  /** Chuỗi giờ dựng từ các đoạn WORK; "" khi mã không có đoạn nào. */
  gio: string;
};

/** Một dòng `StaffAttendanceDay` đã tính — CÙNG nguồn màn admin đọc. */
export type CongNgay = {
  ngay: string;
  /** `workedMinutes`. */
  phutLam: number;
  /** `overrideUnits ?? dayCreditEarned`. */
  cong: number;
  flags: string[];
  /** `templateCode` — mã ca engine đã dùng khi tính ngày đó. */
  ma: string | null;
};

export type DongBangCong = {
  key: string;
  ten: string;
  phu: string | null;
  loai: LoaiOCa;
  /** Khoá ISO — dùng để SẮP XẾP, hiển thị thì đổi sang dd/mm ở tầng trang. */
  ngay: string;
  gio: string;
  /** Giờ DẠY ước tính. `null` → "—". */
  soGio: number | null;
  /** Phút làm THẬT từ `StaffAttendanceDay`. `null` = dòng này không phải ca làm. */
  phutLam: number | null;
  /** Công của NGÀY. `null` = chưa có dòng ngày công. */
  cong: number | null;
  flags: string[];
  trangThai: TrangThaiNgay;
};

/**
 * Ghép ba nguồn thành các dòng của bảng công GV.
 *
 * @param homNay "YYYY-MM-DD" giờ VN. HÔM NAY **không** phải tương lai — một ngày đang diễn ra
 *   mà chưa ai quét thì đúng là "Chưa chấm", không phải "Sắp tới".
 */
export function dungDongBangCong(input: {
  buoi: readonly BuoiDay[];
  ca: readonly CaXep[];
  cong: readonly CongNgay[];
  homNay: string;
}): DongBangCong[] {
  const { buoi, ca, cong, homNay } = input;
  const congTheoNgay = new Map(cong.map((c) => [c.ngay, c]));
  const tuongLai = (ngay: string) => ngay > homNay;
  const ra: DongBangCong[] = [];

  for (const b of buoi) {
    ra.push({
      key: b.key,
      ten: b.ten,
      phu: b.phu,
      loai: b.loai,
      ngay: b.ngay,
      gio: b.gio,
      soGio: b.soGio,
      // Buổi dạy không mang giờ làm / công của ngày: một ngày có thể có 2 buổi + 1 ca, gắn
      // số của NGÀY vào từng buổi là in cùng con số nhiều lần — một kiểu nói dối khác.
      phutLam: null,
      cong: null,
      flags: [],
      trangThai: trangThaiBuoiDay({ tuongLai: tuongLai(b.ngay), hoanTat: b.hoanTat }),
    });
  }

  // ⚠️ KHÔNG bỏ qua ca nghỉ. Bản cũ `if (r.isLeave) continue` làm ngày `P` BIẾN MẤT khỏi bảng
  // và để `X` (isLeave = false) lọt qua thành "Ca làm · theo nơi làm".
  for (const c of ca) {
    const n = congTheoNgay.get(c.ngay) ?? null;
    const nghi = laNgayNghi(c.kind);
    ra.push({
      key: `s-${c.ngay}-${c.ma}`,
      ten: `${c.ma} · ${c.ten}`,
      phu: c.noi,
      loai: nhanLoaiCa(c.kind),
      ngay: c.ngay,
      gio: nhanGioCa(c.kind, c.gio),
      soGio: null,
      phutLam: nghi ? null : (n?.phutLam ?? null),
      cong: n?.cong ?? null,
      flags: nghi ? [] : (n?.flags ?? []),
      trangThai: trangThaiNgay({
        tuongLai: tuongLai(c.ngay),
        kind: c.kind,
        ngayCong: n ? { workedMinutes: n.phutLam, units: n.cong } : null,
      }),
    });
  }

  // Ngày CÓ công đã tính nhưng KHÔNG còn ca nào xếp (quét ngoài lịch, ca bị gỡ sau khi tính,
  // quản lý ghi đè công). Admin liệt kê đủ mọi ngày của kỳ nên vẫn thấy; bảng GV dựng theo CA
  // nên trước đây những ngày này rơi mất — rơi mất số là dạng lệch tệ nhất: không ai biết để hỏi.
  const ngayCoCa = new Set(ca.map((c) => c.ngay));
  for (const n of cong) {
    if (ngayCoCa.has(n.ngay)) continue;
    if (n.phutLam === 0 && n.cong === 0 && n.flags.length === 0) continue;
    ra.push({
      key: `c-${n.ngay}`,
      ten: n.ma ? `${n.ma} · không còn ca xếp` : "Không có ca xếp",
      phu: null,
      loai: "Ca làm",
      ngay: n.ngay,
      gio: "—",
      soGio: null,
      phutLam: n.phutLam,
      cong: n.cong,
      flags: n.flags,
      trangThai: trangThaiNgay({
        tuongLai: tuongLai(n.ngay),
        kind: "TIMED",
        ngayCong: { workedMinutes: n.phutLam, units: n.cong },
      }),
    });
  }

  ra.sort((a, b) => a.ngay.localeCompare(b.ngay) || a.gio.localeCompare(b.gio));
  return ra;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TỔNG HỢP CÔNG THÁNG (mục 1 — bộ chốt 15/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Ba ràng buộc của chủ dự án, và chỗ từng cái được thi hành:
//
//  1. MỌI số đọc từ `StaffAttendanceDay` qua `getMyAttendanceDays`. CẤM cộng thẳng từ
//     `StaffTimeLog` — đó đúng là gốc bug nơi chịu công (13/09). Hàm này chỉ nhận
//     `NgayCongGop[]`, nên nguồn thứ ba KHÔNG có đường vào.
//     · Ngoại lệ DUY NHẤT, và nó không phải `StaffTimeLog`: số ĐƠN đọc từ `WorkRequest`
//       (đơn là sự việc riêng, không phải lượt quét).
//  2. Nhãn phải khai PHẠM VI ⇒ `kyKhoa` · `tinhToiNgay` · `gomNgayTuongLai` trả ra để
//     trang in thành câu, không để người đọc tự đoán "tháng này tính tới đâu".
//  3. KHÔNG tính được thì "—", không phải 0 ⇒ kiểu `So = number | null`. `null` nghĩa là
//     KHÔNG ĐO ĐƯỢC; `0` nghĩa là đo được và bằng không. Hai chuyện khác nhau — đúng
//     bài học nhãn "Đã làm".

/** `null` = CHƯA/KHÔNG đo được (in "—"). `0` = đo được và bằng không. Đừng trộn hai thứ. */
export type So = number | null;

/** Cờ mà NGƯỜI DÙNG phải làm gì đó — bộ bốn họ chủ dự án chốt 15/09. */
export const CO_CAN_XU_LY = new Set([
  "DI_MUON",
  "VE_SOM",
  "KHONG_CO_LUOT",
  "THIEU_LUOT_RA",
  "RA_KHONG_CO_VAO",
  "SAI_NOI_LAM",
]);
// ⚠️ CỐ Ý KHÔNG gồm: THIEU_GIO · NGOAI_VUNG · CHAM_NGOAI_LICH · VUOT_TRAN. Chúng nằm trong
// `CO_CANH_BAO` (tập rộng hơn, admin dùng để đếm `flaggedDays`) nhưng không phải việc người
// đi làm tự xử lý được bằng một cái đơn. Ghi ra để lần sau ai thấy hai con số lệch nhau thì
// biết đó là chủ đích, không phải sót.

export type TomTatCong = {
  // ── Phạm vi — ràng buộc 2 ───────────────────────────────────────────────────
  kyKhoa: string;
  /** "YYYY-MM-DD" nếu kỳ đang chạy (số mới tính tới đây); `null` nếu kỳ đã qua trọn. */
  tinhToiNgay: string | null;
  /** Tháng đang xem có chứa ngày chưa tới hay không. */
  gomNgayTuongLai: boolean;

  // ── A · năm thẻ đầu trang ───────────────────────────────────────────────────
  cong: number;
  congChuan: So;
  phutLam: number;
  ngayDaCham: number;
  ngayCoCa: number;
  ngayCanXuLy: number;
  kyTrangThai: "OPEN" | "CLOSING" | "LOCKED" | "REOPENED" | null;
  kyChotLuc: Date | null;

  // ── B · chi tiết ────────────────────────────────────────────────────────────
  lateCount: number;
  latePhut: number;
  earlyCount: number;
  earlyPhut: number;
  thieuLuotNgay: number;
  nghiPhep: number;
  nghiTuan: number;
  nghiLe: number;
  congTacNgay: number;
  congTacDuCap: number;
  /** Ngày quản lý GHI ĐÈ công. */
  ghiDeCong: number;
  /** Đơn chỉnh công ĐÃ DUYỆT trong tháng. */
  donChinhDaDuyet: So;
  /** "Tự chỉnh" — KHÔNG đo được vì đường ấy không tồn tại. Xem chú thích dưới. */
  tuChinh: So;
  donChoDuyet: So;
  donTuChoi: So;
};

/** Mã ca mang nghĩa ĐI CÔNG TÁC. Một chỗ, đừng rải chuỗi "NG" khắp nơi. */
const MA_CONG_TAC = new Set(["NG"]);

/** Có ít nhất một cặp vào–ra đã đóng. Cùng phép kiểm `noi-quy.ts` dùng cho nội quy. */
function coDuCapVaoRa(pairs: unknown): boolean {
  if (!Array.isArray(pairs)) return false;
  return pairs.some((p) => {
    if (!p || typeof p !== "object") return false;
    const o = p as Record<string, unknown>;
    return o.open === false && typeof o.inId === "string" && typeof o.outId === "string";
  });
}

export function tomTatCongThang(input: {
  ngay: readonly NgayCongGop[];
  kyKhoa: string;
  congChuan: So;
  kyTrangThai: TomTatCong["kyTrangThai"];
  kyChotLuc: Date | null;
  /** "YYYY-MM-DD" giờ VN. Đối số — hàm này KHÔNG đọc đồng hồ (luật 19). */
  homNay: string;
  /** Ngày đầu và ngày cuối của tháng đang xem, "YYYY-MM-DD". */
  dauThang: string;
  cuoiThang: string;
  don: { choDuyet: number; daDuyetChinhCong: number; tuChoi: number } | null;
}): TomTatCong {
  const g = gopNgayCong(input.ngay);

  let nghiPhep = 0;
  let nghiTuan = 0;
  let nghiLe = 0;
  let congTacNgay = 0;
  let congTacDuCap = 0;
  let ngayDaCham = 0;
  let ngayCanXuLy = 0;
  let thieuLuotNgay = 0;

  for (const d of input.ngay) {
    if (d.dayType === "HOLIDAY") nghiLe += 1;
    else if (d.dayType === "WEEKLY_OFF") nghiTuan += 1;
    else if (d.dayType === "LEAVE") nghiPhep += 1;

    if (d.templateCode && MA_CONG_TAC.has(d.templateCode)) {
      congTacNgay += 1;
      if (coDuCapVaoRa(d.pairs)) congTacDuCap += 1;
    }

    const laNgayLam = d.dayType === "WORK" && d.dayCreditExpected > 0;
    // "Đã chấm" = ĐÃ CÓ DẤU, không phải "đã đủ giờ". Ngày quét vào mà quên quét ra vẫn là
    // đã có dấu — nó mang `THIEU_LUOT_RA` chứ không mang `KHONG_CO_LUOT`. Đếm bằng
    // `workedMinutes > 0` sẽ xếp ngày ấy vào nhóm "chưa có dấu" và người ta đi tìm nhầm việc.
    if (laNgayLam && !d.flags.includes("KHONG_CO_LUOT")) ngayDaCham += 1;

    if (d.flags.some((f) => CO_CAN_XU_LY.has(f))) ngayCanXuLy += 1;
    if (d.flags.includes("THIEU_LUOT_RA") || d.flags.includes("RA_KHONG_CO_VAO"))
      thieuLuotNgay += 1;
  }

  const dangChay = input.homNay >= input.dauThang && input.homNay <= input.cuoiThang;

  return {
    kyKhoa: input.kyKhoa,
    tinhToiNgay: dangChay ? input.homNay : null,
    gomNgayTuongLai: input.cuoiThang > input.homNay,

    cong: g.units,
    congChuan: input.congChuan,
    phutLam: g.workedMinutes,
    ngayDaCham,
    ngayCoCa: g.ngayCoCa,
    ngayCanXuLy,
    kyTrangThai: input.kyTrangThai,
    kyChotLuc: input.kyChotLuc,

    lateCount: g.lateCount,
    latePhut: g.latePhut,
    earlyCount: g.earlyLeaveCount,
    earlyPhut: g.earlyLeavePhut,
    thieuLuotNgay,
    nghiPhep,
    nghiTuan,
    nghiLe,
    congTacNgay,
    congTacDuCap,
    ghiDeCong: g.overrideDays,
    donChinhDaDuyet: input.don ? input.don.daDuyetChinhCong : null,
    // ⚠️ "TỰ CHỈNH" LUÔN LÀ null, và đó là CÂU TRẢ LỜI chứ không phải việc còn nợ.
    //
    // Đo 15/09/2026: hệ thống KHÔNG có đường nào cho một người tự sửa giờ của chính mình.
    // Hai thứ thật sự phân biệt được là:
    //   · `StaffAttendanceDay.overrideUnits` — QUẢN LÝ ghi đè công (`ghiDeCong` ở trên);
    //   · `WorkRequest(TIMESHEET_FIX, APPROVED)` — giờ thêm QUA ĐƠN đã duyệt.
    // Vắng đường tự chỉnh là CHỦ ĐÍCH (không ai tự sửa công của mình). In "—" ở đây nói
    // đúng điều đó; in 0 sẽ đọc thành "có đường ấy, tháng này chưa ai dùng".
    tuChinh: null,
    donChoDuyet: input.don ? input.don.choDuyet : null,
    donTuChoi: input.don ? input.don.tuChoi : null,
  };
}
