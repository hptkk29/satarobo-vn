import { describe, expect, it } from "vitest";
import { makeKioskToken, verifyKioskToken } from "./kiosk-token";

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
