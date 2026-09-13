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

/** Số ca LÀM VIỆC — dòng nghỉ nay có trong bảng nhưng không phải một ca công. */
export function demCaLam(rows: readonly DongBangCong[]): number {
  return rows.filter((r) => r.loai !== "Nghỉ" && r.loai !== "Nghỉ phép").length;
}
