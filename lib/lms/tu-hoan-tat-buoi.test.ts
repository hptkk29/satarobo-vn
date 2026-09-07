import { describe, it, expect } from "vitest";
import { quyetDinhTuHoanTat } from "./tu-hoan-tat-buoi";

const NGAY = 24 * 60 * 60 * 1000;
/** 04/09/2026 — mốc nửa đêm UTC của ngày VN. */
const HOM_NAY = Date.UTC(2026, 8, 4);
const ngay = (lech: number) => new Date(HOM_NAY + lech * NGAY);

const co = (p: Partial<Parameters<typeof quyetDinhTuHoanTat>[0]> = {}) =>
  quyetDinhTuHoanTat({
    trangThaiBuoi: "SCHEDULED",
    ngayBuoi: ngay(-1),
    homNayUtcMs: HOM_NAY,
    siSo: 10,
    daDanhDau: 10,
    ...p,
  });

describe("quyetDinhTuHoanTat — điểm danh đủ thì buổi tự đóng", () => {
  it("buổi đã qua + phủ đủ sĩ số → tự hoàn tất", () => {
    expect(co()).toEqual({ tuHoanTat: true });
  });

  it("buổi HÔM NAY cũng đóng được (dạy xong trong ngày)", () => {
    expect(co({ ngayBuoi: ngay(0) })).toEqual({ tuHoanTat: true });
  });

  it("KHÔNG đóng buổi tương lai — giáo viên đánh sẵn cả lớp là chuyện có thật", () => {
    // Đóng buổi chưa dạy = phát `session.taught` ⇒ giao bài và bắn thông báo cho phụ
    // huynh sớm cả tuần.
    expect(co({ ngayBuoi: ngay(1) })).toEqual({
      tuHoanTat: false,
      lyDo: "CHUA_TOI_NGAY",
    });
  });

  it("điểm danh THIẾU người → chưa đóng", () => {
    expect(co({ daDanhDau: 9 })).toEqual({
      tuHoanTat: false,
      lyDo: "DIEM_DANH_THIEU",
    });
  });

  it("một dòng lẻ (duyệt phiếu xin nghỉ) KHÔNG đủ để đóng buổi", () => {
    // Đúng lớp lỗi BUG-029: "có ≥1 dòng" từng bị coi là đã điểm danh.
    expect(co({ daDanhDau: 1 })).toEqual({
      tuHoanTat: false,
      lyDo: "DIEM_DANH_THIEU",
    });
  });

  it("lớp chưa có học viên nào → không đóng, dù 0 ≥ 0", () => {
    expect(co({ siSo: 0, daDanhDau: 0 })).toEqual({
      tuHoanTat: false,
      lyDo: "SI_SO_RONG",
    });
  });

  it("buổi đã COMPLETED / CANCELLED → không đụng tới", () => {
    for (const st of ["COMPLETED", "CANCELLED"]) {
      expect(co({ trangThaiBuoi: st })).toEqual({ tuHoanTat: false, lyDo: "DA_XONG" });
    }
  });

  it("IN_PROGRESS vẫn đóng được", () => {
    expect(co({ trangThaiBuoi: "IN_PROGRESS" })).toEqual({ tuHoanTat: true });
  });

  it("điểm danh DƯ (học viên vừa rút khỏi lớp) vẫn tính là đủ", () => {
    expect(co({ siSo: 8, daDanhDau: 10 })).toEqual({ tuHoanTat: true });
  });
});
