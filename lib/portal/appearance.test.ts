// Giao diện Cổng phụ huynh/học sinh — lõi THUẦN: contrast guard + đọc/ghi localStorage.
// Dữ liệu trong localStorage do client ghi nên KHÔNG được tin: phải narrow trước khi dùng.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accentCssVars,
  accentsEqual,
  defaultAppearance,
  inkOn,
  isLightAccent,
  isValidHex,
  loadAppearance,
  normalizeHex,
  relLuminance,
  resolveDark,
  ROLE_DEFAULT_ACCENT,
  saveAppearance,
  softTint,
} from "@/lib/portal/appearance";

const STORAGE_KEY = "sata-portal-appearance";
const LEGACY_THEME_KEY = "portal-theme";

// tests/setup.ts cắm sẵn localStorage no-op (getItem luôn null) cho jsdom, nên phải
// stub một bản in-memory thật — cùng cách lib/cookie-consent.test.ts đang làm.
const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
});

describe("contrast guard", () => {
  it("nền sáng → mực tối; nền tối → chữ trắng", () => {
    expect(inkOn("#FFFFFF")).toBe("#241A2E");
    expect(inkOn("#FFFF00")).toBe("#241A2E");
    expect(inkOn("#000000")).toBe("#FFFFFF");
    expect(inkOn("#610C8D")).toBe("#FFFFFF");
  });

  it("coral phụ huynh mặc định vẫn dùng chữ trắng", () => {
    expect(isLightAccent(ROLE_DEFAULT_ACCENT.parent)).toBe(false);
    expect(inkOn(ROLE_DEFAULT_ACCENT.parent)).toBe("#FFFFFF");
  });

  it("HEX hỏng → luminance 0 (coi như màu tối), không ném lỗi", () => {
    expect(relLuminance("#GGG")).toBe(0);
    expect(relLuminance("")).toBe(0);
    expect(inkOn("nonsense")).toBe("#FFFFFF");
  });
});

describe("chuẩn hoá HEX", () => {
  it("isValidHex chấp nhận 6 ký tự, có hoặc không có #", () => {
    expect(isValidHex("#F5788B")).toBe(true);
    expect(isValidHex("f5788b")).toBe(true);
    expect(isValidHex("#FFF")).toBe(false);
    expect(isValidHex("#GGGGGG")).toBe(false);
  });

  it("normalizeHex thêm # và viết hoa", () => {
    expect(normalizeHex("f5788b")).toBe("#F5788B");
    expect(normalizeHex("#f5788b")).toBe("#F5788B");
  });
});

describe("softTint", () => {
  it("trả rgba (đọc được ở cả nền sáng lẫn tối)", () => {
    expect(softTint("#FF0000")).toBe("rgba(255, 0, 0, 0.12)");
    expect(softTint("#FF0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("HEX hỏng → tint đen trung tính thay vì NaN", () => {
    expect(softTint("oops")).toBe("rgba(0, 0, 0, 0.12)");
  });
});

describe("accentCssVars", () => {
  it("gán màu nhấn cho cả --primary lẫn --accent, kèm màu chữ tương phản", () => {
    const vars = accentCssVars("#000000") as unknown as Record<string, string>;
    expect(vars["--primary"]).toBe("#000000");
    expect(vars["--accent"]).toBe("#000000");
    expect(vars["--ring"]).toBe("#000000");
    expect(vars["--primary-foreground"]).toBe("#FFFFFF");
    expect(vars["--accent-foreground"]).toBe("#FFFFFF");
    expect(vars["--accent-soft"]).toBe("rgba(0, 0, 0, 0.12)");
  });
});

describe("resolveDark", () => {
  it("light/dark bỏ qua hệ thống; system bám prefers-color-scheme", () => {
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });
});

describe("accentsEqual", () => {
  it("so sánh theo từng vai trò", () => {
    expect(accentsEqual({ parent: "#A", student: "#B" }, { parent: "#A", student: "#B" })).toBe(true);
    expect(accentsEqual({ parent: "#A", student: "#B" }, { parent: "#A", student: "#C" })).toBe(false);
  });
});

describe("loadAppearance", () => {
  it("chưa có gì → mặc định light + màu mặc định theo vai trò", () => {
    expect(loadAppearance()).toEqual(defaultAppearance());
    expect(loadAppearance().theme).toBe("light");
  });

  it("đọc lại đúng thứ đã lưu", () => {
    const state = { theme: "dark", accents: { parent: "#123456", student: "#ABCDEF" } } as const;
    saveAppearance(state);
    expect(loadAppearance()).toEqual(state);
  });

  it("migrate key `portal-theme` của shell v2 cũ", () => {
    window.localStorage.setItem(LEGACY_THEME_KEY, "dark");
    expect(loadAppearance()).toEqual({ ...defaultAppearance(), theme: "dark" });
  });

  it("key mới thắng key legacy", () => {
    window.localStorage.setItem(LEGACY_THEME_KEY, "dark");
    saveAppearance({ theme: "light", accents: { ...ROLE_DEFAULT_ACCENT } });
    expect(loadAppearance().theme).toBe("light");
  });

  it("JSON hỏng → mặc định, không ném lỗi", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadAppearance()).toEqual(defaultAppearance());
  });

  it("bỏ qua theme lạ và HEX hỏng, giữ phần hợp lệ", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: "neon", accents: { parent: "xxx", student: "#abcdef" } }),
    );
    const loaded = loadAppearance();
    expect(loaded.theme).toBe("light");
    expect(loaded.accents.parent).toBe(ROLE_DEFAULT_ACCENT.parent);
    expect(loaded.accents.student).toBe("#ABCDEF");
  });

  it("accents không phải object → mặc định", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "dark", accents: "nope" }));
    expect(loadAppearance()).toEqual({ ...defaultAppearance(), theme: "dark" });
  });
});
