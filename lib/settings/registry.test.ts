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
import { STALE_LEAD_WARN_DAYS, STALE_LEAD_DANGER_DAYS } from "@/lib/lead/stale-lead";

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

describe("[C-05] ngưỡng cảnh báo lead treo nằm trong Cấu hình vận hành", () => {
  it("[C-05-T01] mặc định ĐÚNG quyết định 12(a) ngày 24/08/2026: vàng 2 ngày · đỏ 7 ngày", () => {
    expect(SETTINGS["crm.staleLeadWarnDays"].default).toBe(STALE_LEAD_WARN_DAYS);
    expect(SETTINGS["crm.staleLeadDangerDays"].default).toBe(STALE_LEAD_DANGER_DAYS);
    expect(SETTINGS["crm.staleLeadWarnDays"].default).toBe(2);
    expect(SETTINGS["crm.staleLeadDangerDays"].default).toBe(7);
  });

  it("[C-05-T02] mỗi cơ sở đặt ngưỡng riêng được (quyết định 12(a) ghi rõ centerOverridable)", () => {
    expect(SETTINGS["crm.staleLeadWarnDays"].centerOverridable).toBe(true);
    expect(SETTINGS["crm.staleLeadDangerDays"].centerOverridable).toBe(true);
  });

  it("[C-05-T03] ngưỡng 0 hoặc âm bị chặn ngay ở ô cấu hình", () => {
    // 0 ngày = mọi lead đều đỏ ngay lúc vừa vào hệ thống ⇒ cột cảnh báo thành nhiễu
    // trắng và người dùng tắt mắt với nó. Chặn ở đây, không chặn ở chỗ vẽ.
    expect(validateSettingValue("crm.staleLeadWarnDays", 0).ok).toBe(false);
    expect(validateSettingValue("crm.staleLeadDangerDays", -1).ok).toBe(false);
    expect(validateSettingValue("crm.staleLeadWarnDays", 1.5).ok).toBe(false);
    expect(validateSettingValue("crm.staleLeadWarnDays", 1).ok).toBe(true);
    expect(validateSettingValue("crm.staleLeadDangerDays", 365).ok).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────────
// ZaloCRM (đợt tích hợp 06/09/2026) — 3 tham số vận hành của trục ZaloCRM.
//
// Vì sao phải có test riêng cho việc "đã khai vào registry chưa": `getSetting`
// **NÉM** `Unknown setting key: …` khi key vắng mặt (lib/settings/service.ts:63).
// Lỗi đó không rơi vào một khối nhỏ — nó ném giữa Server Component ⇒ sập cả màn.
// Quên khai một key mà không có lưới thì phát hiện bằng cách màn Tích hợp trắng
// trên prod. Đây là lưới đó.
// ─────────────────────────────────────────────────────────────────────────────
describe("[ZC-CFG] tham số vận hành ZaloCRM", () => {
  it("[ZC-CFG-01] `zalocrm.orgCodes` có mặt trong registry — getSetting không ném Unknown setting key", () => {
    // Mô phỏng đúng vế chặn của service: `const def = getSettingDef(key); if (!def) throw`.
    expect(getSettingDef("zalocrm.orgCodes"), "chưa khai zalocrm.orgCodes").toBeTruthy();
    expect(SETTING_KEYS).toContain("zalocrm.orgCodes");
  });

  it("[ZC-CFG-02] `zalocrm.orgCodes` mặc định RỖNG — chưa ánh xạ cơ sở nào thì không đoán bừa", () => {
    expect(SETTINGS["zalocrm.orgCodes"].default).toEqual({});
  });

  it("[ZC-CFG-03] `zalocrm.orgCodes` nhận ánh xạ mã cơ sở → orgCode, chặn orgCode sai khuôn", () => {
    expect(validateSettingValue("zalocrm.orgCodes", { CS1: "cs1", CS2: "cs2" }).ok).toBe(true);
    // orgCode đi thẳng vào đường dẫn webhook `/api/webhooks/zalocrm/<org>` và bị
    // chặn ở đó bằng /^[a-z0-9-]{1,32}$/. Khai sai khuôn ở đây = webhook 404 câm
    // lúc 3 giờ sáng; chặn ngay tại ô cấu hình thì người khai biết mình gõ sai.
    expect(validateSettingValue("zalocrm.orgCodes", { CS1: "CS1" }).ok).toBe(false);
    expect(validateSettingValue("zalocrm.orgCodes", { CS1: "cs 1" }).ok).toBe(false);
    expect(validateSettingValue("zalocrm.orgCodes", { CS1: "" }).ok).toBe(false);
    expect(validateSettingValue("zalocrm.orgCodes", { CS1: 1 }).ok).toBe(false);
    expect(validateSettingValue("zalocrm.orgCodes", "cs1").ok).toBe(false);
  });

  it("[ZC-CFG-04] `zalocrm.idleAlertHours` default = 2", () => {
    expect(SETTINGS["zalocrm.idleAlertHours"].default).toBe(2);
  });

  it("[ZC-CFG-05] `zalocrm.idleAlertHours` chặn 0 / âm / số lẻ", () => {
    // 0 giờ = mọi hội thoại vừa nhận đã cảnh báo ⇒ chuông kêu liên tục, người dùng
    // tắt mắt với nó. Cùng bài học ngưỡng lead treo (C-05-T03).
    expect(validateSettingValue("zalocrm.idleAlertHours", 0).ok).toBe(false);
    expect(validateSettingValue("zalocrm.idleAlertHours", -1).ok).toBe(false);
    expect(validateSettingValue("zalocrm.idleAlertHours", 1.5).ok).toBe(false);
    expect(validateSettingValue("zalocrm.idleAlertHours", 1).ok).toBe(true);
    expect(validateSettingValue("zalocrm.idleAlertHours", 72).ok).toBe(true);
    expect(validateSettingValue("zalocrm.idleAlertHours", 73).ok).toBe(false);
  });

  it('[ZC-CFG-06] `inbox.zaloCaNhanLive` schema là z.boolean — chuỗi "true" KHÔNG hợp lệ', () => {
    // Bẫy thật: `resolveSendMode` (lib/integrations/fail-safe.ts:37) kiểm kiểu CHẶT
    // và trả `SETTING_UNREADABLE` cho mọi giá trị không phải boolean. Ghi chuỗi
    // "true" vào ô này ⇒ công tắc trông như ĐANG BẬT trên màn cấu hình nhưng
    // adapter vẫn chạy MÔ PHỎNG — khách không nhận được gì mà không ai báo lỗi.
    expect(validateSettingValue("inbox.zaloCaNhanLive", true).ok).toBe(true);
    expect(validateSettingValue("inbox.zaloCaNhanLive", false).ok).toBe(true);
    expect(validateSettingValue("inbox.zaloCaNhanLive", "true").ok).toBe(false);
    expect(validateSettingValue("inbox.zaloCaNhanLive", 1).ok).toBe(false);
  });

  it("[ZC-CFG-07] `inbox.zaloCaNhanLive` mặc định TẮT — nick cá nhân không tự gửi tin thật", () => {
    expect(SETTINGS["inbox.zaloCaNhanLive"].default).toBe(false);
    // Cùng khuôn hai công tắc kênh đã có: tắt = mô phỏng, không phải hỏng.
    expect(SETTINGS["inbox.zaloCaNhanLive"].group).toBe(SETTINGS["inbox.zaloOaLive"].group);
  });
});
