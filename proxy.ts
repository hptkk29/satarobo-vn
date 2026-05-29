import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";
import type { Role } from "@prisma/client";
import {
  decideRoute,
  isAdminRoute,
  isLegacyAdminPrefixed,
  sanitizeCallbackUrl,
  type HostKind,
  type RouteDecision,
} from "@/lib/auth/route-policy";

const PUBLIC_HOST = "satarobo.vn";
const ADMIN_HOST = "admin.satarobo.vn";
const PORTAL_HOST = "hocvien.satarobo.vn"; // Phase T2.2 — portal phụ huynh/site con

function detectHost(host: string): HostKind {
  if (host === PUBLIC_HOST || host === `www.${PUBLIC_HOST}`) return "public";
  if (host === ADMIN_HOST) return "admin";
  if (host === PORTAL_HOST) return "portal";
  if (host.endsWith(".vercel.app")) return "vercel";
  return "unknown"; // localhost, preview deployments
}

const HOST_BY_KIND = {
  admin: ADMIN_HOST,
  portal: PORTAL_HOST,
  public: PUBLIC_HOST,
} as const;

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

/** Thực thi một RouteDecision (do `decideRoute()` trả về) thành NextResponse. */
function execute(req: NextAuthRequest, decision: RouteDecision): NextResponse {
  switch (decision.type) {
    case "next":
      return NextResponse.next();
    case "rewrite":
      return rewriteTo(req, decision.path);
    case "redirectPath": {
      const search: Record<string, string> = {};
      if (decision.callbackUrl) search.callbackUrl = decision.callbackUrl;
      if (decision.reason) search.reason = decision.reason;
      return redirectTo(req, decision.path, Object.keys(search).length ? search : undefined);
    }
    case "redirectHost":
      return redirectToHost(req, HOST_BY_KIND[decision.host], decision.path, decision.status);
  }
}

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const session = req.auth;
  const kind = detectHost(host);

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 1: *.vercel.app → canonical host (production only).
  // Pure canonicalization (không liên quan auth) — giữ inline.
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "vercel" && process.env.NODE_ENV === "production") {
    if (isLegacyAdminPrefixed(pathname)) {
      const cleanPath = pathname.replace(/^\/admin/, "") || "/dashboard";
      return redirectToHost(req, ADMIN_HOST, cleanPath, 308);
    }
    if (pathname === "/login" || isAdminRoute(pathname)) {
      return redirectToHost(req, ADMIN_HOST, pathname, 308);
    }
    return redirectToHost(req, PUBLIC_HOST, pathname, 308);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 2: host thật (public/admin/portal) → decideRoute() thuần tuý.
  // Toàn bộ logic phân quyền theo host nằm trong lib/auth/route-policy.ts
  // (test bằng route-policy.test.ts). Middleware không biết tokenVersion/
  // isActive (cần DB) → sessionValid = có JWT hợp lệ; tầng liveness
  // (deactivated/tokenVersion) enforce ở layout RSC. defense-in-depth.
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "public" || kind === "admin" || kind === "portal") {
    const decision = decideRoute({
      hostKind: kind,
      pathname,
      role: (session?.user?.role as Role | undefined) ?? null,
      roles: (session?.user?.roles as Role[] | undefined) ?? undefined,
      sessionValid: Boolean(session?.user),
    });
    const response = execute(req, decision);
    return kind === "admin" ? withAdminHeaders(response) : response;
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 3: unknown host (localhost, preview) — không có subdomain split.
  // Dùng path /admin/X như file system Next.js phục vụ + clean-URL mirror.
  // Áp role gate tối thiểu để dev không bypass được (PARENT ↛ /admin/*).
  // ═══════════════════════════════════════════════════════════════════
  const role = (session?.user?.role as Role | undefined) ?? null;

  if (isLegacyAdminPrefixed(pathname)) {
    if (!session?.user) {
      return redirectTo(req, "/login", { callbackUrl: sanitizeCallbackUrl(pathname) });
    }
    if (role === "PARENT") {
      return redirectTo(req, "/portal");
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      return redirectTo(req, "/admin/dashboard");
    }
    return NextResponse.next();
  }

  // Clean URL trên localhost: rewrite /X → /admin/X cho known admin routes.
  if (isAdminRoute(pathname)) {
    if (!session?.user) {
      return redirectTo(req, "/login", { callbackUrl: sanitizeCallbackUrl(pathname) });
    }
    if (role === "PARENT") {
      return redirectTo(req, "/portal");
    }
    return rewriteTo(req, "/admin" + pathname);
  }

  if (pathname === "/login" && session?.user) {
    return redirectTo(req, role === "PARENT" ? "/portal" : "/dashboard");
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
