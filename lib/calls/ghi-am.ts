import type { CallRecordingNotice } from "@prisma/client";

// =============================================================================
// OC-6 (PL-2) — LỜI THÔNG BÁO GHI ÂM ĐẦU CUỘC GỌI + cờ "đã thông báo".
//
// Căn cứ: Luật 91/2025 cấm ghi âm cuộc gọi khi không có sự đồng ý; tổng đài CSKH
// tự động ghi âm PHẢI thông báo rõ ràng trước khi ghi. NĐ 15/2020 điểm q khoản 3
// Điều 102: phạt tối đa 10 triệu (cá nhân) / 20 triệu (tổ chức).
//
// LUẬT NGHIỆP VỤ DỄ LÀM NGƯỢC NHẤT: khách TỪ CHỐI ghi âm thì VẪN GỌI ĐƯỢC — chỉ
// tắt ghi âm. Biến "từ chối ghi âm" thành "không gọi được" là tự cắt kênh liên lạc
// với chính khách của mình, và không luật nào đòi thế.
//
// Mặc định là FAIL-CLOSED: chưa phát lời thông báo ⇒ KHÔNG ghi âm. Mặc định ngược
// lại biến mỗi lỗi cấu hình thành một vi phạm hành chính.
//
// FILE THUẦN.
// =============================================================================

export type QuyetDinhGhiAmInput = {
  /** Đã phát lời thông báo ghi âm ở đầu cuộc gọi chưa. */
  daThongBao: boolean;
  /** Khách nói không muốn bị ghi âm. */
  khachTuChoi: boolean;
};

export type QuyetDinhGhiAmKetQua = {
  ghiAm: boolean;
  notice: CallRecordingNotice;
};

export function quyetDinhGhiAm(input: QuyetDinhGhiAmInput): QuyetDinhGhiAmKetQua {
  // Từ chối THẮNG mọi cờ khác: nếu cờ `daThongBao` bị đặt nhầm thì kết quả vẫn
  // phải là không ghi âm.
  if (input.khachTuChoi) return { ghiAm: false, notice: "REFUSED" };
  if (!input.daThongBao) return { ghiAm: false, notice: "NOT_ANNOUNCED" };
  return { ghiAm: true, notice: "ANNOUNCED" };
}

/**
 * OC-20 — hạn xoá dự kiến của tệp ghi âm, lưu NGAY trên bản ghi (không suy lúc dọn).
 *
 * ⚠️ Số tháng ≤ 0 nghĩa là KHÔNG ĐẶT HẠN, **không** phải "xoá ngay". Hiểu ngược là
 * một lần gõ nhầm trong màn cấu hình xoá sạch bằng chứng cuộc gọi.
 *
 * ❓ CHỜ CHỐT (spec OC-20): đề xuất ghi âm 12 tháng. Giọng nói có phải dữ liệu sinh
 * trắc học theo NĐ 356/2025 hay không là câu hỏi LS-3 chưa có lời đáp — nếu CÓ thì
 * tệp ghi âm thành dữ liệu nhạy cảm và con số này phải xét lại.
 */
export function hanXoaGhiAm(ketThucLuc: Date, soThang: number): Date | null {
  if (!Number.isFinite(soThang) || soThang <= 0) return null;
  const d = new Date(ketThucLuc.getTime());
  d.setUTCMonth(d.getUTCMonth() + Math.floor(soThang));
  return d;
}
