import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

const PUBLIC_HOST = "satarobo.vn";
const ADMIN_HOST = "admin.satarobo.vn";
const PORTAL_HOST = "hocvien.satarobo.vn"; // Phase T2.2 — portal phụ huynh/site con

type HostKind = "public" | "admin" | "portal" | "vercel" | "unknown";

function detectHost(host: string): HostKind {
  if (host === PUBLIC_HOST || host === `www.${PUBLIC_HOST}`) return "public";
  if (host === ADMIN_HOST) return "admin";
  if (host === PORTAL_HOST) return "portal";
  if (host.endsWith(".vercel.app")) return "vercel";
  return "unknown"; // localhost, preview deployments
}

// Top-level route segments under app/(admin)/admin/* — admin host serves
// these at the root path (no /admin prefix). Keep in sync with the folder
// list. Adding a new admin route? Add its top segment here.
const ADMIN_ROUTE_SEGMENTS = new Set<string>([
  "assignments",
  "attendance",
  "audit-log",
  "centers",
  "charts-test",
  "class-groups",
  "classes",
  "course-packages",
  "crm",
  "curriculums",
  "dashboard",
  "design-system-preview",
  "design-system-preview-v2",
  "documents",
  "email-logs",
  "email-templates",
  "enrollments",
  "exams",
  "holidays",
  "honors",
  "inventory",
  "jobs",
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
  "products",
  "questions",
  "r2-test",
  "rooms",
  "sessions",
  "settings",
  "site-content",
  "students",
  "teachers",
  "trials",
  "users",
  "vouchers",
]);

/** First path segment, e.g. "/leads/123" → "leads". */
function firstSegment(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[0] ?? "";
}

function isAdminRoute(p: string): boolean {
  return ADMIN_ROUTE_SEGMENTS.has(firstSegment(p));
}

function isInfraPath(p: string): boolean {
  return (
    p.startsWith("/_next/") ||
    p.startsWith("/api/") ||
    p === "/favicon.ico" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p === "/manifest.json"
  );
}

/** Redirect to same path on different host (preserves query string). */
function redirectToHost(
  req: NextAuthRequest,
  targetHost: string,
  targetPath: string,
  status: 307 | 308 = 308,
): NextResponse {
  const url = req.nextUrl.clone();
  url.host = targetHost;
  url.protocol = "https:";
  url.port = "";
  url.pathname = targetPath;
  return NextResponse.redirect(url, status);
}

/**
 * Redirect within same host (preserves host). Build URL từ
 * `req.nextUrl.clone()` thay vì `new URL(path, req.url)` để KHÔNG bị
 * NextAuth canonicalize sang NEXTAUTH_URL/VERCEL_URL.
 */
function redirectTo(
  req: NextAuthRequest,
  pathname: string,
  search?: Record<string, string>,
): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      url.searchParams.set(k, v);
    }
  }
  return NextResponse.redirect(url);
}

