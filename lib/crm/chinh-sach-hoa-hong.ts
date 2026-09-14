// lib/crm/chinh-sach-hoa-hong.ts — CHÍNH SÁCH HOA HỒNG DO NGƯỜI VẬN HÀNH KHAI.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO TỒN TẠI, KHI ĐÃ CÓ `lib/crm/commission.ts`
//
// Chủ dự án 14/09/2026: "có thể thêm hoặc bớt các chính sách, thêm bớt các role nhận hoa
// hồng riêng chứ không khoá cứng 1 vài chính sách duy nhất làm lần sau nếu BGĐ ra chính
// sách mới thì dev phải code chính sách mới nữa… làm sao sau khi bàn giao thì dev không
// cần phải đụng gì nhiều nữa."
//
// `commission.ts` khoá cứng bốn tầng bằng union TypeScript:
//   `export type CommissionTier = "QC" | "SALE_ADMIN" | "SALE" | "QL_TT"`
// Thêm một vai nhận hoa hồng = sửa union = dev phải code. Và bốn tầng đó không mô tả nổi
// chính sách đã ban hành: đọc SR.QD.208 thì có BỐN trục biến thiên —
// (vai nhận) × (sự kiện) × (loại đơn) × (cách tính) — trong đó hai cách tính KHÔNG phải
// phần trăm (số tiền cố định khi bán thiết bị; thưởng theo bậc doanh thu).
//
// File này là tầng THUẦN cho chính sách đó. Nó KHÔNG thay `commission.ts` trong đợt này;
// `commission.ts` vẫn đang chạy đường tính hoa hồng kỳ hiện có.
//
// ─────────────────────────────────────────────────────────────────────────────
// LƯU Ở ĐÂU — và vì sao KHÔNG tạo bảng mới
//
// Chính sách là DỮ LIỆU CẤU HÌNH nhỏ (chục dòng), không phải dữ liệu giao dịch. Nó đi qua
// `SystemSetting` với key `crm.commissionPolicies` trong `lib/settings/registry.ts`, nên
// được thừa hưởng sẵn ba thứ mà một bảng mới phải tự làm lại: đường ghi có BẮT BUỘC LÝ DO,
// nhật ký kiểm toán, và override theo cơ sở (`centerOverridable`).
//
// Đổi lại: không query được bằng SQL và không có khoá ngoại tới `User`/`RoleDef`. Chấp
// nhận có chủ đích — `vaiNhan` là CHUỖI TỰ DO đúng theo yêu cầu "thêm bớt role không cần
// dev", và ràng buộc duy nhất là không để trống.
//
// ─────────────────────────────────────────────────────────────────────────────
// TRẦN TỔNG TÍNH THEO SỰ KIỆN, KHÔNG CỘNG CHUNG MỘT RỔ
//
// `commission.ts` cộng cả bốn tầng rồi so `crm.commissionMaxTotalRate`. Với chính sách
// thật, cộng tất cả là cộng cả "học viên mới" (9%) lẫn "tái tục" (2%) — ra 11% và báo
// vượt trần, trong khi KHÔNG có đồng học phí nào chịu cả hai sự kiện. Xem `[CSH-04]`.
//
// THUẦN — không Prisma, không DB, không `getSetting`. Người gọi nạp chính sách rồi truyền vào.
// ─────────────────────────────────────────────────────────────────────────────

/** Sự kiện sinh hoa hồng. CHUỖI, không enum Prisma — thêm sự kiện không cần migration. */
export const SU_KIEN = {
  HOC_VIEN_MOI: "HOC_VIEN_MOI",
  TAI_TUC: "TAI_TUC",
  CHUYEN_TRUNG_TAM: "CHUYEN_TRUNG_TAM",
  BAN_THIET_BI: "BAN_THIET_BI",
} as const;
export type SuKienHoaHong = (typeof SU_KIEN)[keyof typeof SU_KIEN];

export const NHAN_SU_KIEN: Record<SuKienHoaHong, string> = {
  HOC_VIEN_MOI: "Học viên mới",
  TAI_TUC: "Tái tục",
  CHUYEN_TRUNG_TAM: "Chuyển trung tâm",
  BAN_THIET_BI: "Bán thiết bị",
};

