import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

const PUBLIC_HOST = "satarobo.vn";
const ADMIN_HOST = "admin.satarobo.vn";

type HostKind = "public" | "admin" | "vercel" | "unknown";

function detectHost(host: string): HostKind {
  if (host === PUBLIC_HOST || host === `www.${PUBLIC_HOST}`) return "public";
  if (host === ADMIN_HOST) return "admin";
  if (host.endsWith(".vercel.app")) return "vercel";
  return "unknown"; // localhost, preview deployments
}

function isAdminPath(p: string): boolean {
  return p.startsWith("/admin") || p === "/login";
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

/**
 * Redirect to same path on different host (preserves query string).
 */
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

/**
 * Add noindex headers for admin subdomain responses (SEO defense — admin
 * pages should never appear in search results).
 */
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
    const targetHost = isAdminPath(pathname) ? ADMIN_HOST : PUBLIC_HOST;
    return redirectToHost(req, targetHost, pathname, 308);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 2: satarobo.vn (public) — admin paths → redirect subdomain
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "public") {
    if (isAdminPath(pathname)) {
      return redirectToHost(req, ADMIN_HOST, pathname, 308);
    }
    return NextResponse.next();
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 3: admin.satarobo.vn — strict admin/auth/infra only
  // ═══════════════════════════════════════════════════════════════════
  if (kind === "admin") {
    if (isInfraPath(pathname)) {
      return NextResponse.next();
    }

    // Root or /admin → /admin/dashboard
    if (pathname === "/" || pathname === "/admin" || pathname === "/admin/") {
      return withAdminHeaders(redirectTo(req, "/admin/dashboard"));
    }

    // /login on admin host
    if (pathname === "/login") {
      if (session?.user) {
        return withAdminHeaders(redirectTo(req, "/admin/dashboard"));
      }
      return withAdminHeaders(NextResponse.next());
    }

    // /admin/* → check authenticated (no role gate, page handles permission)
    if (pathname.startsWith("/admin")) {
      if (!session?.user) {
        return withAdminHeaders(
          redirectTo(req, "/login", { callbackUrl: pathname }),
        );
      }
      // PASS — page-level can() handles authorization
      return withAdminHeaders(NextResponse.next());
    }

    // Non-admin paths on admin subdomain → bounce to public host.
    // VD: admin.satarobo.vn/khoa-hoc → satarobo.vn/khoa-hoc
    return redirectToHost(req, PUBLIC_HOST, pathname, 308);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRANCH 4: unknown host (localhost, preview *.vercel.app dev)
  // Apply combined logic — no subdomain split.
  // ═══════════════════════════════════════════════════════════════════
  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      return redirectTo(req, "/login", { callbackUrl: pathname });
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      return redirectTo(req, "/admin/dashboard");
    }
    return NextResponse.next();
  }

  if (pathname === "/login" && session?.user) {
    return redirectTo(req, "/admin/dashboard");
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