/** Internal rewrite — URL bar stays, server-side resolves new path. */
function rewriteTo(req: NextAuthRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

/** Add noindex headers for admin subdomain responses (SEO defense). */
function withAdminHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const session = req.auth;
  const kind = detectHost(host);

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 1: *.vercel.app → canonical host (production only)
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "vercel" && process.env.NODE_ENV === "production") {
    // Strip /admin prefix when bouncing to admin host (clean URLs there).
    const isAdminPrefixed = pathname.startsWith("/admin/") || pathname === "/admin";
    if (isAdminPrefixed) {
      const cleanPath = pathname.replace(/^\/admin/, "") || "/dashboard";
      return redirectToHost(req, ADMIN_HOST, cleanPath, 308);
    }
    if (pathname === "/login" || isAdminRoute(pathname)) {
      return redirectToHost(req, ADMIN_HOST, pathname, 308);
    }
    return redirectToHost(req, PUBLIC_HOST, pathname, 308);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 1.5: hocvien.satarobo.vn — portal phụ huynh (Phase T2.2)
  // Chỉ role PARENT. Clean URL (/lich-hoc...) rewrite nội bộ → /portal/*.
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "portal") {
    if (isInfraPath(pathname)) return NextResponse.next();

    // Trang đăng nhập dùng chung (app/(auth)/login).
    if (pathname === "/login") {
      if (session?.user?.role === "PARENT") return redirectTo(req, "/");
      return NextResponse.next();
    }

    if (!session?.user) {
      return redirectTo(req, "/login", { callbackUrl: pathname });
    }
    // Staff (không phải phụ huynh) lạc vào portal → đẩy về admin host.
    if (session.user.role !== "PARENT") {
      return redirectToHost(req, ADMIN_HOST, "/dashboard", 307);
    }

    // PARENT: chuẩn hoá landing admin-ish (vd callbackUrl mặc định /dashboard)
    // về portal home, rồi rewrite clean URL → /portal/*.
    if (pathname === "/dashboard" || isAdminRoute(pathname)) {
      return redirectTo(req, "/");
    }
    if (pathname === "/") return rewriteTo(req, "/portal");
    if (pathname === "/portal" || pathname.startsWith("/portal/")) {
      return NextResponse.next();
    }
    return rewriteTo(req, "/portal" + pathname);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 2: satarobo.vn (public)
  // - Old /admin/X URLs → 308 to admin host without /admin prefix
  // - Bare admin route names → 308 to admin host
  // - /login → 308 to admin host
  // - Everything else → public passthrough
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "public") {
    // Portal-only segment lọt sang public host → đẩy về portal host.
    if (pathname === "/portal" || pathname.startsWith("/portal/")) {
      return redirectToHost(req, PORTAL_HOST, "/", 308);
    }
    if (pathname.startsWith("/admin/") || pathname === "/admin") {
      const cleanPath = pathname.replace(/^\/admin/, "") || "/dashboard";
      return redirectToHost(req, ADMIN_HOST, cleanPath, 308);
    }
    if (pathname === "/login" || isAdminRoute(pathname)) {
      return redirectToHost(req, ADMIN_HOST, pathname, 308);
    }
    return NextResponse.next();
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 3: admin.satarobo.vn — clean URLs, internal rewrite
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "admin") {
    if (isInfraPath(pathname)) {
      return NextResponse.next();
    }

    // Portal-only segment lọt sang admin host → đẩy về portal host.
    if (pathname === "/portal" || pathname.startsWith("/portal/")) {
      return redirectToHost(req, PORTAL_HOST, "/", 308);
    }

    // Legacy /admin/X URLs (old bookmarks, external links) → 308 strip prefix
    if (pathname.startsWith("/admin/") || pathname === "/admin") {
      const cleanPath = pathname.replace(/^\/admin/, "") || "/dashboard";
      return withAdminHeaders(redirectTo(req, cleanPath));
    }

    // Root → dashboard
    if (pathname === "/") {
      if (!session?.user) {
        return withAdminHeaders(redirectTo(req, "/login"));
      }
      return withAdminHeaders(redirectTo(req, "/dashboard"));
    }

    // /login on admin host
    if (pathname === "/login") {
      if (session?.user) {
        return withAdminHeaders(redirectTo(req, "/dashboard"));
      }
      return withAdminHeaders(NextResponse.next());
    }

    // Known admin route → rewrite internally to /admin/X so Next.js resolves
    // file at app/(admin)/admin/X. URL bar stays as /X.
    if (isAdminRoute(pathname)) {
      if (!session?.user) {
        return withAdminHeaders(
          redirectTo(req, "/login", { callbackUrl: pathname }),
        );
      }
      return withAdminHeaders(rewriteTo(req, "/admin" + pathname));
    }

    // Non-admin path on admin host → bounce to public host
    // VD: admin.satarobo.vn/khoa-hoc → satarobo.vn/khoa-hoc
    return redirectToHost(req, PUBLIC_HOST, pathname, 308);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 4: unknown host (localhost, preview deployments)
  // No subdomain split — use the same /admin/X paths Next.js file system
  // serves. Apply auth gate + legacy /admin/X cleanup mirror.
  // ═══════════════════════════════════════════════════════════════════
  if (pathname.startsWith("/admin/") || pathname === "/admin") {
    if (!session?.user) {
      return redirectTo(req, "/login", { callbackUrl: pathname });
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      return redirectTo(req, "/admin/dashboard");
    }
    return NextResponse.next();
  }

  // Clean URL on localhost too — rewrite /X → /admin/X for known admin routes
  if (isAdminRoute(pathname)) {
    if (!session?.user) {
      return redirectTo(req, "/login", { callbackUrl: pathname });
    }
    return rewriteTo(req, "/admin" + pathname);
  }

  if (pathname === "/login" && session?.user) {
    return redirectTo(req, "/dashboard");
  }

  return NextResponse.next();
});

// Broad matcher — middleware runs on all page/API requests.
// Static assets excluded for performance.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|js|css|woff|woff2|ttf|map)$).*)",
  ],
};
