// lib/finance/nhap-giao-dich-sheet.ts — đọc sheet đăng ký thành GIAO DỊCH HỌC PHÍ.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO TỒN TẠI
//
// Học viên chốt trước khi hệ thống chạy thì không có `Payment` nào, nên cổng phụ huynh
// cộng công nợ theo `Enrollment.payments` ra NỢ NGUYÊN — dù nhà đã đóng đủ từ lâu. Nguồn
// sự thật của những khoản đó là file `Satarobo - Danh sách đăng ký.xlsx`.
//
// File này chỉ ĐỌC và CHUẨN HOÁ. Nó không chạm DB, không quyết định ghi gì — để phần luật
// nguy hiểm nhất test được mà không cần database, và để màn xem thử với đường ghi dùng
// CHUNG một phép tính (hai phép tính là hai con số, và người ta sẽ tin con số trên màn).
//
// ─────────────────────────────────────────────────────────────────────────────
// BỐN CÁI BẪY ĐO ĐƯỢC TRONG CHÍNH FILE — mỗi cái một đường mất tiền
//
//  (1) DÒNG TỔNG. 12 dòng không tên/không mã/không tình trạng, chỉ có một ô tiền, cộng
//      lại 1.382.987.666đ = 62% tổng tiền cả file. `Tháng 52026!d16 = 30.322.000đ` đúng
//      bằng tổng 6 dòng phía trên. Nhập nhầm là thổi doanh thu gấp 2,7 lần.
//
//  (2) SHEET LỒNG NHAU. "Tháng 62026" chứa TRỌN "Tháng 52026" (6/6 dòng khớp cả mã lẫn
//      tiền). Nhập cả hai là cộng đôi 30.322.000đ tiền thật.
//
//  (3) MÃ KHÔNG NHẤT QUÁN. `CS1.HV.0031` và `CS1.HV0031` là cùng một em. So chuỗi thô
//      tách một em thành hai, và một nửa tiền rơi vào hồ sơ không tồn tại.
//
//  (4) NHIỀU ĐỢT MỘT EM. 21 em đóng 2 đợt, 3 em đóng 3 đợt. Gộp phải CỘNG DỒN; ghi đè
//      là xoá mất đợt trước.
// ─────────────────────────────────────────────────────────────────────────────

/** Một dòng thô từ XLSX — khoá là nhãn cột trong file. */
export type DongSheet = Record<string, unknown>;

export type GiaoDichSheet = {
  sheet: string;
  /** Số dòng trong sheet — để người soát mở đúng chỗ trong file gốc. */
  dong: number;
  maHV: string | null;
  hoTen: string | null;
  sdt: string | null;
  hocPhi: number;
  ngay: Date | null;
  khoa: string | null;
  coSo: string | null;
  tinhTrang: string;
  ghiChu: string;
};

/**
 * `CS1.HV0031` · `CS1.HV.31` · `cs1 hv 31` → `CS1.HV.0031`.
 *
 * Đệm 0 cho đủ 4 chữ số vì DB dùng dạng đó (`Student.studentCode`, đo thật: 250/250 bản
 * ghi mang dạng `CS1.HV.0001`). Chuỗi không theo khuôn thì trả null — KHÔNG bịa mã, vì
 * cột mã trong file có chỗ bị gõ ghi chú vào (`"NHẬP TAB THÁNG 8"`).
 */
export function chuanMaHV(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (!s) return null;
  const m = /^(CS\d+)[.\s]*HV[.\s]*(\d+)$/.exec(s);
  if (!m) return null;
  return `${m[1]}.HV.${String(Number(m[2])).padStart(4, "0")}`;
}

/** `'078 3264020'` → `'0783264020'`. Số 0 đầu KHÔNG được mất. */
export function chuanSdtSheet(v: unknown): string | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  s = s.replace(/\D/g, "");
  if (!s) return null;
  if (s.startsWith("84") && s.length >= 11) s = "0" + s.slice(2);
  if (s.length === 9 && !s.startsWith("0")) s = "0" + s;
  return s.length >= 9 ? s : null;
}

function chuoi(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function tien(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v).replace(/[^\d]/g, "");
  return s ? Number(s) : 0;
}

/**
 * Dòng này có phải DÒNG TỔNG / dòng rác không.
 *
 * FAIL-CLOSED: thiếu tình trạng thì LOẠI, kể cả khi có tên và có tiền. Không biết khoản
 * đã vào tài khoản hay chưa mà vẫn ghi là tự tạo ra một khoản thu không có căn cứ —
 * người nhập sẽ thấy nó ở danh sách bỏ qua và tự quyết.
 */
export function laDongTong(d: {
  maHV: string | null;
  hoTen: string | null;
  tinhTrang: string;
  hocPhi: number;
}): boolean {
  if (d.hocPhi <= 0) return true;
  if (!d.tinhTrang) return true;
  if (!d.maHV && !d.hoTen) return true;
  return false;
}

/** Lấy ô theo nhiều nhãn — header giữa các sheet không đồng nhất. */
function o(d: DongSheet, ...ten: string[]): unknown {
  for (const t of ten) {
    for (const k of Object.keys(d)) {
      if (k.replace(/\s+/g, " ").trim().toLowerCase() === t) {
        const v = d[k];
        if (v != null && String(v).trim() !== "") return v;
      }
    }
  }
  return undefined;
}

