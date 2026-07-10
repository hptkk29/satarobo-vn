// Tùy chỉnh giao diện Cổng phụ huynh/học sinh (merge SataUI).
//
// Hai trục độc lập:
//  - `theme`  : Sáng / Tối / Hệ thống — bật class `.dark` trên wrapper `.portal-v2`.
//  - `accents`: màu nhấn RIÊNG cho từng vai trò — ghi đè CSS variable inline.
//
// Toàn bộ hiệu lực nằm TRONG cây `.portal-v2` (xem app/globals.css), nên admin và
// site public không bị ảnh hưởng. File này thuần logic (không React, không DOM
// ngoài localStorage) để unit-test được — xem lib/portal/appearance.test.ts.

import type { CSSProperties } from "react";

export const PORTAL_ROLES = ["parent", "student"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export type ThemeMode = "light" | "dark" | "system";

export type AccentPreset = { id: string; hex: string; name: string };

/** Bộ màu gợi ý. `coral` = mặc định phụ huynh, `orange` = mặc định học sinh. */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "coral", hex: "#F5788B", name: "San hô" },
  { id: "orange", hex: "#FD8F2D", name: "Cam" },
  { id: "purple", hex: "#610C8D", name: "Tím" },
  { id: "teal", hex: "#1F93A8", name: "Xanh ngọc" },
  { id: "green", hex: "#2F9E6A", name: "Xanh lá" },
  { id: "indigo", hex: "#4F46E5", name: "Chàm" },
];

/** Phải khớp `--parent` / `--student` trong app/globals.css. */
export const ROLE_DEFAULT_ACCENT: Record<PortalRole, string> = {
  parent: "#F5788B",
  student: "#FD8F2D",
};

export type PortalAppearance = {
  theme: ThemeMode;
  accents: Record<PortalRole, string>;
};

const STORAGE_KEY = "sata-portal-appearance";
/** Key của shell v2 cũ (chỉ lưu "dark" | "light") — đọc để migrate, không ghi. */
const LEGACY_THEME_KEY = "portal-theme";

/** Mặc định `light` (KHÔNG phải `system`) để giữ nguyên hành vi shell v2 hiện tại. */
export const defaultAppearance = (): PortalAppearance => ({
  theme: "light",
  accents: { ...ROLE_DEFAULT_ACCENT },
});

// ---- Validate & chuẩn hoá ----

export const isValidHex = (h: string): boolean => /^#?[0-9a-fA-F]{6}$/.test(h);

export const normalizeHex = (h: string): string =>
  (h.startsWith("#") ? h : `#${h}`).toUpperCase();

const isThemeMode = (v: unknown): v is ThemeMode =>
  v === "light" || v === "dark" || v === "system";

// ---- Contrast guard ----

/** Độ sáng tương đối theo WCAG. HEX không hợp lệ → 0 (coi như màu tối). */
export function relLuminance(hex: string): number {
  const m = hex.replace("#", "");
  if (m.length !== 6) return 0;
  const toLin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = toLin(parseInt(m.slice(0, 2), 16));
  const g = toLin(parseInt(m.slice(2, 4), 16));
  const b = toLin(parseInt(m.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isLightAccent = (hex: string): boolean => relLuminance(hex) > 0.42;

/** Chữ trên nền accent: màu sáng → mực tối; màu tối → chữ trắng. */
export const inkOn = (hex: string): string =>
  isLightAccent(hex) ? "#241A2E" : "#FFFFFF";

/**
 * Tint nhạt dạng rgba — dùng cho nền `bg-accent-soft`.
 * Vì là rgba (không phải hex đục) nên đọc tốt ở CẢ nền sáng lẫn tối; đây cũng là
 * lý do không tái dùng `--parent-soft` (#FFF4F0 gần trắng, lộ mảng sáng ở dark).
 */
export function softTint(hex: string, alpha = 0.12): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---- Áp vào DOM ----

/**
 * CSS variable gán INLINE lên chính phần tử `.portal-v2`.
 * Inline thắng cả `.dark` lẫn `.portal-v2[data-mode=…]` (cùng phần tử) nên màu
 * nhấn giữ nguyên khi đổi Sáng/Tối — chỉ nền/chữ đổi theo `.dark`.
 */
export function accentCssVars(hex: string): CSSProperties {
  const ink = inkOn(hex);
  const tint = softTint(hex);
  return {
    "--primary": hex,
    "--primary-foreground": ink,
    "--ring": hex,
    "--accent": hex,
    "--accent-soft": tint,
    "--accent-foreground": ink,
  } as CSSProperties;
}

export const resolveDark = (theme: ThemeMode, systemPrefersDark: boolean): boolean =>
  theme === "dark" || (theme === "system" && systemPrefersDark);

export const accentsEqual = (
  a: Record<PortalRole, string>,
  b: Record<PortalRole, string>,
): boolean => PORTAL_ROLES.every((role) => a[role] === b[role]);

// ---- Lưu trữ ----

function mergeAppearance(base: PortalAppearance, raw: unknown): PortalAppearance {
  if (typeof raw !== "object" || raw === null) return base;
  const parsed = raw as { theme?: unknown; accents?: unknown };
  const theme = isThemeMode(parsed.theme) ? parsed.theme : base.theme;
  const accents = { ...base.accents };
  if (typeof parsed.accents === "object" && parsed.accents !== null) {
    const stored = parsed.accents as Record<string, unknown>;
    for (const role of PORTAL_ROLES) {
      const value = stored[role];
      // Bỏ qua giá trị hỏng thay vì ném lỗi — người dùng vẫn vào được portal.
      if (typeof value === "string" && isValidHex(value)) {
        accents[role] = normalizeHex(value);
      }
    }
  }
  return { theme, accents };
}

export function loadAppearance(): PortalAppearance {
  const base = defaultAppearance();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return mergeAppearance(base, JSON.parse(raw));
    const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === "dark" || legacy === "light") return { ...base, theme: legacy };
  } catch {
    // localStorage bị chặn (private mode) hoặc JSON hỏng → dùng mặc định.
  }
  return base;
}

export function saveAppearance(state: PortalAppearance): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Hết quota / bị chặn → bỏ qua, phiên hiện tại vẫn áp dụng được.
  }
}
