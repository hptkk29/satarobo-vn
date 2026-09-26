// lib/finance/hoa-don/trang-thai-hoa-don.ts — MỘT DÒNG trên màn hoá đơn vẽ nút gì. THUẦN.
//
// Khuôn `lib/payments/qr-theo-dot.ts`: quyết định ở MỘT chỗ, component chỉ đọc kết quả. Luật 12:
// nút TẮT phải kèm câu lý do nói bằng ngôn ngữ của nguyên nhân — một nút chắc chắn bị từ chối mà
// không nói vì sao là lời hứa suông.
//
// ⚠️ Luật "Điều chỉnh sau GĐ 0" (PLAN §12): chốt hoá đơn KHÔNG phụ thuộc việc xác nhận được khoản
// thu. Đo prod 25/09: 22/31 khoản chờ thiếu ghi danh ⇒ nếu buộc xác nhận được khoản mới chốt được
// hoá đơn thì đa số lần thu kẹt. Khoản chưa xác nhận được và người mua thiếu thông tin chỉ là
// CẢNH BÁO (hoá đơn đã xuất ở MISA rồi — chủ dự án 26/09).

import { maskEmail } from "@/lib/utils";
import type { TrangThaiLanThu } from "./lan-thu";

export type NutTat = { bat: boolean; lyDo?: string };

export type HanhDongDong = {
  taiPhieu: boolean;
  taiLen: NutTat;
  xacNhan: NutTat & { nhan?: string };
  khongXuat: boolean;
  ganThem: boolean;
  canhBao: string[];
};

/** Nhãn nút Xác nhận — nói đúng việc nút sẽ làm (gửi tới đâu, hay không gửi). */
export function nhanNutXacNhan(input: { emailNhan: string | null; guiEmailKhach: boolean }): string {
  if (!input.guiEmailKhach) return "Xác nhận (không gửi email)";
  if (!input.emailNhan) return "Xác nhận (khách không có email — báo sale gửi Zalo)";
  return `Xác nhận & gửi tới ${maskEmail(input.emailNhan)}`;
}

function tien(n: number): string {
  return `${n.toLocaleString("vi-VN")}đ`;
}

export function hanhDongChoDong(input: {
  lanThu: { trangThai: TrangThaiLanThu; thieu: number; nhanDot: string | null; canhBao: readonly string[] };
  /** Hoá đơn NHÁP đang giữ lần thu này (đã tải tệp), `null` nếu chưa tải gì. */
  hoaDonNhap: {
    coTepPdf: boolean;
    kyHieu: string | null;
    soHoaDon: string | null;
    ngayPhatHanh: Date | null;
  } | null;
  /** `payments:confirm` trên ĐÚNG cơ sở của đơn (đã giải — PLAN §9). */
  coQuyen: boolean;
  /** Kho tệp hoá đơn đã cấu hình (bucket riêng). */
  khoOk: boolean;
  emailNhan: string | null;
  guiEmailKhach: boolean;
  /** `thieuChoHoaDon(...).chan` — CHỈ cảnh báo. */
  thieuNguoiMua: readonly string[];
  /** Câu mô tả từng khoản không xác nhận được (thiếu ghi danh, tự ghi — AC5) — CHỈ cảnh báo. */
  khoanChuaXacNhanDuoc: readonly string[];
  /** Kế toán đã xác nhận "không trùng" (kèm lý do, ghi audit ở action). */
  boQuaNghiTrung: boolean;
  /** Kế toán đã chọn "xuất theo số đã thu" cho lần thu THIẾU (kèm lý do). */
  xuatTheoSoDaThu: boolean;
}): HanhDongDong {
  const canhBao = [
    ...input.lanThu.canhBao,
    ...input.khoanChuaXacNhanDuoc,
    ...(input.thieuNguoiMua.length > 0
      ? [`Hồ sơ trên hệ thống còn thiếu: ${input.thieuNguoiMua.join(", ")} — không chặn, hoá đơn đã xuất ở MISA`]
      : []),
  ];

  if (!input.coQuyen) {
    const lyDo = "Cần quyền payments:confirm tại cơ sở của đơn — hỏi Quản trị hệ thống";
    return {
      taiPhieu: false,
      taiLen: { bat: false, lyDo },
      xacNhan: { bat: false, lyDo },
      khongXuat: false,
      ganThem: false,
      canhBao,
    };
  }

  const { trangThai, thieu, nhanDot } = input.lanThu;
  const ganThem = trangThai === "THIEU";

  if (trangThai === "DOT_HUY") {
    const lyDo = "Đợt của lần thu này đã bị huỷ — chọn 'Không xuất' hoặc xử lý hoàn tiền";
    return { taiPhieu: true, taiLen: { bat: false, lyDo }, xacNhan: { bat: false, lyDo }, khongXuat: true, ganThem: false, canhBao };
  }

  const taiLen: NutTat = input.khoOk
    ? { bat: true }
    : { bat: false, lyDo: "Kho lưu hoá đơn chưa cấu hình — báo người vận hành" };

  const tat = (lyDo: string): HanhDongDong => ({
    taiPhieu: true,
    taiLen,
    xacNhan: { bat: false, lyDo },
    khongXuat: true,
    ganThem,
    canhBao,
  });

  if (!input.khoOk) return tat(taiLen.lyDo!);
  if (trangThai === "NGHI_TRUNG" && !input.boQuaNghiTrung) {
    return tat("Khoản khai tay này có thể trùng một giao dịch ngân hàng — kiểm và xác nhận 'không trùng' trước");
  }
  if (trangThai === "THIEU" && !input.xuatTheoSoDaThu) {
    return tat(
      `Thiếu ${tien(thieu)} so với ${nhanDot ?? "đợt"} — gắn thêm giao dịch cho đủ, hoặc chọn xuất theo số đã thu`,
    );
  }
  const nhap = input.hoaDonNhap;
  if (!nhap || !nhap.coTepPdf) return tat("Chưa tải tệp PDF hoá đơn lên");
  const thieuO = [
    !nhap.kyHieu && "ký hiệu",
    !nhap.soHoaDon && "số hoá đơn",
    !nhap.ngayPhatHanh && "ngày phát hành",
  ].filter(Boolean);
  if (thieuO.length > 0) return tat(`Còn thiếu ${thieuO.join(", ")}`);

  return {
    taiPhieu: true,
    taiLen,
    xacNhan: { bat: true, nhan: nhanNutXacNhan(input) },
    khongXuat: true,
    ganThem,
    canhBao,
  };
}