export function docDongGiaoDich(
  d: DongSheet,
  sheet: string,
  dong: number,
): GiaoDichSheet | null {
  const maHV = chuanMaHV(o(d, "mã học viên", "mã hv"));
  const hoTen = chuoi(o(d, "họ và tên học viên")) || null;
  const tinhTrang = chuoi(o(d, "tình trạng"));
  const hocPhi = tien(o(d, "học phí"));

  if (laDongTong({ maHV, hoTen, tinhTrang, hocPhi })) return null;

  const ngayRaw = o(d, "ngày");
  let ngay: Date | null = null;
  if (ngayRaw instanceof Date) ngay = ngayRaw;
  else if (ngayRaw != null) {
    const t = new Date(String(ngayRaw));
    if (!Number.isNaN(t.getTime())) ngay = t;
  }

  return {
    sheet,
    dong,
    maHV,
    hoTen,
    sdt: chuanSdtSheet(o(d, "số điện thoại")),
    hocPhi,
    ngay,
    khoa: chuoi(o(d, "khoá học đăng ký", "khóa học đăng ký")) || null,
    // ⚠️ "minh" là nhãn cột BỊ GÕ NHẦM ở sheet "Tháng 62026", đúng vị trí cột Cơ sở.
    // Đọc cả hai vì sửa file gốc không phải việc của mã, và bỏ qua thì mất cơ sở của
    // 63 dòng.
    coSo: chuoi(o(d, "cơ sở", "minh")) || null,
    tinhTrang,
    ghiChu: chuoi(o(d, "ghi chú")),
  };
}

export type KetQuaTrungSheet = {
  chuaTron: boolean;
  soDongTrung: number;
  /** Số tiền sẽ bị cộng đôi nếu nhập cả hai sheet. */
  tienCongDoi: number;
};

/**
 * Sheet `nho` có nằm trọn trong sheet `lon` không.
 *
 * Khoá so là (mã, số tiền) — KHÔNG có ngày, vì sheet "Tháng 52026" không điền ngày trong
 * khi "Tháng 62026" có. So thêm ngày là bỏ sót đúng cặp cần bắt.
 *
 * Cùng mã mà KHÁC tiền thì không phải trùng — đó là hai đợt đóng khác nhau của cùng một
 * em, và gộp chúng lại là xoá mất một đợt.
 */
export function sheetChuaTronSheet(
  nho: Array<{ maHV: string | null; hocPhi: number }>,
  lon: Array<{ maHV: string | null; hocPhi: number }>,
): KetQuaTrungSheet {
  const coMa = nho.filter((x) => x.maHV);
  if (coMa.length === 0) return { chuaTron: false, soDongTrung: 0, tienCongDoi: 0 };

  const khoaLon = new Set(lon.filter((x) => x.maHV).map((x) => `${x.maHV}|${x.hocPhi}`));
  const trung = coMa.filter((x) => khoaLon.has(`${x.maHV}|${x.hocPhi}`));

  return {
    chuaTron: trung.length === coMa.length,
    soDongTrung: trung.length,
    tienCongDoi: trung.reduce((s, x) => s + x.hocPhi, 0),
  };
}

export type HocVienGop = {
  maHV: string | null;
  hoTen: string | null;
  sdt: string | null;
  tongTien: number;
  soDot: number;
  /** Không có mã ⇒ không khớp tự động được, phải có người chỉ đúng học viên. */
  canNguoiXem: boolean;
  giaoDich: GiaoDichSheet[];
};

/**
 * Gộp giao dịch theo học viên — CỘNG DỒN.
 *
 * Giữ nguyên từng giao dịch trong `giaoDich` để màn xem thử chỉ ra được dòng nào ở sheet
 * nào; một con tổng không giải trình được thì không ai dám bấm.
 */
export function gopTheoHocVien(gd: GiaoDichSheet[]): HocVienGop[] {
  const map = new Map<string, HocVienGop>();

  for (const g of gd) {
    // Không mã thì gộp theo SĐT + tên. Đây là phương án LÙI, và nó được đánh dấu
    // `canNguoiXem` chứ không im lặng coi như đã khớp.
    const khoa = g.maHV ?? `SDT:${g.sdt ?? ""}|${g.hoTen ?? ""}`;
    const cu = map.get(khoa);
    if (cu) {
      cu.tongTien += g.hocPhi;
      cu.soDot += 1;
      cu.giaoDich.push(g);
      cu.hoTen = cu.hoTen ?? g.hoTen;
      cu.sdt = cu.sdt ?? g.sdt;
    } else {
      map.set(khoa, {
        maHV: g.maHV,
        hoTen: g.hoTen,
        sdt: g.sdt,
        tongTien: g.hocPhi,
        soDot: 1,
        canNguoiXem: g.maHV == null,
        giaoDich: [g],
      });
    }
  }

  // Thứ tự ổn định theo khoá — kết quả không được đổi theo thứ tự đọc sheet.
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, v]) => v);
}
