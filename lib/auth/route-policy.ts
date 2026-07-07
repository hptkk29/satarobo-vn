import type { Role } from "@prisma/client";
import { isTeacherSiteEnabled } from "@/lib/flags";

/**
 * Host-based access control — PURE decision layer (no NextRequest dependency).
 *
 * 4 subdomain · 8 role. Quy tắc truy cập theo HOST (tầng 1):
 *  - 7 role staff (mọi role TRỪ PARENT): vào được admin host; CẤM portal host.
 *  - PARENT: vào được portal host; CẤM admin host.
 *  - TEACHER (L5, flag `TEACHER_SITE_ENABLED`): vào được teacher host
 *    (`giaovien.satarobo.vn` — phiếu BGĐ câu 7, 04/07/2026); role khác vào
 *    teacher host bị đá về khu của họ. Flag OFF → teacher host bounce về admin
 *    (GV tiếp tục dùng admin, KHÔNG đổi hành vi hiện tại).
 *  - Chưa login + route bảo vệ: redirect /login GIỮ NGUYÊN host đang đứng.
 *  - Public host: ai cũng vào; route /admin|/portal lọt vào → đá về đúng host.
 *
 * Tầng 2 (feature permission: ai xem lương, ai xoá lead...) nằm ở
 * `lib/auth/permissions.ts` — KHÔNG thuộc phạm vi file này.
 *
 * proxy.ts (middleware) chỉ đọc host/pathname/session rồi gọi `decideRoute()`
 * và thực thi `RouteDecision`. Toàn bộ logic quyết định được test bằng
 * `route-policy.test.ts` (bảng tổ hợp host × role × sessionValid).
 *
 * ⚠️ L5 WIRING CÒN THIẾU (PR proxy riêng, đi cùng ticket DNS/Vercel — KHÔNG làm
 * trong PR này vì proxy.ts đang khoá): (1) `detectHost()` map
 * `giaovien.satarobo.vn` → "teacher"; (2) thêm `teacher: GIAOVIEN_HOST` vào
 * `HOST_BY_KIND`; (3) mở rộng union `RouteDecision.redirectHost.host` thêm
 * "teacher" + rule "TEACHER-only trên admin host (flag ON) → redirectHost
 * teacher". Trước khi wiring, host giaovien rơi vào nhánh `unknown` của proxy —
 * decideRoute chưa nhận hostKind "teacher" từ production.
 */

export type HostKind =
  | "public"
  | "admin"
  | "portal"
  | "teacher"
  | "vercel"
  | "unknown";

/** `null` = chưa login. */
export type MaybeRole = Role | null;

export type RouteDecision =
  | { type: "next" }
  | { type: "rewrite"; path: string }
  | { type: "redirectPath"; path: string; callbackUrl?: string; reason?: string }
  | {
      type: "redirectHost";
      host: "admin" | "portal" | "public";
      path: string;
      status: 307 | 308;
    };

