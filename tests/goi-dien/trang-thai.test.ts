// @vitest-environment node
/**
 * OC-2 — TRẠNG THÁI CHỈ TIẾN, KHÔNG LÙI (QT-35).
 *
 * Vì sao đây là bộ test đầu tiên của module: webhook CDR KHÔNG bảo đảm thứ tự.
 * Sự kiện "đổ chuông" tới sau sự kiện "nghe máy" là chuyện bình thường của mọi
 * tổng đài, và nếu xử lý ngây thơ thì cuộc gọi ĐÃ NÓI CHUYỆN 4 phút bị ghi đè
 * thành "đang đổ chuông" — tức mất luôn KPI tỷ lệ nghe máy, mà không ai báo lỗi.
 *
 * Luật kèm theo, cũng test ở đây: bỏ qua phần TRẠNG THÁI ≠ bỏ qua SỰ KIỆN. Bản
 * ghi thô vẫn phải được lưu vết.
 */
import { describe, it, expect } from "vitest";
import {
  BAC_TRANG_THAI,
  bacCuaTrangThai,
  tienTrangThai,
  docTrangThaiNhaCungCap,
} from "@/lib/calls/trang-thai";

describe("OC-2 · thang bậc trạng thái", () => {
  it("ANSWERED là bậc CAO NHẤT — mạnh hơn mọi kết thúc không nói chuyện", () => {
    // Cố ý KHÔNG xếp theo vòng đời thời gian. "Có người nghe" là sự thật mạnh
    // nhất về một cuộc gọi; một sự kiện NO_ANSWER tới muộn không được xoá nó.
    expect(bacCuaTrangThai("ANSWERED")).toBeGreaterThan(bacCuaTrangThai("NO_ANSWER"));
    expect(bacCuaTrangThai("ANSWERED")).toBeGreaterThan(bacCuaTrangThai("BUSY"));
    expect(bacCuaTrangThai("ANSWERED")).toBeGreaterThan(bacCuaTrangThai("FAILED"));
  });

  it("INITIATED < RINGING < (NO_ANSWER = BUSY = FAILED) < ANSWERED", () => {
    expect(bacCuaTrangThai("INITIATED")).toBeLessThan(bacCuaTrangThai("RINGING"));
    expect(bacCuaTrangThai("RINGING")).toBeLessThan(bacCuaTrangThai("NO_ANSWER"));
    expect(bacCuaTrangThai("NO_ANSWER")).toBe(bacCuaTrangThai("BUSY"));
    expect(bacCuaTrangThai("BUSY")).toBe(bacCuaTrangThai("FAILED"));
  });

  it("mọi giá trị enum đều có bậc — thêm trạng thái mới mà quên xếp bậc là đỏ ở đây", () => {
    const keys = Object.keys(BAC_TRANG_THAI).sort();
    expect(keys).toEqual(
      ["ANSWERED", "BUSY", "FAILED", "INITIATED", "NO_ANSWER", "RINGING"].sort(),
    );
  });
});

describe("OC-2 · tienTrangThai", () => {
  it("tiến lên thì NHẬN", () => {
    const r = tienTrangThai("RINGING", "ANSWERED");
    expect(r.nhan).toBe(true);
    expect(r.trangThai).toBe("ANSWERED");
    expect(r.bac).toBe(bacCuaTrangThai("ANSWERED"));
  });

  it("lùi thì GIỮ NGUYÊN trạng thái cũ, và nói rõ vì sao", () => {
    const r = tienTrangThai("ANSWERED", "RINGING");
    expect(r.nhan).toBe(false);
    expect(r.trangThai).toBe("ANSWERED");
    expect(r.lyDo).toBe("TRANG_THAI_LUI");
  });

  it("bằng bậc cũng KHÔNG ghi lại — sự kiện trùng không được coi là tiến", () => {
    const r = tienTrangThai("NO_ANSWER", "BUSY");
    expect(r.nhan).toBe(false);
    expect(r.trangThai).toBe("NO_ANSWER");
  });

  it("lặp lại đúng trạng thái cũ cũng không tiến", () => {
    expect(tienTrangThai("ANSWERED", "ANSWERED").nhan).toBe(false);
  });

  it("chưa có trạng thái nào (bản ghi mới) thì nhận trạng thái đầu tiên", () => {
    const r = tienTrangThai(null, "RINGING");
    expect(r.nhan).toBe(true);
    expect(r.trangThai).toBe("RINGING");
  });

  it("trạng thái mới không đọc được ⇒ KHÔNG nhận, KHÔNG ném lỗi", () => {
    // Webhook của nhà cung cấp là dữ liệu ngoài. Ném lỗi ở đây biến một giá trị lạ
    // thành 500 và kéo theo provider retry bão.
    const r = tienTrangThai("RINGING", null);
    expect(r.nhan).toBe(false);
    expect(r.trangThai).toBe("RINGING");
    expect(r.lyDo).toBe("TRANG_THAI_KHONG_DOC_DUOC");
  });
});

describe("docTrangThaiNhaCungCap — đọc mã trạng thái thô", () => {
  it("đọc được các cách viết thường gặp, không phân biệt hoa thường", () => {
    expect(docTrangThaiNhaCungCap("answered")).toBe("ANSWERED");
    expect(docTrangThaiNhaCungCap("ANSWER")).toBe("ANSWERED");
    expect(docTrangThaiNhaCungCap("ringing")).toBe("RINGING");
    expect(docTrangThaiNhaCungCap("busy")).toBe("BUSY");
    expect(docTrangThaiNhaCungCap("no_answer")).toBe("NO_ANSWER");
    expect(docTrangThaiNhaCungCap("noanswer")).toBe("NO_ANSWER");
    expect(docTrangThaiNhaCungCap("failed")).toBe("FAILED");
    expect(docTrangThaiNhaCungCap("initiated")).toBe("INITIATED");
  });

  it("giá trị lạ / rỗng / không phải chuỗi ⇒ null (không đoán bừa)", () => {
    // ⚠️ Bảng ánh xạ này DỰNG THEO PHỎNG ĐOÁN — chưa có văn bản nhà cung cấp
    // (cổng CH-3 · TQ-1). Trả `null` để đường nạp bật cờ "cần rà soát" thay vì
    // gán bừa một trạng thái sai rồi tính vào KPI.
    expect(docTrangThaiNhaCungCap("cancelled_by_carrier")).toBeNull();
    expect(docTrangThaiNhaCungCap("")).toBeNull();
    expect(docTrangThaiNhaCungCap(undefined)).toBeNull();
    expect(docTrangThaiNhaCungCap(42)).toBeNull();
  });
});
