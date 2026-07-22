import { describe, it, expect } from "vitest";
import {
  decideRoute,
  isAdminRoute,
  sanitizeCallbackUrl,
  type MaybeRole,
  type RouteDecision,
} from "./route-policy";

/**
 * Bảng tổ hợp host × role × sessionValid cho `decideRoute()`.
 *
 * Ma trận nguồn chân lý:
 *  - 7 staff role (TRỪ PARENT): admin ✅ / portal ❌ (đá về admin).
 *  - PARENT: portal ✅ / admin ❌ (đá về portal).
 *  - Chưa login: /login GIỮ host đang đứng (callbackUrl = path).
 *  - Public: ai cũng vào; /admin|/portal lọt vào → đá đúng host.
 *
 * Các case khoá lỗ hổng đã biết (proxy.ts cũ KHÔNG check role ở admin branch):
 *  - PARENT + admin route → PHẢI redirectHost portal (trước fix: rewrite /admin/* = LỌT).
 *  - PARENT + admin /login (đã login) → PHẢI redirectHost portal (trước fix: → /dashboard).
 */

const STAFF_ROLES = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "HR",
  "SALES_CSM",
  "TEACHER",
  "MARKETING",
  "ACCOUNTANT",
] as const satisfies readonly Exclude<NonNullable<MaybeRole>, "PARENT">[];

const ALL_ROLES = [...STAFF_ROLES, "PARENT"] as const;

function authed(role: MaybeRole) {
  return { role, sessionValid: true } as const;
}

// ─────────────────────────────────────────────────────────────────────────
// A. Ma trận host × role
// ─────────────────────────────────────────────────────────────────────────

describe("A. admin host × role", () => {
  it("mọi staff role vào admin route → rewrite /admin/* (GV THUẦN → site GV sau flip 10/07)", () => {
    for (const role of STAFF_ROLES) {
      const d = decideRoute({ hostKind: "admin", pathname: "/leads", ...authed(role) });
      if (role === "TEACHER") {
        // Flip TEACHER_SITE_ENABLED (default ON): GV thuần không làm việc trên
        // admin nữa — chuyển sang giaovien. GV kiêm nhiệm (test L6 riêng) ở lại.
        expect(d).toEqual<RouteDecision>({
          type: "redirectHost",
          host: "teacher",
          path: "/",
          status: 307,
        });
      } else {
        expect(d).toEqual<RouteDecision>({ type: "rewrite", path: "/admin/leads" });
      }
    }
  });

  // Regression: route folder tồn tại dưới app/(admin)/admin/* nhưng KHÔNG có
  // trong ADMIN_ROUTE_SEGMENTS → isAdminRoute=false → admin host bounce về public
  // = 404 (lỗi đã gặp với /payments, /cong-no, /report-cards, /cau-hinh-van-hanh).
  // Thêm route admin mới PHẢI thêm segment vào set.
  it("các route tài chính/báo cáo mới được nhận là admin route", () => {
    for (const seg of [
      "payments",
      "cong-no",
      "report-cards",
      "cau-hinh-van-hanh",
      "evaluations",
      "roles",
      "scorm",
      "bao-cao",
    ]) {
      expect(isAdminRoute(`/${seg}`)).toBe(true);
      expect(
        decideRoute({ hostKind: "admin", pathname: `/${seg}`, ...authed("SUPER_ADMIN") }),
      ).toEqual<RouteDecision>({ type: "rewrite", path: `/admin/${seg}` });
    }
  });

  it("PARENT vào admin route → redirectHost portal (lỗ hổng đã bịt)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/dashboard", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 307,
    });
    // nested admin path cũng phải bị chặn
    expect(
      decideRoute({ hostKind: "admin", pathname: "/leads/123", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 307,
    });
  });

  it("chưa login vào admin route → /login GIỮ host admin + callbackUrl", () => {
    expect(
      decideRoute({
        hostKind: "admin",
        pathname: "/leads",
        role: null,
        sessionValid: false,
      }),
    ).toEqual<RouteDecision>({
      type: "redirectPath",
      path: "/login",
      callbackUrl: "/leads",
      reason: undefined,
    });
  });

  it("staff vào / → /dashboard; PARENT vào / → portal; ẩn danh → /login", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/", ...authed("HR") }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/dashboard" });
    expect(
      decideRoute({ hostKind: "admin", pathname: "/", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 307,
    });
    expect(
      decideRoute({ hostKind: "admin", pathname: "/", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/login", reason: undefined });
  });
});

