import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

const HR_ALLOWED_ROUTES = ["/admin/nhan-su", "/admin/dashboard"];
const ADMIN_ONLY_PREFIX = "/admin";

/**
 * Build redirect URL từ req.nextUrl.clone() thay vì `new URL(path, req.url)`.
 * `req.url` có thể bị NextAuth canonicalize sang NEXTAUTH_URL/VERCEL_URL
 * → leak `*.vercel.app` host khi production dùng custom domain. nextUrl
 * giữ đúng host từ request thực tế (satarobo.vn).
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

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Protect /admin/* — redirect unauthenticated or unauthorised users
  if (pathname.startsWith(ADMIN_ONLY_PREFIX)) {
    if (!session?.user) {
      return redirectTo(req, "/login", { callbackUrl: pathname });
    }

    const role = session.user.role || "SALES";

    if (role === "SUPER_ADMIN" || role === "MANAGER") {
      if (pathname === "/admin") {
        return redirectTo(req, "/admin/dashboard");
      }
      return NextResponse.next();
    }

    if (role === "HR") {
      const isAllowed =
        pathname === "/admin" ||
        HR_ALLOWED_ROUTES.some((route) => pathname.startsWith(route));
      if (!isAllowed) {
        return redirectTo(req, "/admin/dashboard", { error: "unauthorized" });
      }
      if (pathname === "/admin") {
        return redirectTo(req, "/admin/dashboard");
      }
      return NextResponse.next();
    }

    return redirectTo(req, "/", { error: "admin-only" });
  }

  // Redirect already-logged-in users away from /login
  if (pathname === "/login" && session?.user) {
    return redirectTo(req, "/admin/dashboard");
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