export interface RouteInput {
  hostKind: HostKind;
  pathname: string;
  /** Vai trò CHÍNH; `null` nếu chưa login. */
  role: MaybeRole;
  /** Đợt 3B — tất cả vai trò (union). Trống/bỏ → suy ra từ `role`. */
  roles?: MaybeRole[];
  /** `false` nếu deactivated / tokenVersion mismatch / không có session. */
  sessionValid: boolean;
  /**
   * L5 — flag site giáo viên. Bỏ trống → đọc env `TEACHER_SITE_ENABLED`
   * (mặc định OFF). Test truyền tường minh để không phụ thuộc env.
   */
  teacherSiteEnabled?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Route classification helpers (single source of truth, shared với proxy.ts)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Top-level route segments dưới `app/(admin)/admin/*` — admin host phục vụ ở
 * root path (không prefix `/admin`). Thêm route admin mới? Thêm segment vào đây.
 */
export const ADMIN_ROUTE_SEGMENTS: ReadonlySet<string> = new Set<string>([
  "assignments",
  "attendance",
  "audit-log",
  "ban-giao-lead",
  "bao-cao",
  "canh-bao-rui-ro",
  "cau-hinh-van-hanh",
  "centers",
  "cham-cong",
  "cham-soc-hv",
  "charts-test",
  "chuyen-lop",
  "class-groups",
  "classes",
  "cong-no",
  "convert-conflicts",
  "course-packages",
  "course-prerequisites",
  "courses",
  "crm",
  "curriculums",
  "dashboard",
  "design-system-preview",
  "design-system-preview-v2",
  "documents",
  "email-logs",
  "email-templates",
  "enrollments",
  "evaluations",
  "exams",
  "hoc-bu",
  "holidays",
  "hoan-thanh-khoa",
  "hoc-ba",
  "honors",
  "inventory",
  "jobs",
  "khao-sat",
  "kits",
  "leads",
  "marketing",
  "media",
  "news",
  "nhan-su",
  "notifications",
  "orders",
  "parent-feedback",
  "parent-requests",
  "payment-methods",
  "payments",
  "products",
  "questions",
  "r2-test",
  "report-cards",
  "roles",
  "rooms",
  "satacoin",
  "scorm",
  "sessions",
  "settings",
  "site-content",
  "students",
  "teachers",
  "tich-hop",
  "tin-nhan",
  "trial-classes",
  "trials",
  "users",
  "vouchers",
]);

/** First path segment, e.g. "/leads/123" → "leads". */
export function firstSegment(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[0] ?? "";
}

export function isAdminRoute(p: string): boolean {
  return ADMIN_ROUTE_SEGMENTS.has(firstSegment(p));
}

// Cụm A1 — trang auth công khai (chưa đăng nhập vẫn vào): login + kích hoạt OTP.
const PUBLIC_AUTH_PATHS = new Set<string>(["/login", "/kich-hoat"]);
export function isPublicAuthPath(p: string): boolean {
  return PUBLIC_AUTH_PATHS.has(p);
}

export function isInfraPath(p: string): boolean {
  return (
    p.startsWith("/_next/") ||
    p.startsWith("/api/") ||
    p === "/favicon.ico" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p === "/manifest.json"
  );
}

export function isPortalPath(p: string): boolean {
  return p === "/portal" || p.startsWith("/portal/");
}

/** L5 — path site giáo viên (route group `app/(teacher)/teacher/*`). */
export function isTeacherPath(p: string): boolean {
  return p === "/teacher" || p.startsWith("/teacher/");
}

export function isLegacyAdminPrefixed(p: string): boolean {
  return p === "/admin" || p.startsWith("/admin/");
}

/**
 * Chống open-redirect cross-host: callbackUrl phải là path nội bộ thuần.
 * Loại bỏ `//host`, `http(s)://`, backslash trick, hoặc path không bắt đầu `/`.
 */
export function sanitizeCallbackUrl(p: string): string {
  if (typeof p !== "string" || p.length === 0) return "/";
  if (!p.startsWith("/")) return "/";
  if (p.startsWith("//") || p.startsWith("/\\")) return "/";
  if (p.includes("\\")) return "/";
  const lower = p.toLowerCase();
  if (lower.includes("http://") || lower.includes("https://")) return "/";
  return p;
}

// ───────────────────────────────────────────────────────────────────────────
// Core decision
// ───────────────────────────────────────────────────────────────────────────

const PORTAL_HOME = "/";
const STAFF_HOME = "/dashboard";
const TEACHER_HOME = "/"; // clean URL trên teacher host (rewrite nội bộ → /teacher)

/**
 * Quyết định routing thuần tuý cho 3 host thật (public/admin/portal).
 * `vercel`/`unknown` (localhost, preview) → `next`: proxy.ts xử lý riêng
 * (canonicalize production / dev passthrough).
 */
export function decideRoute(input: RouteInput): RouteDecision {
  const { hostKind, pathname, role, sessionValid } = input;

  // Đợt 3B — vai trò hữu hiệu (union). Trống roles → suy từ role chính.
  const effectiveRoles: MaybeRole[] =
    input.roles && input.roles.length > 0
      ? input.roles
      : role !== null
        ? [role]
        : [];
  const hasAnyRole = effectiveRoles.length > 0;

  // Logged-in = có vai trò HỢP LỆ. tokenVersion mismatch / deactivated → !authed.
  const authed = hasAnyRole && sessionValid;
  // isParent = CHỈ gồm PARENT (PARENT không kiêm nhân viên). isStaff = có ≥1 role
  // nhân viên (≠ PARENT) → ưu tiên host admin nếu lỡ trộn (defensive).
  const isStaff = authed && effectiveRoles.some((r) => r !== null && r !== "PARENT");
  const isParent = authed && !isStaff && effectiveRoles.includes("PARENT");
  // L5 — có role TEACHER (kể cả kiêm nhiệm) → được vào teacher host khi flag ON.
  const isTeacher = authed && effectiveRoles.includes("TEACHER");
  const teacherSiteOn = input.teacherSiteEnabled ?? isTeacherSiteEnabled();

  // Chỉ gắn reason khi đã từng có session nhưng bị vô hiệu (deactivated),
  // KHÔNG gắn cho khách ẩn danh (chưa login).
  const invalidReason: string | undefined =
    hasAnyRole && !sessionValid ? "session-invalidated" : undefined;

  // ── Public host ────────────────────────────────────────────────────────
  // Ai cũng vào (kể cả chưa login). Route admin/portal lọt vào → đá đúng host.
  if (hostKind === "public") {
    if (isPortalPath(pathname)) {
      return { type: "redirectHost", host: "portal", path: "/", status: 308 };
    }
    if (isLegacyAdminPrefixed(pathname)) {
      const cleanPath = pathname.replace(/^\/admin/, "") || STAFF_HOME;
      return { type: "redirectHost", host: "admin", path: cleanPath, status: 308 };
    }
    if (pathname === "/login" || isAdminRoute(pathname)) {
      return { type: "redirectHost", host: "admin", path: pathname, status: 308 };
    }
    return { type: "next" };
  }

  // ── Portal host (hocvien) ───────────────────────────────────────────────
  // Chỉ PARENT. Clean URL (/lich-hoc...) rewrite nội bộ → /portal/*.
  if (hostKind === "portal") {
    if (isInfraPath(pathname)) return { type: "next" };

    if (pathname === "/login") {
      if (isParent) return { type: "redirectPath", path: PORTAL_HOME };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang kích hoạt OTP — công khai (chưa login vẫn vào).
    if (pathname === "/kich-hoat") {
      if (isParent) return { type: "redirectPath", path: PORTAL_HOME };
      return { type: "next" };
    }

    if (!authed) {
      return {
        type: "redirectPath",
        path: "/login",
        callbackUrl: sanitizeCallbackUrl(pathname),
        reason: invalidReason,
      };
    }

    // Staff lạc vào portal → đẩy về admin host.
    if (isStaff) {
      return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
    }

    // PARENT: chuẩn hoá landing admin-ish (vd callbackUrl mặc định /dashboard)
    // về portal home, rồi rewrite clean URL → /portal/*.
    if (isAdminRoute(pathname)) {
      return { type: "redirectPath", path: PORTAL_HOME };
    }
    if (isPortalPath(pathname)) return { type: "next" };
    if (pathname === "/") return { type: "rewrite", path: "/portal" };
    return { type: "rewrite", path: "/portal" + pathname };
  }

  // ── Teacher host (giaovien.satarobo.vn) — L5, phiếu BGĐ câu 7 (04/07/2026) ─
  // 2-phase qua flag TEACHER_SITE_ENABLED. Chỉ TEACHER (kể cả đa vai trò kiêm
  // TEACHER); role khác đá về khu của họ. Clean URL rewrite nội bộ → /teacher/*.
  if (hostKind === "teacher") {
    if (isInfraPath(pathname)) return { type: "next" };

    // Flag OFF (phase 1): site GV chưa mở — GIỮ hành vi hiện tại (GV làm việc
    // trên admin). KHÔNG serve site GV, KHÔNG đá GV khỏi admin.
    if (!teacherSiteOn) {
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
    }

    if (pathname === "/login") {
      if (isTeacher) return { type: "redirectPath", path: TEACHER_HOME };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang kích hoạt OTP — công khai (chưa login vẫn vào).
    if (pathname === "/kich-hoat") {
      if (isTeacher) return { type: "redirectPath", path: TEACHER_HOME };
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" };
    }

    if (!authed) {
      return {
        type: "redirectPath",
        path: "/login",
        callbackUrl: sanitizeCallbackUrl(pathname),
        reason: invalidReason,
      };
    }

    // Đã login nhưng KHÔNG có role TEACHER → về đúng khu của họ.
    if (!isTeacher) {
      if (isStaff) {
        return { type: "redirectHost", host: "admin", path: STAFF_HOME, status: 307 };
      }
      return { type: "redirectHost", host: "portal", path: "/", status: 307 };
    }

    // TEACHER: chuẩn hoá path lạc khu (vd callbackUrl mặc định /dashboard,
    // /portal/*, legacy /admin/*) về teacher home, rồi rewrite clean URL.
    if (
      isAdminRoute(pathname) ||
      isPortalPath(pathname) ||
      isLegacyAdminPrefixed(pathname)
    ) {
      return { type: "redirectPath", path: TEACHER_HOME };
    }
    if (isTeacherPath(pathname)) return { type: "next" };
    if (pathname === "/") return { type: "rewrite", path: "/teacher" };
    return { type: "rewrite", path: "/teacher" + pathname };
  }

  // ── Admin host (admin.satarobo.vn) — clean URLs, internal rewrite ────────
  if (hostKind === "admin") {
    if (isInfraPath(pathname)) return { type: "next" };

    // Portal segment lọt sang admin → đẩy về portal host.
    if (isPortalPath(pathname)) {
      return { type: "redirectHost", host: "portal", path: "/", status: 308 };
    }

    // Legacy /admin/X URLs (bookmark cũ) → strip prefix, giữ host.
    if (isLegacyAdminPrefixed(pathname)) {
      const cleanPath = pathname.replace(/^\/admin/, "") || STAFF_HOME;
      return { type: "redirectPath", path: cleanPath };
    }

    if (pathname === "/") {
      if (!authed) {
        return { type: "redirectPath", path: "/login", reason: invalidReason };
      }
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "redirectPath", path: STAFF_HOME };
    }

    if (pathname === "/login") {
      if (isStaff) return { type: "redirectPath", path: STAFF_HOME };
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "next" }; // chưa login → form login
    }

    // Trang kích hoạt OTP — công khai (chưa login vẫn vào).
    if (pathname === "/kich-hoat") {
      if (isStaff) return { type: "redirectPath", path: STAFF_HOME };
      if (isParent) return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      return { type: "next" };
    }

    if (isAdminRoute(pathname)) {
      if (!authed) {
        return {
          type: "redirectPath",
          path: "/login",
          callbackUrl: sanitizeCallbackUrl(pathname),
          reason: invalidReason,
        };
      }
      // PARENT lọt vào admin route → đá về portal host (FIX lỗ hổng đã biết).
      if (isParent) {
        return { type: "redirectHost", host: "portal", path: "/", status: 307 };
      }
      return { type: "rewrite", path: "/admin" + pathname };
    }

    // Non-admin path trên admin host → bounce public host.
    return { type: "redirectHost", host: "public", path: pathname, status: 308 };
  }

  // ── vercel / unknown (localhost, preview) → proxy.ts xử lý riêng ─────────
  return { type: "next" };
}