export const KIEU_TINH = {
  /** `giaTri` là tỉ lệ 0..1 trên số tiền thực thu. */
  PHAN_TRAM: "PHAN_TRAM",
  /** `giaTri` là SỐ TIỀN mỗi đơn vị hàng (PL05 — Robot Beta 100.000đ/bộ). */
  SO_TIEN_CO_DINH: "SO_TIEN_CO_DINH",
  /** Thưởng theo NGƯỠNG doanh thu kỳ; số tiền nằm ở `bac`, không ở `giaTri`. */
  THUONG_THEO_BAC: "THUONG_THEO_BAC",
} as const;
export type KieuTinhHoaHong = (typeof KIEU_TINH)[keyof typeof KIEU_TINH];

export const NHAN_KIEU_TINH: Record<KieuTinhHoaHong, string> = {
  PHAN_TRAM: "% trên số tiền thực thu",
  SO_TIEN_CO_DINH: "Số tiền cố định mỗi đơn vị",
  THUONG_THEO_BAC: "Thưởng theo bậc doanh thu",
};

export const LOAI_DON = { TAT_CA: "TAT_CA", COURSE: "COURSE", PRODUCT: "PRODUCT" } as const;
export type LoaiDonHoaHong = (typeof LOAI_DON)[keyof typeof LOAI_DON];

export const NHAN_LOAI_DON: Record<LoaiDonHoaHong, string> = {
  TAT_CA: "Mọi loại đơn",
  COURSE: "Đơn khoá học",
  PRODUCT: "Đơn sản phẩm",
};

export type BacThuong = {
  /** Doanh thu kỳ ĐẠT TỪ mức này (công văn ghi "≥"). */
  nguong: number;
  thuong: number;
  danhHieu?: string;
};

export type ChinhSachHoaHong = {
  /** Mã duy nhất, người vận hành tự đặt. Dùng làm khoá dòng hoa hồng. */
  ma: string;
  ten: string;
  /**
   * Mã vai nhận — CHUỖI TỰ DO (khớp `RoleDef.code` nếu muốn, nhưng không bắt buộc).
   *
   * ⚠️ Cố ý KHÔNG ràng vào enum/khoá ngoại: đó đúng là thứ chủ dự án bảo bỏ. Cái giá là
   * gõ sai mã vai thì dòng hoa hồng treo không ai nhận — nên màn khai phải gợi ý từ danh
   * sách vai có thật, còn tầng thuần này chỉ chặn chuỗi rỗng.
   */
  vaiNhan: string;
  suKien: SuKienHoaHong;
  loaiDon: LoaiDonHoaHong;
  kieuTinh: KieuTinhHoaHong;
  /** `PHAN_TRAM`: 0..1 · `SO_TIEN_CO_DINH`: VND · `THUONG_THEO_BAC`: bỏ qua. */
  giaTri: number;
  bac?: BacThuong[];
  /** Trích dẫn văn bản ban hành. Số tiền không được vô danh — xem `[CSH-06]`. */
  nguon?: string;
  bat: boolean;
};

export type DongHoaHong = {
  ma: string;
  ten: string;
  vaiNhan: string;
  soTien: number;
};

