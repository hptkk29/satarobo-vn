// @vitest-environment node
/**
 * §2.2 AD-1…AD-4 — ADAPTER TẮT-AN-TOÀN.
 *
 * Bốn luật này rút từ sự cố CÓ THẬT trong repo, không phải sở thích kiến trúc:
 *  AD-1 thiếu credential ⇒ trả lỗi CÓ MÃ, KHÔNG throw (throw làm sập cả luồng gọi);
 *  AD-2 lỗi ĐỌC công tắc live (DB sập) ⇒ coi như KHÔNG live (fail-closed);
 *  AD-3 chưa live ⇒ mô phỏng, KHÔNG chạm API thật;
 *  AD-4 mô phỏng phải NÓI RÕ là mô phỏng — repo đang có hai cách xử lý SIMULATED
 *       khác nhau, và nhánh sai (`lib/notify/attendance.ts:123-125`) vẫn đánh dấu
 *       "đã gửi" ⇒ số liệu nghiệm thu GIẢ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSettingMock = vi.fn();
vi.mock("@/lib/settings/service", () => ({
  getSetting: (...args: unknown[]) => getSettingMock(...args),
}));

const ENV_GOC = { ...process.env };

beforeEach(() => {
  getSettingMock.mockReset();
  vi.restoreAllMocks();
});
afterEach(() => {
  process.env = { ...ENV_GOC };
});

async function napAdapter() {
  vi.resetModules();
  return await import("@/lib/integrations/omicall/provider");
}

function datDuCredential() {
  process.env.OMICALL_API_BASE = "https://public-v1.omicrm.com";
  process.env.OMICALL_API_KEY = "khoa-gia";
  process.env.OMICALL_TENANT = "satarobo";
}

describe("AD-1 · thiếu credential", () => {
  it("isConfigured() = false, và KHÔNG ném", async () => {
    delete process.env.OMICALL_API_KEY;
    delete process.env.OMICALL_API_BASE;
    delete process.env.OMICALL_TENANT;
    const { omicallProvider } = await napAdapter();
    expect(omicallProvider.isConfigured()).toBe(false);
  });

  it("tải ghi âm khi chưa cấu hình ⇒ lỗi CÓ MÃ, không throw, không fetch", async () => {
    delete process.env.OMICALL_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { omicallProvider } = await napAdapter();
    const r = await omicallProvider.taiGhiAm("https://vi-du/rec.mp3");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.ma).toBe("OMICALL_NOT_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AD-2 · lỗi đọc công tắc live ⇒ coi như KHÔNG live", () => {
  it("getSetting ném ⇒ isLive() false ⇒ mô phỏng", async () => {
    datDuCredential();
    getSettingMock.mockRejectedValue(new Error("DB sập"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { omicallProvider } = await napAdapter();
    const r = await omicallProvider.taiGhiAm("https://vi-du/rec.mp3");
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.simulated).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AD-3 · chưa live ⇒ mô phỏng, KHÔNG gọi API thật", () => {
  it("setting calls.live = false ⇒ không một lời fetch nào", async () => {
    datDuCredential();
    getSettingMock.mockResolvedValue(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { omicallProvider } = await napAdapter();
    const r = await omicallProvider.taiGhiAm("https://vi-du/rec.mp3");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });
});

describe("AD-4 · mô phỏng phải NÓI RÕ là mô phỏng", () => {
  it("kết quả mô phỏng mang cờ `simulated: true` — không giả vờ thành công thật", async () => {
    datDuCredential();
    getSettingMock.mockResolvedValue(false);
    const { omicallProvider } = await napAdapter();
    const r = await omicallProvider.taiGhiAm("https://vi-du/rec.mp3");
    expect(r.ok === true && r.simulated).toBe(true);
    // Và KHÔNG có nội dung byte giả — mô phỏng không đẻ ra tệp ghi âm rỗng rồi
    // ghi `hasRecording = true`, vì đó chính là "số liệu nghiệm thu giả".
    expect(r.ok === true && r.bytes).toBeUndefined();
  });
});

describe("§2.3 · công tắc vào REGISTRY, không vào env", () => {
  it("đọc `calls.live` từ SystemSetting", async () => {
    datDuCredential();
    getSettingMock.mockResolvedValue(false);
    const { omicallProvider } = await napAdapter();
    await omicallProvider.isLive();
    expect(getSettingMock).toHaveBeenCalledWith("calls.live");
  });

  it("env `OMICALL_LIVE` chỉ là DỰ PHÒNG khi setting trả false", async () => {
    // Nếu setting đã bật thì không cần env. Ngược lại thì env vẫn bật được để
    // môi trường chưa seed setting vẫn chạy — y hệt `zalo.znsLive`.
    datDuCredential();
    getSettingMock.mockResolvedValue(false);
    process.env.OMICALL_LIVE = "true";
    const { omicallProvider } = await napAdapter();
    expect(await omicallProvider.isLive()).toBe(true);
  });

  it("chưa cấu hình thì env `OMICALL_LIVE=true` KHÔNG bật live được", async () => {
    delete process.env.OMICALL_API_KEY;
    process.env.OMICALL_LIVE = "true";
    getSettingMock.mockResolvedValue(true);
    const { omicallProvider } = await napAdapter();
    expect(await omicallProvider.isLive()).toBe(false);
  });
});

describe("luật cứng #9 · bí mật không ra log", () => {
  it("adapter không console.log giá trị API key", async () => {
    datDuCredential();
    getSettingMock.mockResolvedValue(false);
    const logs: unknown[] = [];
    vi.spyOn(console, "warn").mockImplementation((...a) => logs.push(...a));
    vi.spyOn(console, "error").mockImplementation((...a) => logs.push(...a));
    vi.spyOn(console, "log").mockImplementation((...a) => logs.push(...a));
    const { omicallProvider } = await napAdapter();
    await omicallProvider.taiGhiAm("https://vi-du/rec.mp3");
    expect(JSON.stringify(logs)).not.toContain("khoa-gia");
  });
});
