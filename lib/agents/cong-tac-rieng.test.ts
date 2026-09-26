// @vitest-environment node
// Rà bảo mật 25/09 (AG-01): công tắc Cổng dữ liệu agent KHÔNG được nằm trong registry cấu hình
// chung. Khoá nào có trong registry thì `saveGlobalSettingAction` (màn Cấu hình vận hành) ghi
// được — tức SUPER_ADMIN bật cổng mà không qua người duyệt + mã 2FA như spec đòi.
import { describe, it, expect } from "vitest";
import { SETTING_KEYS, validateSettingValue } from "@/lib/settings/registry";
import { KHOA_CONG_TAC } from "./gateway/cau-hinh";

describe("[AG-CT-01] công tắc cổng chỉ ghi được qua đường của cổng", () => {
  it("khoá công tắc KHÔNG có trong registry chung", () => {
    expect(SETTING_KEYS as readonly string[]).not.toContain(KHOA_CONG_TAC);
  });
  it("đường ghi chung (setGlobalSetting dùng validateSettingValue) TỪ CHỐI khoá công tắc", () => {
    expect(validateSettingValue(KHOA_CONG_TAC, true).ok).toBe(false);
    expect(validateSettingValue(KHOA_CONG_TAC, false).ok).toBe(false);
  });
  it("ĐỐI CHỨNG: hạn mức của cổng vẫn nằm trong registry (sửa được, có validate)", () => {
    expect(validateSettingValue("agentGateway.rateLimitPerMin", 60).ok).toBe(true);
    expect(validateSettingValue("agentGateway.rateLimitPerMin", 0).ok).toBe(false);
  });
});