function so(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Tiền hợp lệ: không âm, không NaN/Infinity, tròn về đồng. */
function tien(n: unknown): number {
  return Math.max(0, Math.round(so(n)));
}

/**
 * Sinh các dòng hoa hồng cho MỘT khoản tiền thực thu.
 *
 * Chỉ xét chính sách ĐANG BẬT, khớp `suKien`, và khớp `loaiDon` (hoặc `TAT_CA`).
 * `THUONG_THEO_BAC` KHÔNG sinh dòng ở đây — nó tính trên doanh thu KỲ, không trên từng
 * đơn; dùng `tinhThuongBac`.
 */
export function tinhHoaHongDon(
  don: {
    /** Số tiền THỰC THU của đơn/khoản. */
    soTien: number;
    /** Số đơn vị hàng — chỉ có nghĩa với `SO_TIEN_CO_DINH`. Bỏ trống = 1. */
    soLuong?: number;
    suKien: SuKienHoaHong;
    loaiDon: LoaiDonHoaHong;
  },
  chinhSach: ChinhSachHoaHong[],
): DongHoaHong[] {
  const soTien = tien(don.soTien);
  const soLuongRaw = so(don.soLuong);
  const soLuong = soLuongRaw > 0 ? Math.floor(soLuongRaw) : 1;

  return chinhSach
    .filter(
      (c) =>
        c.bat &&
        c.suKien === don.suKien &&
        (c.loaiDon === LOAI_DON.TAT_CA || c.loaiDon === don.loaiDon) &&
        c.kieuTinh !== KIEU_TINH.THUONG_THEO_BAC,
    )
    .map((c) => ({
      ma: c.ma,
      ten: c.ten,
      vaiNhan: c.vaiNhan,
      soTien:
        c.kieuTinh === KIEU_TINH.SO_TIEN_CO_DINH
          ? tien(so(c.giaTri) * soLuong)
          : tien(soTien * so(c.giaTri)),
    }));
}

/**
 * Thưởng theo bậc doanh thu kỳ — lấy bậc CAO NHẤT đạt được.
 *
 * ⚠️ KHÔNG cộng dồn các bậc. Công văn: "TVV nhận mức thưởng cao nhất đạt được"; cộng dồn
 * năm bậc là chi gấp ~3,3 lần. Và không phụ thuộc thứ tự người nhập — bảng khai lộn xộn
 * vẫn phải ra đúng, vì đây là ô người vận hành tự gõ.
 */
export function tinhThuongBac(
  doanhThuKy: number,
  bac: BacThuong[] | undefined,
): { thuong: number; danhHieu: string | null } {
  const dt = tien(doanhThuKy);
  const dat = (bac ?? [])
    .filter((b) => dt >= so(b.nguong))
    .sort((a, b) => so(b.nguong) - so(a.nguong))[0];
  return dat ? { thuong: tien(dat.thuong), danhHieu: dat.danhHieu ?? null } : { thuong: 0, danhHieu: null };
}

/** Σ tỉ lệ % của MỘT rổ (sự kiện × loại đơn). Chỉ cộng `PHAN_TRAM`. */
export function tongTiLeTheoSuKien(
  chinhSach: ChinhSachHoaHong[],
  suKien: SuKienHoaHong,
  loaiDon: LoaiDonHoaHong,
): number {
  return chinhSach
    .filter(
      (c) =>
        c.bat &&
        c.kieuTinh === KIEU_TINH.PHAN_TRAM &&
        c.suKien === suKien &&
        (c.loaiDon === LOAI_DON.TAT_CA || loaiDon === LOAI_DON.TAT_CA || c.loaiDon === loaiDon),
    )
    .reduce((s, c) => s + so(c.giaTri), 0);
}

/**
 * Kiểm bộ chính sách TRƯỚC khi lưu. Trả danh sách lỗi tiếng Việt (rỗng = hợp lệ).
 *
 * Đây là cổng duy nhất đứng giữa ô nhập của người vận hành và tiền chi ra, nên nó chặn cả
 * những lỗi "trông vô hại": gõ `4` thay vì `0,04` là chi 400% học phí.
 */
export function kiemChinhSach(
  chinhSach: ChinhSachHoaHong[],
  opts: { tranTongTiLe: number },
): string[] {
  const loi: string[] = [];

  const daThay = new Set<string>();
  for (const c of chinhSach) {
    const ten = c.ma || "(thiếu mã)";
    if (!c.ma?.trim()) loi.push("Có chính sách thiếu mã.");
    else if (daThay.has(c.ma)) loi.push(`Mã "${c.ma}" bị trùng.`);
    daThay.add(c.ma);

    if (!c.vaiNhan?.trim()) loi.push(`${ten}: chưa chọn vai nhận hoa hồng.`);

    if (c.kieuTinh === KIEU_TINH.PHAN_TRAM) {
      const v = so(c.giaTri);
      if (v < 0 || v > 1) {
        loi.push(
          `${ten}: tỉ lệ phải nằm trong khoảng 0–1 (4% gõ là 0,04). Đang là ${c.giaTri}.`,
        );
      }
    } else if (c.kieuTinh === KIEU_TINH.SO_TIEN_CO_DINH) {
      if (so(c.giaTri) < 0) loi.push(`${ten}: số tiền cố định không được âm.`);
    } else if (c.kieuTinh === KIEU_TINH.THUONG_THEO_BAC) {
      if (!c.bac || c.bac.length === 0) {
        loi.push(`${ten}: kiểu "thưởng theo bậc" nhưng chưa khai bậc nào.`);
      } else if (c.bac.some((b) => so(b.nguong) < 0 || so(b.thuong) < 0)) {
        loi.push(`${ten}: ngưỡng và mức thưởng không được âm.`);
      }
    }
  }

  // Trần theo TỪNG RỔ. Cộng chung mọi sự kiện là báo vượt trần giả — xem đầu file.
  for (const sk of Object.values(SU_KIEN)) {
    for (const ld of [LOAI_DON.COURSE, LOAI_DON.PRODUCT] as LoaiDonHoaHong[]) {
      const tong = tongTiLeTheoSuKien(chinhSach, sk, ld);
      if (tong > opts.tranTongTiLe + 1e-9) {
        loi.push(
          `Tổng tỉ lệ của "${NHAN_SU_KIEN[sk]}" (${NHAN_LOAI_DON[ld]}) là ` +
            `${(tong * 100).toFixed(2)}%, vượt trần ${(opts.tranTongTiLe * 100).toFixed(2)}%. ` +
            `[${sk}]`,
        );
      }
    }
  }

  return loi;
}

/**
 * BỘ MẶC ĐỊNH — chép nguyên văn từ SR.QD.208 (ban hành 01/03/2026).
 *
 * Đây chỉ là GIÁ TRỊ KHỞI ĐẦU khi `SystemSetting` chưa có gì. Người vận hành sửa ở màn
 * Cấu hình vận hành, và từ lúc đó bản trong DB thắng — dev không phải đụng file này nữa.
 *
 * Σ học viên mới = 4% + 1% + 2% + 1% + 1% = 9%, đúng bằng trần `crm.commissionMaxTotalRate`
 * sau lần nới 27/08/2026. Đó không phải trùng hợp: trần được nới lên 9% chính vì tầng
 * giáo viên +1% không còn chỗ dưới trần 8% cũ.
 */
export const CHINH_SACH_MAC_DINH: ChinhSachHoaHong[] = [
  // ── Học viên MỚI ──────────────────────────────────────────────────────────
  {
    ma: "TVV_HV_MOI",
    ten: "Tư vấn viên — học viên mới",
    vaiNhan: "SALES_CSM",
    suKien: "HOC_VIEN_MOI",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.04,
    nguon: "SR.QD.208 · PL04 Điều 1",
    bat: true,
  },
  {
    ma: "SALE_ADMIN_HV_MOI",
    ten: "Sale Admin Hội sở — học viên mới",
    vaiNhan: "HO_SALE_ADMIN",
    suKien: "HOC_VIEN_MOI",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.01,
    nguon: "SR.QD.208 · PL04 Điều 1 (Trung tâm tự khai thác ⇒ 1% vào Quỹ chung Trung tâm)",
    bat: true,
  },
  {
    ma: "QLTT_HV_MOI",
    ten: "Quản lý Trung tâm — học viên mới",
    vaiNhan: "CENTER_MANAGER",
    suKien: "HOC_VIEN_MOI",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.02,
    nguon: "SR.QD.208 · PL08 Điều 3",
    bat: true,
  },
  {
    ma: "MKT_HO_HV_MOI",
    ten: "Marketing Hội sở — học viên mới",
    vaiNhan: "HO_MARKETING",
    suKien: "HOC_VIEN_MOI",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.01,
    nguon: "SR.QD.208 · PL04(2) Điều 2 — KHÔNG áp dụng cho lead Trung tâm tự khai thác",
    bat: true,
  },
  {
    ma: "GV_HV_MOI",
    ten: "Giáo viên tiếp nhận — học viên mới",
    vaiNhan: "TEACHER",
    suKien: "HOC_VIEN_MOI",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.01,
    nguon: "SR.QD.208 · PL04(2) Điều 2",
    bat: true,
  },

  // ── TÁI TỤC ───────────────────────────────────────────────────────────────
  {
    ma: "TVV_TAI_TUC",
    ten: "Tư vấn viên — tái tục",
    vaiNhan: "SALES_CSM",
    suKien: "TAI_TUC",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.01,
    nguon: "SR.QD.208 · PL04 Điều 1 — chỉ khi vẫn đang chăm sóc khách này",
    bat: true,
  },
  {
    ma: "QLTT_TAI_TUC",
    ten: "Quản lý Trung tâm — tái tục",
    vaiNhan: "CENTER_MANAGER",
    suKien: "TAI_TUC",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.01,
    nguon: "SR.QD.208 · PL08 Điều 3",
    bat: true,
  },

  // ── CHUYỂN TRUNG TÂM (chi MỘT LẦN cho đơn vị cũ) ──────────────────────────
  {
    ma: "TVV_CU_CHUYEN_TT",
    ten: "Tư vấn viên trung tâm CŨ — khi học viên chuyển",
    vaiNhan: "SALES_CSM",
    suKien: "CHUYEN_TRUNG_TAM",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.01,
    nguon: "SR.QD.208 · PL08 Điều 4 — tính 1 lần tại thời điểm chuyển, khi đã đóng đủ tiền",
    bat: true,
  },
  {
    ma: "QLTT_CU_CHUYEN_TT",
    ten: "Quản lý trung tâm CŨ — khi học viên chuyển",
    vaiNhan: "CENTER_MANAGER",
    suKien: "CHUYEN_TRUNG_TAM",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.01,
    nguon: "SR.QD.208 · PL08 Điều 4",
    bat: true,
  },
  {
    ma: "GV_CU_CHUYEN_TT",
    ten: "Giáo viên đã đào tạo — khi học viên chuyển",
    vaiNhan: "TEACHER",
    suKien: "CHUYEN_TRUNG_TAM",
    loaiDon: "COURSE",
    kieuTinh: "PHAN_TRAM",
    giaTri: 0.02,
    nguon: "SR.QD.208 · PL08 Điều 4 — 2%, chi cho GV đã dạy học viên trước đó",
    bat: true,
  },

  // ── BÁN THIẾT BỊ — số tiền CỐ ĐỊNH, không phải % ──────────────────────────
  {
    ma: "TB_ROBOT_BETA",
    ten: "Bán Bộ sản phẩm Robot Beta",
    vaiNhan: "MOI_NHAN_SU",
    suKien: "BAN_THIET_BI",
    loaiDon: "PRODUCT",
    kieuTinh: "SO_TIEN_CO_DINH",
    giaTri: 100_000,
    nguon: "SR.QD.208 · PL05 — áp dụng cho TẤT CẢ nhân sự bán được thiết bị",
    bat: true,
  },
  {
    ma: "TB_KHAC",
    ten: "Bán thiết bị robot khác",
    vaiNhan: "MOI_NHAN_SU",
    suKien: "BAN_THIET_BI",
    loaiDon: "PRODUCT",
    kieuTinh: "SO_TIEN_CO_DINH",
    giaTri: 50_000,
    nguon: "SR.QD.208 · PL05",
    bat: true,
  },

  // ── THƯỞNG DANH HIỆU theo doanh thu THÁNG — hai bảng bậc KHÁC NHAU ────────
  {
    ma: "THUONG_BAC_TVV",
    ten: "Thưởng danh hiệu — Tư vấn viên",
    vaiNhan: "SALES_CSM",
    suKien: "HOC_VIEN_MOI",
    loaiDon: "TAT_CA",
    kieuTinh: "THUONG_THEO_BAC",
    giaTri: 0,
    bac: [
      { nguong: 110_000_000, thuong: 1_000_000, danhHieu: "SILVER" },
      { nguong: 150_000_000, thuong: 1_500_000, danhHieu: "GOLD" },
      { nguong: 200_000_000, thuong: 2_000_000, danhHieu: "PLATINUM" },
      { nguong: 250_000_000, thuong: 2_500_000, danhHieu: "TITANIUM" },
      { nguong: 300_000_000, thuong: 3_000_000, danhHieu: "DIAMOND" },
    ],
    nguon: "SR.QD.208 · PL04 Điều 2 — thưởng cộng dồn VỚI hoa hồng, lấy bậc cao nhất đạt",
    bat: true,
  },
  {
    ma: "THUONG_BAC_QLTT",
    ten: "Thưởng danh hiệu — Quản lý Trung tâm",
    vaiNhan: "CENTER_MANAGER",
    suKien: "HOC_VIEN_MOI",
    loaiDon: "TAT_CA",
    kieuTinh: "THUONG_THEO_BAC",
    giaTri: 0,
    bac: [
      { nguong: 220_000_000, thuong: 2_000_000, danhHieu: "SILVER" },
      { nguong: 300_000_000, thuong: 3_000_000, danhHieu: "GOLD" },
      { nguong: 400_000_000, thuong: 4_000_000, danhHieu: "PLATINUM" },
      { nguong: 500_000_000, thuong: 5_000_000, danhHieu: "TITANIUM" },
      { nguong: 600_000_000, thuong: 6_000_000, danhHieu: "DIAMOND" },
    ],
    nguon: "SR.QD.208 · PL08 Điều 2 — ngưỡng CAO HƠN bảng của Tư vấn viên",
    bat: true,
  },
];
