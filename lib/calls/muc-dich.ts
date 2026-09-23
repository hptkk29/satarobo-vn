import type { CallPurpose } from "@prisma/client";
import { canonicalPhone } from "@/lib/phone";

// =============================================================================
// OC-5 (QT-33) — CỔNG MỤC ĐÍCH CUỘC GỌI. Đây là cổng PHÁP LÝ, không phải tính năng.
//
// Căn cứ: NĐ 91/2020 cấm gọi/nhắn QUẢNG CÁO tới số nằm trong Danh sách không
// quảng cáo (https://khongquangcao.ais.gov.vn). Phạt 80–100 TRIỆU (rủi ro PL-3).
//
// Bốn quyết định đã cân, đừng đảo mà không đọc lý do:
//  1. KHÔNG có mặc định ngầm cho `purpose`. Đặt mặc định "chăm sóc" là biến cổng
//     pháp lý thành hình thức.
//  2. Loại CHĂM SÓC **không** bị hai ràng buộc quảng cáo. Chặn cả loại này thì
//     người dùng học cách khai "chăm sóc" cho mọi cuộc, và cổng thành vô dụng.
//  3. Số nằm trong danh sách không gọi mà cuộc gọi là CHĂM SÓC ⇒ cho gọi nhưng
//     TRẢ VỀ CẢNH BÁO, để giao diện nhắc người gọi — luật cho phép, phép lịch sự
//     thì không.
//  4. ⚠️ `[CHƯA KIỂM CHỨNG]` có API tra Danh sách không quảng cáo QUỐC GIA tự động
//     hay không. Tham số `trongDanhSachKhongGoi` hiện chỉ nói về danh sách NỘI BỘ
//     (`CallDoNotCall`). Nếu không có API thì phải đối chiếu theo lô định kỳ —
//     đó là việc vận hành, không sửa được bằng chữ ký hàm này.
//
// FILE THUẦN — nơi gọi tự tra `consentMarketing` và danh sách không gọi rồi truyền
// vào. Không tự đọc DB để test được không cần Postgres.
// =============================================================================

export type CongMucDichInput = {
  purpose: CallPurpose | null | undefined;
  /** Số của khách, dạng bất kỳ — hàm tự chuẩn hoá. */
  phone: string;
  /** Đồng ý marketing THẬT (QT-31: chỉ đặt bằng hành vi thật, cấm ô tick sẵn). */
  consentMarketing: boolean;
  /** Số nằm trong Danh sách không gọi NỘI BỘ (`CallDoNotCall`) và còn hiệu lực. */
  trongDanhSachKhongGoi: boolean;
};

export type MaChanCuocGoi =
  | "PURPOSE_REQUIRED"
  | "PHONE_INVALID"
  | "MARKETING_CONSENT_MISSING"
  | "DO_NOT_CALL_LISTED";

export type CongMucDichKetQua =
  | { ok: true; phone: string; purpose: CallPurpose; canhBao: string[] }
  | { ok: false; ma: MaChanCuocGoi; thongDiep: string };

export function congMucDichCuocGoi(input: CongMucDichInput): CongMucDichKetQua {
  if (!input.purpose) {
    return {
      ok: false,
      ma: "PURPOSE_REQUIRED",
      thongDiep:
        "Phải chọn mục đích cuộc gọi trước khi gọi: chăm sóc/xử lý yêu cầu, hay chào bán/quảng cáo.",
    };
  }

  const phone = canonicalPhone(input.phone);
  if (!phone) {
    return {
      ok: false,
      ma: "PHONE_INVALID",
      thongDiep: "Số điện thoại không hợp lệ (chỉ nhận di động Việt Nam).",
    };
  }

  if (input.purpose === "ADVERTISING") {
    if (!input.consentMarketing) {
      return {
        ok: false,
        ma: "MARKETING_CONSENT_MISSING",
        thongDiep:
          "Cuộc gọi chào bán/quảng cáo cần khách đã đồng ý nhận thông tin tiếp thị. " +
          "Chưa có đồng ý thì chỉ gọi được loại chăm sóc/xử lý yêu cầu.",
      };
    }
    if (input.trongDanhSachKhongGoi) {
      return {
        ok: false,
        ma: "DO_NOT_CALL_LISTED",
        thongDiep:
          "Số này nằm trong Danh sách không gọi. Không được gọi chào bán/quảng cáo tới số này.",
      };
    }
  }

  const canhBao: string[] = [];
  if (input.trongDanhSachKhongGoi) {
    // CARE vẫn gọi được — nhưng người gọi phải biết là khách đã từng yêu cầu đừng gọi.
    canhBao.push("DO_NOT_CALL_LISTED");
  }

  return { ok: true, phone, purpose: input.purpose, canhBao };
}
