import { describe, expect, it } from "vitest";
import { makeKioskToken, verifyKioskToken,
  makeStaticKioskToken,
  verifyStaticKioskToken,
  laMaTinh,
} from "./kiosk-token";

const S = "test-secret";
const T0 = new Date("2026-09-08T00:45:00Z");

describe("kiosk token xoay 60s", () => {
  it("token vừa sinh → hợp lệ, đúng workLocationId", () => {
    const t = makeKioskToken("wl1", S, T0);
    expect(verifyKioskToken(t, S, T0)).toEqual({ ok: true, workLocationId: "wl1", ageWindows: 0 });
  });
  it("2 phút sau vẫn nhận (2 cửa sổ trước); 3 phút sau hết hạn", () => {
    const t = makeKioskToken("wl1", S, T0);
    expect(verifyKioskToken(t, S, new Date(T0.getTime() + 2 * 60_000)).ok).toBe(true);
    expect(verifyKioskToken(t, S, new Date(T0.getTime() + 3 * 60_000 + 1))).toEqual({ ok: false, reason: "EXPIRED" });
  });
  it("token từ tương lai (đồng hồ lệch) bị từ chối", () => {
    const t = makeKioskToken("wl1", S, new Date(T0.getTime() + 5 * 60_000));
    expect(verifyKioskToken(t, S, T0)).toEqual({ ok: false, reason: "EXPIRED" });
  });
  it("sai secret / sửa workLocationId → SIGNATURE; sai định dạng → FORMAT", () => {
    const t = makeKioskToken("wl1", S, T0);
    expect(verifyKioskToken(t, "other", T0)).toEqual({ ok: false, reason: "SIGNATURE" });
    expect(verifyKioskToken(t.replace("wl1", "wl2"), S, T0)).toEqual({ ok: false, reason: "SIGNATURE" });
    expect(verifyKioskToken("abc", S, T0)).toEqual({ ok: false, reason: "FORMAT" });
  });
});

describe("mã TĨNH in ra (đợt 2)", () => {
  const S = "x".repeat(40);

  it("ký và kiểm được, mang đúng điểm chấm công và đời khoá", () => {
    const t = makeStaticKioskToken("wl-1", 3, S);
    const v = verifyStaticKioskToken(t, S);
    expect(v.ok && v.workLocationId).toBe("wl-1");
    expect(v.ok && v.keyVersion).toBe(3);
  });

  it("KHÔNG hết hạn — đó là cả điểm của mã in ra", () => {
    const t = makeStaticKioskToken("wl-1", 1, S);
    // Mã xoay chết sau 3 phút; mã tĩnh thì không có khái niệm thời gian trong chữ ký.
    expect(verifyStaticKioskToken(t, S).ok).toBe(true);
  });

  it("đổi ĐỜI KHOÁ là mọi tờ đã in chết — cách duy nhất thu hồi mã", () => {
    const cu = makeStaticKioskToken("wl-1", 1, S);
    const moi = makeStaticKioskToken("wl-1", 2, S);
    expect(cu).not.toBe(moi);
    // Chữ ký của tờ cũ vẫn hợp lệ về mặt crypto — nó mang version 1. Việc từ chối là của
    // `checkin-gate` khi so với `WorkLocation.qrKeyVersion` hiện tại.
    const v = verifyStaticKioskToken(cu, S);
    expect(v.ok && v.keyVersion).toBe(1);
  });

  it("sai khoá ký / sửa chữ ký ⇒ từ chối", () => {
    const t = makeStaticKioskToken("wl-1", 1, S);
    expect(verifyStaticKioskToken(t, "y".repeat(40)).ok).toBe(false);
    expect(verifyStaticKioskToken(t.slice(0, -1) + "Z", S).ok).toBe(false);
  });

  it("đổi điểm chấm công trong mã ⇒ chữ ký hỏng (không mượn được mã của quầy khác)", () => {
    const t = makeStaticKioskToken("wl-1", 1, S);
    const gia = t.replace("wl-1", "wl-2");
    expect(verifyStaticKioskToken(gia, S).ok).toBe(false);
  });

  it("dạng lạ ⇒ FORMAT, không ném lỗi", () => {
    for (const x of ["", "a.b", "a.b.c.d", "wl.vX.sig", "wl.v0.sig", "wl.1.sig"]) {
      expect(verifyStaticKioskToken(x, S).ok).toBe(false);
    }
  });

  it("laMaTinh phân biệt được hai dạng — cổng vào dựa vào đúng dấu hiệu này", () => {
    expect(laMaTinh(makeStaticKioskToken("wl-1", 1, S))).toBe(true);
    expect(laMaTinh(makeKioskToken("wl-1", S))).toBe(false);
  });
});
