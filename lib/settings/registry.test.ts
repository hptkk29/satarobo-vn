// Vitest — R6-A registry (pure, không cần DB). US-R6A AC2: fallback default an toàn.
import { describe, it, expect } from "vitest";
import {
  SETTING_REGISTRY,
  isSettingKey,
  parseSetting,
  settingDefault,
} from "./registry";

describe("[Đợt0b] SETTING_REGISTRY", () => {
  it("mọi key có default thỏa schema của chính nó", () => {
    for (const [key, def] of Object.entries(SETTING_REGISTRY)) {
      const r = def.schema.safeParse(def.default);
      expect(r.success, `default của ${key} không hợp lệ`).toBe(true);
    }
  });

  it("isSettingKey nhận diện key hợp lệ / loại key lạ", () => {
    expect(isSettingKey("student.nearEndThreshold")).toBe(true);
    expect(isSettingKey("khong.ton.tai")).toBe(false);
  });

  it("parseSetting: value hợp lệ → giữ nguyên", () => {
    expect(parseSetting("student.nearEndThreshold", 3)).toBe(3);
  });

  it("parseSetting: value invalid → rơi về default (AC2, không throw)", () => {
    expect(parseSetting("student.nearEndThreshold", "bậy")).toBe(5);
    expect(parseSetting("student.nearEndThreshold", -1)).toBe(5);
    expect(parseSetting("otp.dailyLimit", null)).toBe(8);
  });

  it("parseSetting: object setting (proposalWindow) validate được", () => {
    expect(parseSetting("shift.proposalWindow", { startDay: 20, endDay: 24 })).toEqual({
      startDay: 20,
      endDay: 24,
    });
    // startDay > endDay → invalid → default
    expect(parseSetting("shift.proposalWindow", { startDay: 28, endDay: 25 })).toEqual({
      startDay: 25,
      endDay: 28,
    });
  });

  it("settingDefault khớp giá trị hardcode cũ", () => {
    expect(settingDefault("shift.geofenceRadiusMeters")).toBe(100);
    expect(settingDefault("finance.debtReminderDaysBefore")).toBe(14);
    expect(settingDefault("crm.dedupWindowDays")).toBe(90);
  });
});
