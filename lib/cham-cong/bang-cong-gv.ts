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
// BẢNG TỔNG HỢP CÔNG (mục 1) — bốn số ở hàng đầu + khối gấp lại
// ═══════════════════════════════════════════════════════════════════════════════
//
// Chủ dự án chốt 13/09: "Đừng bày mười số ngang nhau, không ai đọc số nào."
//
// Ba ràng buộc, và chỗ từng cái được thi hành:
//  1. MỌI con số đọc từ cùng nguồn admin đọc ⇒ mọi tổng ở đây đến từ `gopNgayCong`
//     (`tong-hop-cong.ts`), đúng hàm `buildPeriodSummary` gọi. Hàm dưới KHÔNG cộng lại gì.
//  2. Nhãn phải nói đúng thứ nó đếm ⇒ xem `NHAN_TOM_TAT` và hai đính chính ghi ở đó.
//  3. Kỳ chưa chốt thì ghi rõ TẠM TÍNH ⇒ `tamTinh` dưới đây, đọc từ trạng thái KỲ chứ
//     không phải từ "tháng này có phải tháng hiện tại không" (bản cũ đoán theo tháng: một
//     tháng đã qua mà kỳ chưa chốt vẫn là tạm tính, mà bản cũ in như số cuối cùng).

/** Một nhóm ngày nghỉ, tách theo đúng thứ DB phân biệt được — không bịa nhóm. */
export type NhomNghi = {
  khoa: string;
  nhan: string;
  soNgay: number;
};

export type TomTatCong = {
  /** Công thực nhận trong tháng. */
  cong: number;
  /** Công chuẩn của KỲ. `null` = kỳ chưa được lập ⇒ phải in "—", đừng in 0. */
  congChuan: number | null;
  ngayDaLam: number;
  ngayCoCa: number;
  latePhut: number;
  lateCount: number;
  earlyLeavePhut: number;
  earlyLeaveCount: number;
  /** Tổng ngày nghỉ mọi loại (lễ + nghỉ tuần + phép). */
  ngayNghi: number;
  nhomNghi: NhomNghi[];
  phutLam: number;
  phutKeHoach: number;
  /** Ngày CÓ VẤN ĐỀ — thứ người dùng cần thấy để đi nộp đơn. */
  thieuLuotRa: number;
  chuaCham: number;
  chinhTay: number;
  /** Kỳ chưa chốt ⇒ mọi số trên là TẠM TÍNH. */
  tamTinh: boolean;
};

/**
 * Gom một tháng của MỘT người thành bộ số cho màn "Bảng công".
 *
 * `congChuan` và `kyDaChot` là ĐỐI SỐ, không tra trong này: hàm phải thuần để cấy lỗi được.
 */
export function tomTatCongThang(input: {
  ngay: readonly NgayCongGop[];
  congChuan: number | null;
  kyDaChot: boolean;
}): TomTatCong {
  const g = gopNgayCong(input.ngay);

  // Tách nghỉ theo đúng thứ `dayType` phân biệt được. Nhóm "phép" tách tiếp CÓ/KHÔNG lương
  // bằng `leaveUnits` — engine đã ghi sẵn phần hưởng lương, không suy từ mã ca.
  let le = 0;
  let nghiTuan = 0;
  let phepCoLuong = 0;
  let phepKhongLuong = 0;
  for (const d of input.ngay) {
    if (d.dayType === "HOLIDAY") le += 1;
    else if (d.dayType === "WEEKLY_OFF") nghiTuan += 1;
    else if (d.dayType === "LEAVE") {
      if (d.leaveUnits > 0) phepCoLuong += 1;
      else phepKhongLuong += 1;
    }
  }
  const nhomNghi: NhomNghi[] = [
    { khoa: "phep-co-luong", nhan: "Phép có lương", soNgay: phepCoLuong },
    { khoa: "phep-khong-luong", nhan: "Phép không lương", soNgay: phepKhongLuong },
    { khoa: "le", nhan: "Nghỉ lễ", soNgay: le },
    { khoa: "nghi-tuan", nhan: "Nghỉ tuần", soNgay: nghiTuan },
  ].filter((n) => n.soNgay > 0);

  let thieuLuotRa = 0;
  for (const d of input.ngay)
    if (d.flags.includes("THIEU_LUOT_RA") || d.flags.includes("RA_KHONG_CO_VAO"))
      thieuLuotRa += 1;

  return {
    cong: g.units,
    congChuan: input.congChuan,
    ngayDaLam: g.ngayDaLam,
    ngayCoCa: g.ngayCoCa,
    latePhut: g.latePhut,
    lateCount: g.lateCount,
    earlyLeavePhut: g.earlyLeavePhut,
    earlyLeaveCount: g.earlyLeaveCount,
    ngayNghi: le + nghiTuan + phepCoLuong + phepKhongLuong,
    nhomNghi,
    phutLam: g.workedMinutes,
    phutKeHoach: g.expectedMinutes,
    thieuLuotRa,
    chuaCham: g.missingTapDays,
    chinhTay: g.overrideDays,
    tamTinh: !input.kyDaChot,
  };
}
