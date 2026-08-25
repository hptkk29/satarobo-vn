/**
 * R6-A — Unit test registry + resolve (thuần, không DB).
 * Phủ: T1 (resolve precedence), T2 (validation), T3 (boundary), T12 (default an toàn).
 */
import { describe, it, expect } from "vitest";
import {
  SETTINGS,
  SETTING_KEYS,
  getSettingDef,
  validateSettingValue,
} from "@/lib/settings/registry";
import { resolveSettingValue } from "@/lib/settings/resolve";

describe("[R6-A] registry — validate giá trị (US-R6A-1 AC4)", () => {
  it("[R6-A-T2-01] key không có schema → từ chối", () => {
    const r = validateSettingValue("khong.ton.tai", 1);
    expect(r.ok).toBe(false);
  });

  it("[R6-A-T2-02] sai kiểu (string cho key số) → từ chối", () => {
    const r = validateSettingValue("student.nearEndThreshold", "abc");
    expect(r.ok).toBe(false);
  });

  it("[R6-A-T3-01] vượt khoảng (sĩ số 0 < min 1) → từ chối", () => {
    expect(validateSettingValue("class.minStudents.default", 0).ok).toBe(false);
    expect(validateSettingValue("class.maxStudents.default", 101).ok).toBe(false);
  });

  it("[R6-A-T3-02] đúng biên (=1, =50) → chấp nhận", () => {
    expect(validateSettingValue("student.nearEndThreshold", 1).ok).toBe(true);
    expect(validateSettingValue("student.nearEndThreshold", 50).ok).toBe(true);
  });

  it("[R6-A-T2-03] proposalWindow fromDay > toDay → từ chối", () => {
    const r = validateSettingValue("shift.proposalWindow", { fromDay: 28, toDay: 25 });
    expect(r.ok).toBe(false);
  });

  it("[R6-A-T2-04] email sai định dạng → từ chối", () => {
    const r = validateSettingValue("contact.emails", { primary: "not-email", recruitment: "a@b.vn" });
    expect(r.ok).toBe(false);
  });

  it("[R6-A-T1-01] giá trị hợp lệ → ok + trả về value đã parse", () => {
    const r = validateSettingValue("shift.toleranceMinutes", 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(10);
  });

  it("[R6-A-T12-01] mọi default trong registry tự thỏa schema của nó", () => {
    for (const key of SETTING_KEYS) {
      const d = getSettingDef(key)!;
      const r = d.schema.safeParse(d.default);
      expect(r.success, `default của ${key} phải hợp lệ`).toBe(true);
    }
  });
});

describe("[F-20] hạn duyệt ảnh/video trong Cấu hình vận hành", () => {
  it("[F-20-T30] mặc định đúng spec: 10h sáng, 1 ngày sau buổi dạy", () => {
    expect(SETTINGS["media.reviewDeadlineHour"].default).toBe(10);
    expect(SETTINGS["media.reviewDeadlineOffsetDays"].default).toBe(1);
  });

  it("[F-20-T31] mỗi cơ sở đặt hạn riêng được (centerOverridable)", () => {
    expect(SETTINGS["media.reviewDeadlineHour"].centerOverridable).toBe(true);
    expect(SETTINGS["media.reviewDeadlineOffsetDays"].centerOverridable).toBe(true);
  });

  it("[F-20-T32] nhãn nói rõ GIỜ VN — người sửa cấu hình không phải đoán múi giờ", () => {
    expect(SETTINGS["media.reviewDeadlineHour"].label).toMatch(/giờ VN/i);
  });

  it("[F-20-T33] giờ ngoài 0..23 và số ngày ngoài 0..7 → từ chối ngay ở ô cấu hình", () => {
    expect(validateSettingValue("media.reviewDeadlineHour", 24).ok).toBe(false);
    expect(validateSettingValue("media.reviewDeadlineHour", -1).ok).toBe(false);
    expect(validateSettingValue("media.reviewDeadlineHour", 9.5).ok).toBe(false);
    expect(validateSettingValue("media.reviewDeadlineOffsetDays", 8).ok).toBe(false);
    expect(validateSettingValue("media.reviewDeadlineOffsetDays", -1).ok).toBe(false);
    // Biên hợp lệ vẫn phải qua.
    expect(validateSettingValue("media.reviewDeadlineHour", 0).ok).toBe(true);
    expect(validateSettingValue("media.reviewDeadlineHour", 23).ok).toBe(true);
    expect(validateSettingValue("media.reviewDeadlineOffsetDays", 0).ok).toBe(true);
    expect(validateSettingValue("media.reviewDeadlineOffsetDays", 7).ok).toBe(true);
  });
});

describe("[R6-A] resolve — Center → Global → default (US-R6A-2)", () => {
  const numDef = SETTINGS["class.maxStudents.default"]; // centerOverridable=true
  const globalOnly = SETTINGS["enrollment.suspendMaxMonths"]; // centerOverridable=false

  it("[R6-A-T1-02] không có row → trả default", () => {
    expect(resolveSettingValue({ def: numDef })).toBe(20);
  });

  it("[R6-A-T1-03] chỉ có global → trả global", () => {
    expect(resolveSettingValue({ def: numDef, globalRow: { valueJson: 24 } })).toBe(24);
  });

  it("[R6-A-T1-04] có center override → center thắng global", () => {
    expect(
      resolveSettingValue({
        def: numDef,
        globalRow: { valueJson: 24 },
        centerRow: { valueJson: 12 },
      }),
    ).toBe(12);
  });

  it("[R6-A-T1-05] key KHÔNG centerOverridable → bỏ qua center row, dùng global", () => {
    expect(
      resolveSettingValue({
        def: globalOnly,
        globalRow: { valueJson: 9 },
        centerRow: { valueJson: 3 },
      }),
    ).toBe(9);
  });

  it("[R6-A-T8-01] center row hỏng schema → fallback global (không sập)", () => {
    expect(
      resolveSettingValue({
        def: numDef,
        globalRow: { valueJson: 24 },
        centerRow: { valueJson: "hỏng" },
      }),
    ).toBe(24);
  });

  it("[R6-A-T8-02] global row hỏng schema → fallback default", () => {
    expect(resolveSettingValue({ def: numDef, globalRow: { valueJson: 999999 } })).toBe(20);
    // 999999 > max 100 → invalid → default
  });
});
