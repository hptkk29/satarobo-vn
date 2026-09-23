// @vitest-environment node
/**
 * OC-5 / QT-33 — CỔNG MỤC ĐÍCH CUỘC GỌI. Đây là cổng PHÁP LÝ, không phải tính năng.
 *
 * NĐ 91/2020: gọi quảng cáo tới số nằm trong Danh sách không quảng cáo — phạt
 * 80–100 triệu (PL-3). Bộ test này khoá bốn thứ mà một lần "sửa cho tiện" sẽ phá:
 *   1. không khai mục đích ⇒ KHÔNG gọi được (không có mặc định ngầm);
 *   2. quảng cáo + chưa có đồng ý marketing ⇒ chặn;
 *   3. quảng cáo + số trong danh sách không gọi ⇒ chặn;
 *   4. chăm sóc/xử lý yêu cầu KHÔNG bị hai ràng buộc trên — nếu chặn luôn cả loại
 *      này thì Sale sẽ tick bừa "chăm sóc" cho mọi cuộc, và cổng thành vô dụng.
 */
import { describe, it, expect } from "vitest";
import { congMucDichCuocGoi } from "@/lib/calls/muc-dich";

const SO = "0905123456";

describe("OC-5 · bắt buộc khai mục đích TRƯỚC khi gọi", () => {
  it("không khai mục đích ⇒ chặn", () => {
    const r = congMucDichCuocGoi({
      purpose: null,
      phone: SO,
      consentMarketing: true,
      trongDanhSachKhongGoi: false,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.ma).toBe("PURPOSE_REQUIRED");
  });

  it("KHÔNG có mặc định ngầm — undefined cũng bị chặn y như null", () => {
    const r = congMucDichCuocGoi({
      purpose: undefined,
      phone: SO,
      consentMarketing: true,
      trongDanhSachKhongGoi: false,
    });
    expect(r.ok === false && r.ma).toBe("PURPOSE_REQUIRED");
  });
});

describe("OC-5 · loại CHÀO BÁN/QUẢNG CÁO", () => {
  it("chưa có đồng ý marketing ⇒ chặn", () => {
    const r = congMucDichCuocGoi({
      purpose: "ADVERTISING",
      phone: SO,
      consentMarketing: false,
      trongDanhSachKhongGoi: false,
    });
    expect(r.ok === false && r.ma).toBe("MARKETING_CONSENT_MISSING");
  });

  it("nằm trong Danh sách không gọi ⇒ chặn, kể cả khi ĐÃ có đồng ý", () => {
    const r = congMucDichCuocGoi({
      purpose: "ADVERTISING",
      phone: SO,
      consentMarketing: true,
      trongDanhSachKhongGoi: true,
    });
    expect(r.ok === false && r.ma).toBe("DO_NOT_CALL_LISTED");
  });

  it("đủ hai điều kiện ⇒ cho gọi", () => {
    const r = congMucDichCuocGoi({
      purpose: "ADVERTISING",
      phone: SO,
      consentMarketing: true,
      trongDanhSachKhongGoi: false,
    });
    expect(r.ok).toBe(true);
  });
});

describe("OC-5 · loại CHĂM SÓC / XỬ LÝ YÊU CẦU", () => {
  it("không đòi đồng ý marketing", () => {
    const r = congMucDichCuocGoi({
      purpose: "CARE",
      phone: SO,
      consentMarketing: false,
      trongDanhSachKhongGoi: false,
    });
    expect(r.ok).toBe(true);
  });

  it("số trong Danh sách không QUẢNG CÁO vẫn gọi chăm sóc được", () => {
    // Ràng buộc của NĐ 91/2020 áp cho tin/cuộc gọi QUẢNG CÁO. Chặn cả cuộc gọi
    // xử lý yêu cầu của chính khách là chặn nhầm — và hệ quả thực tế là người
    // dùng học cách khai "chăm sóc" cho tất cả.
    const r = congMucDichCuocGoi({
      purpose: "CARE",
      phone: SO,
      consentMarketing: false,
      trongDanhSachKhongGoi: true,
    });
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.canhBao).toContain("DO_NOT_CALL_LISTED");
  });
});

describe("OC-5 · số điện thoại", () => {
  it("số không chuẩn hoá được ⇒ chặn (không gọi vào hư không)", () => {
    const r = congMucDichCuocGoi({
      purpose: "CARE",
      phone: "123",
      consentMarketing: true,
      trongDanhSachKhongGoi: false,
    });
    expect(r.ok === false && r.ma).toBe("PHONE_INVALID");
  });

  it("trả về số canonical `84…` KHÔNG dấu `+` (OC-10)", () => {
    const r = congMucDichCuocGoi({
      purpose: "CARE",
      phone: "0905 123 456",
      consentMarketing: false,
      trongDanhSachKhongGoi: false,
    });
    expect(r.ok === true && r.phone).toBe("84905123456");
    expect(r.ok === true && r.phone.startsWith("+")).toBe(false);
  });
});