describe("A. portal host × role", () => {
  it("PARENT clean path → rewrite /portal/*", () => {
    expect(
      decideRoute({ hostKind: "portal", pathname: "/lich-hoc", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/portal/lich-hoc" });
    expect(
      decideRoute({ hostKind: "portal", pathname: "/", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/portal" });
  });

  it("mọi staff role lạc vào portal → redirectHost admin", () => {
    for (const role of STAFF_ROLES) {
      expect(
        decideRoute({ hostKind: "portal", pathname: "/lich-hoc", ...authed(role) }),
      ).toEqual<RouteDecision>({
        type: "redirectHost",
        host: "admin",
        path: "/dashboard",
        status: 307,
      });
    }
  });

  it("chưa login vào portal → /login GIỮ host portal + callbackUrl", () => {
    expect(
      decideRoute({
        hostKind: "portal",
        pathname: "/lich-hoc",
        role: null,
        sessionValid: false,
      }),
    ).toEqual<RouteDecision>({
      type: "redirectPath",
      path: "/login",
      callbackUrl: "/lich-hoc",
      reason: undefined,
    });
  });

  it("PARENT vào admin-ish path trên portal (vd /dashboard) → portal home", () => {
    expect(
      decideRoute({ hostKind: "portal", pathname: "/dashboard", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/" });
  });
});

describe("A. public host × role — ai cũng vào", () => {
  it("public page → next (mọi role + ẩn danh)", () => {
    for (const role of [...ALL_ROLES, null] as MaybeRole[]) {
      expect(
        decideRoute({
          hostKind: "public",
          pathname: "/khoa-hoc",
          role,
          sessionValid: role !== null,
        }),
      ).toEqual<RouteDecision>({ type: "next" });
    }
  });
});

describe("A. public host × /login — F4 cổng login chung (Q41)", () => {
  it("mặc định (OFF): public /login → 307 admin/login (dồn về admin, không cache vĩnh viễn)", () => {
    expect(
      decideRoute({ hostKind: "public", pathname: "/login", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "admin", path: "/login", status: 307 });
    expect(
      decideRoute({ hostKind: "public", pathname: "/login", ...authed("SUPER_ADMIN") }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "admin", path: "/login", status: 307 });
  });

  it("ON: ẩn danh public /login → next (serve form ngay tại satarobo.vn)", () => {
    expect(
      decideRoute({
        hostKind: "public",
        pathname: "/login",
        role: null,
        sessionValid: false,
        commonLoginAtRoot: true,
      }),
    ).toEqual<RouteDecision>({ type: "next" });
  });

  it("ON: đã login mở public /login → về đúng host (staff→admin, PARENT→portal, GV thuần→teacher)", () => {
    expect(
      decideRoute({
        hostKind: "public",
        pathname: "/login",
        ...authed("SUPER_ADMIN"),
        commonLoginAtRoot: true,
      }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "admin", path: "/dashboard", status: 307 });
    expect(
      decideRoute({
        hostKind: "public",
        pathname: "/login",
        ...authed("PARENT"),
        commonLoginAtRoot: true,
      }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "portal", path: "/", status: 307 });
    expect(
      decideRoute({
        hostKind: "public",
        pathname: "/login",
        ...authed("TEACHER"),
        commonLoginAtRoot: true,
        teacherSiteEnabled: true,
      }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "teacher", path: "/", status: 307 });
  });

  it("ON: /login → admin route KHÁC vẫn 308 admin (không đổi)", () => {
    expect(
      decideRoute({
        hostKind: "public",
        pathname: "/dashboard",
        role: null,
        sessionValid: false,
        commonLoginAtRoot: true,
      }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "admin", path: "/dashboard", status: 308 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// B. Edge cases
// ─────────────────────────────────────────────────────────────────────────

describe("B. /login khi đã login", () => {
  it("PARENT ở portal/login → portal home", () => {
    expect(
      decideRoute({ hostKind: "portal", pathname: "/login", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/" });
  });

  it("staff ở admin/login → /dashboard", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/login", ...authed("SUPER_ADMIN") }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/dashboard" });
  });

  it("PARENT ở admin/login (đã login) → redirectHost portal", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/login", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 307,
    });
  });

  it("staff ở portal/login (đã login) → redirectHost admin", () => {
    expect(
      decideRoute({ hostKind: "portal", pathname: "/login", ...authed("TEACHER") }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/dashboard",
      status: 307,
    });
  });

  it("chưa login ở /login (admin & portal) → next (hiện form)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/login", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({ type: "next" });
    expect(
      decideRoute({ hostKind: "portal", pathname: "/login", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({ type: "next" });
  });
});

describe("B. route lọt sai host", () => {
  it("/admin/* lọt vào public → redirectHost admin (strip prefix)", () => {
    expect(
      decideRoute({ hostKind: "public", pathname: "/admin/leads", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/leads",
      status: 308,
    });
  });

  it("bare admin route name lọt vào public → redirectHost admin", () => {
    expect(
      decideRoute({ hostKind: "public", pathname: "/leads", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/leads",
      status: 308,
    });
  });

  it("/portal/* lọt vào public host → redirectHost portal", () => {
    expect(
      decideRoute({ hostKind: "public", pathname: "/portal/lich-hoc", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 308,
    });
  });

  it("/portal/* lọt vào admin host → redirectHost portal", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/portal/lich-hoc", ...authed("PARENT") }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 308,
    });
  });

  it("legacy /admin/X trên admin host → strip prefix (giữ host)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/admin/leads", ...authed("HR") }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/leads" });
  });

  it("non-admin path trên admin host → bounce public", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/khoa-hoc", ...authed("HR") }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "public",
      path: "/khoa-hoc",
      status: 308,
    });
  });
});

describe("B. infra paths không bị auth", () => {
  for (const p of ["/api/leads", "/_next/static/chunk.js", "/favicon.ico"]) {
    it(`${p} (admin host) → next`, () => {
      expect(
        decideRoute({ hostKind: "admin", pathname: p, role: null, sessionValid: false }),
      ).toEqual<RouteDecision>({ type: "next" });
    });
    it(`${p} (portal host) → next`, () => {
      expect(
        decideRoute({ hostKind: "portal", pathname: p, role: null, sessionValid: false }),
      ).toEqual<RouteDecision>({ type: "next" });
    });
  }
});

describe("B. sessionValid=false (deactivated) → /login?reason bất kể role", () => {
  it("admin route, role còn nhưng session invalid → /login + reason + callbackUrl", () => {
    for (const role of ALL_ROLES) {
      const d = decideRoute({
        hostKind: "admin",
        pathname: "/leads",
        role,
        sessionValid: false,
      });
      expect(d).toEqual<RouteDecision>({
        type: "redirectPath",
        path: "/login",
        callbackUrl: "/leads",
        reason: "session-invalidated",
      });
    }
  });

  it("portal route, role còn nhưng session invalid → /login + reason", () => {
    const d = decideRoute({
      hostKind: "portal",
      pathname: "/lich-hoc",
      role: "PARENT",
      sessionValid: false,
    });
    expect(d).toEqual<RouteDecision>({
      type: "redirectPath",
      path: "/login",
      callbackUrl: "/lich-hoc",
      reason: "session-invalidated",
    });
  });
});

describe("B. callbackUrl sanitize chống open-redirect", () => {
  it("path nội bộ thuần → giữ nguyên", () => {
    expect(sanitizeCallbackUrl("/leads/123")).toBe("/leads/123");
  });
  it("//evil.com → /", () => {
    expect(sanitizeCallbackUrl("//evil.com")).toBe("/");
  });
  it("chứa http(s):// → /", () => {
    expect(sanitizeCallbackUrl("/x?next=https://evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("/redir?u=http://evil")).toBe("/");
  });
  it("backslash trick → /", () => {
    expect(sanitizeCallbackUrl("/\\evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("\\\\evil.com")).toBe("/");
  });
  it("không bắt đầu bằng / → /", () => {
    expect(sanitizeCallbackUrl("evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("")).toBe("/");
  });

  it("decideRoute không bao giờ trả callbackUrl chứa host khác", () => {
    const d = decideRoute({
      hostKind: "admin",
      pathname: "//evil.com/leads",
      role: null,
      sessionValid: false,
    });
    // "//evil.com/leads" firstSegment = "evil.com" → không phải admin route →
    // bounce public; nhưng nếu là admin route, callbackUrl phải đã sanitize.
    if (d.type === "redirectPath" && d.callbackUrl) {
      expect(d.callbackUrl.startsWith("//")).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tổng quát: KHÔNG bao giờ rewrite /admin/* cho PARENT, /portal/* cho staff.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Đợt 3B — đa vai trò (roles[])
// ─────────────────────────────────────────────────────────────────────────

describe("3B. đa vai trò (roles[])", () => {
  it("[CENTER_MANAGER, TEACHER] vào admin route → rewrite /admin/*", () => {
    expect(
      decideRoute({
        hostKind: "admin",
        pathname: "/leads",
        role: "CENTER_MANAGER",
        roles: ["CENTER_MANAGER", "TEACHER"],
        sessionValid: true,
      }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/admin/leads" });
  });

  it("[CENTER_MANAGER, TEACHER] vào portal → redirectHost admin (staff cấm portal)", () => {
    expect(
      decideRoute({
        hostKind: "portal",
        pathname: "/lich-hoc",
        role: "CENTER_MANAGER",
        roles: ["CENTER_MANAGER", "TEACHER"],
        sessionValid: true,
      }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/dashboard",
      status: 307,
    });
  });

  it("[PARENT] (roles) vẫn như cũ — admin → portal, portal → rewrite", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/dashboard", role: "PARENT", roles: ["PARENT"], sessionValid: true }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "portal", path: "/", status: 307 });
    expect(
      decideRoute({ hostKind: "portal", pathname: "/lich-hoc", role: "PARENT", roles: ["PARENT"], sessionValid: true }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/portal/lich-hoc" });
  });

  it("phòng vệ: nếu lỡ trộn [CENTER_MANAGER, PARENT] → coi là STAFF (vào admin, cấm portal)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/leads", role: "CENTER_MANAGER", roles: ["CENTER_MANAGER", "PARENT"], sessionValid: true }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/admin/leads" });
    expect(
      decideRoute({ hostKind: "portal", pathname: "/lich-hoc", role: "CENTER_MANAGER", roles: ["CENTER_MANAGER", "PARENT"], sessionValid: true }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "admin", path: "/dashboard", status: 307 });
  });

  it("roles trống → fallback role chính (back-compat)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/leads", role: "HR", roles: [], sessionValid: true }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/admin/leads" });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// L5 — teacher host (giaovien.satarobo.vn) × role × flag TEACHER_SITE_ENABLED
// (phiếu BGĐ câu 7, 04/07/2026). 2-phase: flag OFF = hành vi hiện tại y nguyên.
// ─────────────────────────────────────────────────────────────────────────

describe("L5. teacher host × role — flag OFF (mặc định)", () => {
  const OFF = { teacherSiteEnabled: false } as const;

  it("TEACHER trên giaovien → bounce admin /dashboard (site chưa mở, GV vẫn dùng admin)", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/", ...authed("TEACHER"), ...OFF }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/dashboard",
      status: 307,
    });
  });

  it("mọi staff role trên giaovien → bounce admin; PARENT → portal; ẩn danh → admin", () => {
    for (const role of STAFF_ROLES) {
      expect(
        decideRoute({ hostKind: "teacher", pathname: "/lich", ...authed(role), ...OFF }),
      ).toEqual<RouteDecision>({
        type: "redirectHost",
        host: "admin",
        path: "/dashboard",
        status: 307,
      });
    }
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/lich", ...authed("PARENT"), ...OFF }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 307,
    });
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/lich", role: null, sessionValid: false, ...OFF }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/dashboard",
      status: 307,
    });
  });

  it("bỏ trống flag (env unset trong test) → mặc định ON (FLIP 10/07 — site GV mở)", () => {
    // Trước flip default OFF → GV trên teacher host bị đá về admin. Sau flip
    // (lib/flags.ts !== "false") GV vào thẳng site GV; rollback = env "false"
    // (hành vi OFF vẫn được phủ bởi các test truyền teacherSiteEnabled: false).
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/", ...authed("TEACHER") }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/teacher" });
  });

  it("infra path → next (không bị bounce, kể cả flag OFF)", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/api/auth/session", role: null, sessionValid: false, ...OFF }),
    ).toEqual<RouteDecision>({ type: "next" });
  });
});

describe("L5. teacher host × role — flag ON", () => {
  const ON = { teacherSiteEnabled: true } as const;

  it("TEACHER: / → rewrite /teacher; clean URL /lich → rewrite /teacher/lich; /teacher/lich → next", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/", ...authed("TEACHER"), ...ON }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/teacher" });
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/lich", ...authed("TEACHER"), ...ON }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/teacher/lich" });
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/teacher/lich", ...authed("TEACHER"), ...ON }),
    ).toEqual<RouteDecision>({ type: "next" });
  });

  it("TEACHER ở /login (đã login) → teacher home", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/login", ...authed("TEACHER"), ...ON }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/" });
  });

  it("đa vai trò kiêm TEACHER ([CENTER_MANAGER, TEACHER]) → vào site GV", () => {
    expect(
      decideRoute({
        hostKind: "teacher",
        pathname: "/lich",
        role: "CENTER_MANAGER",
        roles: ["CENTER_MANAGER", "TEACHER"],
        sessionValid: true,
        ...ON,
      }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/teacher/lich" });
  });

  it("staff KHÔNG có role TEACHER (CENTER_MANAGER) → bounce admin /dashboard", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/lich", ...authed("CENTER_MANAGER"), ...ON }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/dashboard",
      status: 307,
    });
    // kể cả đứng ở /login
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/login", ...authed("CENTER_MANAGER"), ...ON }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "admin",
      path: "/dashboard",
      status: 307,
    });
  });

  it("PARENT → bounce portal /", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/lich", ...authed("PARENT"), ...ON }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 307,
    });
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/login", ...authed("PARENT"), ...ON }),
    ).toEqual<RouteDecision>({
      type: "redirectHost",
      host: "portal",
      path: "/",
      status: 307,
    });
  });

  it("chưa login → /login GIỮ host teacher + callbackUrl; ở /login → next (form)", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/lich", role: null, sessionValid: false, ...ON }),
    ).toEqual<RouteDecision>({
      type: "redirectPath",
      path: "/login",
      callbackUrl: "/lich",
      reason: undefined,
    });
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/login", role: null, sessionValid: false, ...ON }),
    ).toEqual<RouteDecision>({ type: "next" });
  });

  it("sessionValid=false (deactivated) → /login + reason", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/lich", role: "TEACHER", sessionValid: false, ...ON }),
    ).toEqual<RouteDecision>({
      type: "redirectPath",
      path: "/login",
      callbackUrl: "/lich",
      reason: "session-invalidated",
    });
  });

  it("TEACHER vào path lạc khu (/dashboard, /portal/x, /admin/x) → teacher home", () => {
    for (const p of ["/dashboard", "/leads", "/portal/lich-hoc", "/admin/leads"]) {
      expect(
        decideRoute({ hostKind: "teacher", pathname: p, ...authed("TEACHER"), ...ON }),
      ).toEqual<RouteDecision>({ type: "redirectPath", path: "/" });
    }
  });

  it("infra path → next", () => {
    expect(
      decideRoute({ hostKind: "teacher", pathname: "/_next/static/x.js", role: null, sessionValid: false, ...ON }),
    ).toEqual<RouteDecision>({ type: "next" });
  });
});

describe("L5/L6. TEACHER × host × flag TEACHER_SITE_ENABLED (2-phase, ĐÃ wire proxy #06)", () => {
  // Public host: GV vẫn xem site công khai bình thường (cả 2 flag).
  for (const flag of [false, true]) {
    it(`flag=${flag}: TEACHER trên public host (apex) → next`, () => {
      expect(
        decideRoute({
          hostKind: "public",
          pathname: "/khoa-hoc",
          ...authed("TEACHER"),
          teacherSiteEnabled: flag,
        }),
      ).toEqual<RouteDecision>({ type: "next" });
    });
  }

  // flag OFF (L5, 2-phase): GV thuần vẫn LÀM VIỆC trên admin — KHÔNG đá đi.
  it("flag=false: GV thuần trên admin host → rewrite /admin/* (vẫn dùng admin)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/leads", ...authed("TEACHER"), teacherSiteEnabled: false }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/admin/leads" });
  });
  it("flag=false: GV thuần login trên admin host → /dashboard (chưa auto-bounce)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/login", ...authed("TEACHER"), teacherSiteEnabled: false }),
    ).toEqual<RouteDecision>({ type: "redirectPath", path: "/dashboard" });
  });

  // flag ON (L6, đã wire proxy #06): GV THUẦN trên admin → auto-bounce sang giaovien.
  it("flag=true: GV thuần trên admin host → redirectHost teacher (L6 auto-bounce)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/leads", ...authed("TEACHER"), teacherSiteEnabled: true }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "teacher", path: "/", status: 307 });
  });
  it("flag=true: GV thuần login trên admin host → redirectHost teacher (L6)", () => {
    expect(
      decideRoute({ hostKind: "admin", pathname: "/login", ...authed("TEACHER"), teacherSiteEnabled: true }),
    ).toEqual<RouteDecision>({ type: "redirectHost", host: "teacher", path: "/", status: 307 });
  });

  // flag ON: GV KIÊM vai trò admin (CENTER_MANAGER) → KHÔNG auto-bounce, vẫn dùng admin.
  it("flag=true: GV kiêm CENTER_MANAGER trên admin host → vẫn admin (isTeacherOnly=false)", () => {
    expect(
      decideRoute({
        hostKind: "admin",
        pathname: "/leads",
        role: "CENTER_MANAGER",
        roles: ["CENTER_MANAGER", "TEACHER"],
        sessionValid: true,
        teacherSiteEnabled: true,
      }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/admin/leads" });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Sale host (sale.satarobo.vn) — site tĩnh CÔNG KHAI, KHÔNG auth.
// Form nhập liệu Sale → MISA AMIS CRM. Clean URL rewrite nội bộ →
// public/sale/*.html (giữ nguyên mã nhúng MISA). MISA tự POST + redirect về
// /thank-you (field RedirectURL trong form) — decideRoute chỉ serve URL đó.
// ─────────────────────────────────────────────────────────────────────────

describe("Sale host (sale.satarobo.vn) — form tĩnh, không auth", () => {
  it("/ → rewrite form nhập liệu tĩnh", () => {
    expect(
      decideRoute({ hostKind: "sale", pathname: "/", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/sale/nhap-lieu.html" });
  });

  it("/thank-you (+ trailing slash) → rewrite trang cảm ơn tĩnh", () => {
    expect(
      decideRoute({ hostKind: "sale", pathname: "/thank-you", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/sale/thank-you.html" });
    expect(
      decideRoute({ hostKind: "sale", pathname: "/thank-you/", role: null, sessionValid: false }),
    ).toEqual<RouteDecision>({ type: "rewrite", path: "/sale/thank-you.html" });
  });

  it("file tĩnh /sale/*.html (đích rewrite / truy cập trực tiếp) → next", () => {
    for (const p of ["/sale/nhap-lieu.html", "/sale/thank-you.html"]) {
      expect(
        decideRoute({ hostKind: "sale", pathname: p, role: null, sessionValid: false }),
      ).toEqual<RouteDecision>({ type: "next" });
    }
  });

  it("path lạ trên sale host → về form nhập liệu (/)", () => {
    for (const p of ["/random", "/khoa-hoc", "/admin/leads", "/portal/lich-hoc", "/login"]) {
      expect(
        decideRoute({ hostKind: "sale", pathname: p, role: null, sessionValid: false }),
      ).toEqual<RouteDecision>({ type: "redirectPath", path: "/" });
    }
  });

  it("infra path (favicon/api/robots/_next) → next", () => {
    for (const p of ["/favicon.ico", "/api/anything", "/robots.txt", "/_next/static/x.js"]) {
      expect(
        decideRoute({ hostKind: "sale", pathname: p, role: null, sessionValid: false }),
      ).toEqual<RouteDecision>({ type: "next" });
    }
  });

  it("CÔNG KHAI: mọi role + ẩn danh đều nhận CÙNG quyết định (auth bị bỏ qua)", () => {
    for (const role of [...ALL_ROLES, null] as MaybeRole[]) {
      const sessionValid = role !== null;
      expect(
        decideRoute({ hostKind: "sale", pathname: "/", role, sessionValid }),
      ).toEqual<RouteDecision>({ type: "rewrite", path: "/sale/nhap-lieu.html" });
      expect(
        decideRoute({ hostKind: "sale", pathname: "/thank-you", role, sessionValid }),
      ).toEqual<RouteDecision>({ type: "rewrite", path: "/sale/thank-you.html" });
    }
  });
});

describe("Invariants bảo mật", () => {
  it("PARENT KHÔNG bao giờ nhận rewrite vào /admin/*", () => {
    for (const p of ["/leads", "/dashboard", "/users", "/nhan-su", "/settings"]) {
      const d = decideRoute({ hostKind: "admin", pathname: p, ...authed("PARENT") });
      expect(d.type === "rewrite" && d.path.startsWith("/admin")).toBe(false);
    }
  });

  it("staff KHÔNG bao giờ nhận rewrite vào /portal/*", () => {
    for (const role of STAFF_ROLES) {
      for (const p of ["/lich-hoc", "/bai-tap", "/ho-so"]) {
        const d = decideRoute({ hostKind: "portal", pathname: p, ...authed(role) });
        expect(d.type === "rewrite" && d.path.startsWith("/portal")).toBe(false);
      }
    }
  });

  it("L5: role KHÔNG-TEACHER không bao giờ nhận rewrite vào /teacher/* (kể cả flag ON)", () => {
    const nonTeacher = [...STAFF_ROLES.filter((r) => r !== "TEACHER"), "PARENT"] as const;
    for (const role of nonTeacher) {
      for (const p of ["/", "/lich", "/teacher/lich"]) {
        for (const flag of [false, true]) {
          const d = decideRoute({
            hostKind: "teacher",
            pathname: p,
            ...authed(role),
            teacherSiteEnabled: flag,
          });
          expect(d.type === "rewrite" || d.type === "next").toBe(false);
        }
      }
    }
  });
});
