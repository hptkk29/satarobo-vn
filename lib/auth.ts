import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validators/auth";

type SessionGrant = { action: string; grant: "ALLOW" | "DENY" };

// Phase T0.1 — map role cũ (JWT phát hành trước khi rename) sang tên mới.
function migrateLegacyRole(role: string): string {
  if (role === "MANAGER") return "CENTER_MANAGER";
  if (role === "SALES") return "SALES_CSM";
  return role;
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
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

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
          },
        });

        if (!user || !user.password || user.deletedAt || !user.isActive) {
          return null;
        }

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
