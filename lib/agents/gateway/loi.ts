// lib/agents/gateway/loi.ts — mã lỗi của Cổng dữ liệu agent (spec §7.3). THUẦN.
//
// Mã lỗi (tiếng Việt không dấu, viết hoa) là HỢP ĐỒNG với xưởng skill: agent rẽ nhánh theo
// `loi.ma`, không theo câu chữ. Đổi tên một mã = phá agent đang chạy.
//
// Luật trả lỗi:
//   · Không kèm stack trace, không lặp lại giá trị người gọi đã gửi (spec §7.3 dòng 387).
//   · 404 CONG_CU_KHONG_TON_TAI dùng cho CẢ công cụ có thật nhưng không được cấp — để agent
//     không dò được danh sách công cụ (spec §7.3 dòng 385, ca B4).
//   · Sai mật khẩu client thì 401 chung chung, không nói sai phần nào (spec §4.2).

export const MA_LOI = [
  "YEU_CAU_SAI",
  "TOKEN_KHONG_HOP_LE",
  "CHU_KY_SAI",
  "CLIENT_BI_KHOA",
  "KHONG_DU_QUYEN",
  "NGOAI_PHAM_VI_CO_SO",
  "IP_KHONG_DUOC_PHEP",
  "CONG_CU_KHONG_TON_TAI",
  "TRUNG_YEU_CAU",
  "THAM_SO_SAI",
  "VUOT_HAN_MUC",
  "NGUON_LOI",
  "LECH_KHUON",
  "CONG_DANG_TAT",
] as const;

export type MaLoi = (typeof MA_LOI)[number];

/** HTTP mặc định của từng mã. `YEU_CAU_SAI` còn đi với 413/415 — truyền `http` riêng. */
export const HTTP_MAC_DINH: Record<MaLoi, number> = {
  YEU_CAU_SAI: 400,
  TOKEN_KHONG_HOP_LE: 401,
  CHU_KY_SAI: 401,
  CLIENT_BI_KHOA: 401,
  KHONG_DU_QUYEN: 403,
  NGOAI_PHAM_VI_CO_SO: 403,
  IP_KHONG_DUOC_PHEP: 403,
  CONG_CU_KHONG_TON_TAI: 404,
  TRUNG_YEU_CAU: 409,
  THAM_SO_SAI: 422,
  VUOT_HAN_MUC: 429,
  NGUON_LOI: 500,
  LECH_KHUON: 500,
  CONG_DANG_TAT: 503,
};

const THONG_DIEP_MAC_DINH: Record<MaLoi, string> = {
  YEU_CAU_SAI: "Yêu cầu không đúng khuôn.",
  TOKEN_KHONG_HOP_LE: "Thông tin xác thực không hợp lệ.",
  CHU_KY_SAI: "Chữ ký yêu cầu không hợp lệ.",
  CLIENT_BI_KHOA: "Ứng dụng kết nối đang bị khoá.",
  KHONG_DU_QUYEN: "Không đủ quyền cho thao tác này.",
  NGOAI_PHAM_VI_CO_SO: "Cơ sở yêu cầu nằm ngoài phạm vi được cấp.",
  IP_KHONG_DUOC_PHEP: "Địa chỉ IP không nằm trong danh sách được phép.",
  CONG_CU_KHONG_TON_TAI: "Không có công cụ này.",
  TRUNG_YEU_CAU: "Yêu cầu trùng.",
  THAM_SO_SAI: "Tham số không hợp lệ.",
  VUOT_HAN_MUC: "Vượt hạn mức gọi.",
  NGUON_LOI: "Lỗi phía máy chủ.",
  LECH_KHUON: "Dữ liệu trả về lệch khuôn.",
  CONG_DANG_TAT: "Cổng dữ liệu đang tắt.",
};

/**
 * Lỗi có chủ đích của cổng — pipeline `throw` nó ở bước kiểm nào hỏng đầu tiên, và
 * đầu route bắt để dịch ra HTTP. Lỗi KHÔNG phải `LoiCong` (bug, DB sập…) được dịch thành
 * `NGUON_LOI` và KHÔNG lộ thông điệp gốc.
 */
export class LoiCong extends Error {
  readonly ma: MaLoi;
  readonly http: number;
  /** Chỉ danh sách TÊN trường sai (THAM_SO_SAI) — không bao giờ kèm giá trị. */
  readonly truongSai?: string[];
  /** Giây chờ (VUOT_HAN_MUC → header Retry-After). */
  readonly thuLaiSauGiay?: number;

  constructor(
    ma: MaLoi,
    opts: { thongDiep?: string; http?: number; truongSai?: string[]; thuLaiSauGiay?: number } = {},
  ) {
    super(opts.thongDiep ?? THONG_DIEP_MAC_DINH[ma]);
    this.name = "LoiCong";
    this.ma = ma;
    this.http = opts.http ?? HTTP_MAC_DINH[ma];
    this.truongSai = opts.truongSai;
    this.thuLaiSauGiay = opts.thuLaiSauGiay;
  }
}

export type VoLoi = {
  loi: { ma: MaLoi; thong_diep: string; ma_yeu_cau: string; truong_sai?: string[] };
};

export function voLoi(loi: LoiCong, maYeuCau: string): VoLoi {
  return {
    loi: {
      ma: loi.ma,
      thong_diep: loi.message,
      ma_yeu_cau: maYeuCau,
      ...(loi.truongSai?.length ? { truong_sai: loi.truongSai } : {}),
    },
  };
}

/** Mọi thứ ném ra từ pipeline → một `LoiCong`. Lỗi lạ thành NGUON_LOI, bỏ thông điệp gốc. */
export function veLoiCong(e: unknown): LoiCong {
  return e instanceof LoiCong ? e : new LoiCong("NGUON_LOI");
}
