import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validators/auth";
import { rateLimit } from "@/lib/rate-limit";

type SessionGrant = { action: string; grant: "ALLOW" | "DENY" };

/**
 * F2 (Q41) — SSO cookie đa subdomain. Kill-switch: chỉ bật khi env
 * `AUTH_COOKIE_DOMAIN` có giá trị (VD ".satarobo.vn"). MẶC ĐỊNH không set →
 * cookie session host-only như hiện tại (KHÔNG SSO, KHÔNG force-logout) → an
 * toàn để merge trong tuần flip RBAC / UAT mà không đổi behavior.
 *
 * ⚠️ CHỈ set env này SAU khi (a) flip RBAC ổn định và (b) đã tách
 * `sale.satarobo.vn` khỏi zone `.satarobo.vn` (câu 3 Q41) — nếu không, cookie
 * session lộ sang host tĩnh công khai. Khi bật, cookie ĐỔI TÊN (`__Secure-sr.*`)
 * nên mọi user re-login 1 lần (force-logout chủ đích — câu 2 Q41).
 */
const authCookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

// Phase T0.1 — map role cũ (JWT phát hành trước khi rename) sang tên mới.
function migrateLegacyRole(role: string): string {
  if (role === "MANAGER") return "CENTER_MANAGER";
  if (role === "SALES") return "SALES_CSM";
  return role;
}

// SEC-H01 — IP client cho rate-limit login (Vercel để IP thật ở x-forwarded-for).
function getClientIp(request: Request | undefined): string {
  const xff = request?.headers?.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request?.headers?.get("x-real-ip") ?? "unknown";
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      roles: string[]; // Đợt 3B — tất cả vai trò (union quyền)
      centerId: string | null;
      grants: SessionGrant[];
      tokenVersion: number;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
    roles?: string[];
    centerId?: string | null;
    grants?: SessionGrant[];
    tokenVersion?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  // Trust the actual request Host header thay vì canonicalize sang
  // NEXTAUTH_URL/VERCEL_URL. Cần thiết khi production dùng custom domain
  // (satarobo.vn) trên Vercel — không thì redirect leak sang
  // satarobo-vn.vercel.app.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  // F2 (Q41) — chỉ ghi đè cookie sessionToken khi bật SSO đa subdomain qua env.
  // Không bật (mặc định) → NextAuth tự dùng cookie host-only mặc định.
  ...(authCookieDomain
    ? {
        cookies: {
          sessionToken: {
            // Đổi tên (khác `authjs.session-token` mặc định) để không đọc nhầm
            // cookie host-only cũ → ép re-login sạch 1 lần khi bật SSO.
            name: "__Secure-sr.session-token",
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: true,
              domain: authCookieDomain,
            },
          },
        },
      }
    : {}),
  providers: [
    Credentials({
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // SEC-H01: chống brute-force / credential-stuffing — rate-limit theo IP + email.
        // rateLimit() fail-soft (Upstash → memory khi lỗi) nên KHÔNG khóa login hàng loạt
        // khi Redis sự cố. Break-glass: đặt env LOGIN_RATELIMIT_DISABLED=1 để tắt tạm.
        if (process.env.LOGIN_RATELIMIT_DISABLED !== "1") {
          const ip = getClientIp(request);
          const email = parsed.data.email.toLowerCase();
          const [byIp, byEmail] = await Promise.all([
            rateLimit({ key: `login:ip:${ip}`, max: 10, windowMs: 60_000 }),
            rateLimit({ key: `login:email:${email}`, max: 5, windowMs: 60_000 }),
          ]);
          if (!byIp.success || !byEmail.success) return null;
        }

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            roles: true,
            centerId: true,
            isActive: true,
            deletedAt: true,
            accountStatus: true,
          },
        });

        if (!user || !user.password || user.deletedAt || !user.isActive) {
          return null;
        }
        // AUTH-SĐT P0 §3.6 — chặn tường minh theo accountStatus.
        // PENDING_ACTIVATION/DISABLED trước đây bị chặn TÌNH CỜ vì các tài khoản
        // đó có `password = null`. Hàng rào ấy biến mất ngay khi có bất kỳ đường
        // đăng nhập nào không dựa vào mật khẩu, hoặc khi ai đó đặt mật khẩu cho
        // một tài khoản chưa kích hoạt.
        if (user.accountStatus !== "ACTIVE") return null;

        const valid = await bcrypt.compare(parsed.data.password, user.password);
        if (!valid) return null;

        // Phase 5.3.0: update lastLoginAt + load per-user grants + fresh
        // tokenVersion in parallel để giảm login latency.
        const [, grants, fresh] = await Promise.all([
          db.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          }),
          db.userPermissionGrant.findMany({
            where: { userId: user.id },
            select: { action: true, grant: true },
          }),
          db.user.findUnique({
            where: { id: user.id },
            select: { tokenVersion: true },
          }),
        ]);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          // Đợt 3B — đảm bảo roles luôn chứa vai trò chính (back-compat user cũ).
          roles: user.roles.length > 0 ? user.roles : [user.role],
          centerId: user.centerId,
          grants,
          tokenVersion: fresh?.tokenVersion ?? 0,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Khi user mới login (authorize trả user), copy fields vào token.
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "SALES_CSM";
        token.roles = user.roles ?? (user.role ? [user.role] : []);
        token.centerId = user.centerId ?? null;
        token.grants = user.grants ?? [];
        token.tokenVersion = user.tokenVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? (token.sub as string);
        // Phase T0.1 — compat shim: JWT cũ (trước rename) còn role MANAGER/SALES.
        // Map sang tên mới để staff đang đăng nhập không mất quyền cho tới khi
        // token hết hạn / re-login. Có thể bỏ shim sau 1-2 tuần.
        session.user.role = migrateLegacyRole(
          (token.role as string) ?? "SALES_CSM",
        );
        // Đợt 3B — roles (union), map legacy + đảm bảo chứa vai trò chính.
        // Token cũ (trước 3B) chưa có roles → fallback [role]. User cần re-login
        // để token mang roles đầy đủ khi được gán thêm vai trò.
        const rawRoles = (token.roles as string[] | undefined) ?? [];
        const mappedRoles = rawRoles.map(migrateLegacyRole);
        const withPrimary = mappedRoles.includes(session.user.role)
          ? mappedRoles
          : [session.user.role, ...mappedRoles];
        session.user.roles = withPrimary.length > 0 ? withPrimary : [session.user.role];
        session.user.centerId = (token.centerId as string | null) ?? null;
        session.user.grants = (token.grants as SessionGrant[]) ?? [];
        session.user.tokenVersion = (token.tokenVersion as number) ?? 0;
      }
      return session;
    },
  },
});
