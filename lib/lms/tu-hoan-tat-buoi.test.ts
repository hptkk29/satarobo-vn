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

  // ── Bug 07/09/2026 — ĐÂY là ca đã làm cả cơ chế chết trên prod ────────────────
  //
  // `ClassSession.date` là `@db.Timestamptz(6)` và MANG GIỜ THẬT (đo: 609/609 buổi
  // 08:00–18:00, 0 buổi nửa đêm). `homNayUtcMs` thì là NỬA ĐÊM. So thẳng hai mốc ⇒
  // buổi của chính hôm nay luôn "lớn hơn" ⇒ CHUA_TOI_NGAY ⇒ giáo viên điểm danh
  // trong ngày dạy thì KHÔNG BAO GIỜ đóng được buổi. Prod: 2 COMPLETED / 287 SCHEDULED.
  //
  // Bản test cũ truyền `ngay(0)` = ĐÚNG nửa đêm — một hình dạng dữ liệu không tồn tại
  // trong DB — nên nó xanh trong khi prod chết. Nay quét cả ngày.
  it("buổi HÔM NAY đóng được ở MỌI khung giờ dạy thật (dạy xong trong ngày)", () => {
    // Dải giờ ĐO ĐƯỢC trên dữ liệu thật (satarobo_local, 609 buổi): 01:00–11:00 UTC,
    // tức 08:00–18:00 giờ VN. 0/609 buổi có ngày UTC khác ngày VN.
    for (const gioUtc of [1, 3, 7, 10, 11]) {
      const ngayBuoi = new Date(HOM_NAY + gioUtc * 3_600_000);
      expect(
        co({ ngayBuoi }),
        `buổi ${gioUtc}h UTC (${gioUtc + 7}h VN) phải đóng được`,
      ).toEqual({
        tuHoanTat: true,
      });
    }
  });

  it("ranh giới: buổi cuối ngày hôm nay đóng được, buổi đầu ngày mai thì không", () => {
    // 11:00 UTC = 18:00 VN — buổi muộn nhất đo được trên dữ liệu thật.
    expect(co({ ngayBuoi: new Date(HOM_NAY + 11 * 3_600_000) })).toEqual({
      tuHoanTat: true,
    });
    // 24+01:00 UTC = 08:00 VN hôm sau — buổi sớm nhất của ngày kế.
    expect(co({ ngayBuoi: new Date(HOM_NAY + 25 * 3_600_000) })).toEqual({
      tuHoanTat: false,
      lyDo: "CHUA_TOI_NGAY",
    });
  });

  it("KHÔNG đóng buổi tương lai — giáo viên đánh sẵn cả lớp là chuyện có thật", () => {
    // Đóng buổi chưa dạy = phát `session.taught` ⇒ giao bài và bắn thông báo cho phụ
    // huynh sớm cả tuần.
    for (const gioUtc of [1, 7, 11]) {
      const ngayBuoi = new Date(HOM_NAY + 24 * 3_600_000 + gioUtc * 3_600_000);
      expect(
        co({ ngayBuoi }),
        `buổi mai ${gioUtc}h UTC không được đóng`,
      ).toEqual({
        tuHoanTat: false,
        lyDo: "CHUA_TOI_NGAY",
      });
    }
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
      expect(co({ trangThaiBuoi: st })).toEqual({
        tuHoanTat: false,
        lyDo: "DA_XONG",
      });
    }
  });

  it("IN_PROGRESS vẫn đóng được", () => {
    expect(co({ trangThaiBuoi: "IN_PROGRESS" })).toEqual({ tuHoanTat: true });
  });

  it("điểm danh DƯ (học viên vừa rút khỏi lớp) vẫn tính là đủ", () => {
    expect(co({ siSo: 8, daDanhDau: 10 })).toEqual({ tuHoanTat: true });
  });
});
