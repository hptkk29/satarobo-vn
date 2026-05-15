import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

const HR_ALLOWED_ROUTES = ["/admin/nhan-su", "/admin/dashboard"];
const ADMIN_ONLY_PREFIX = "/admin";

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // /admin → /admin/dashboard shortcut
  // Protect /admin/* — redirect unauthenticated or unauthorised users
  if (pathname.startsWith(ADMIN_ONLY_PREFIX)) {
    if (!session?.user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const role = session.user.role || "SALES";

    if (role === "SUPER_ADMIN" || role === "MANAGER") {
      if (pathname === "/admin") {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }

      return NextResponse.next();
    }

    if (role === "HR") {
      const isAllowed =
        pathname === "/admin" ||
        HR_ALLOWED_ROUTES.some((route) => pathname.startsWith(route));
      if (!isAllowed) {
        return NextResponse.redirect(
          new URL("/admin/dashboard?error=unauthorized", req.url),
        );
      }

      if (pathname === "/admin") {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }

      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/?error=admin-only", req.url));
  }

  // Redirect already-logged-in users away from /login
  if (pathname === "/login" && session?.user) {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
