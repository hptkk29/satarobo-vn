import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validators/auth";

type SessionGrant = { action: string; grant: "ALLOW" | "DENY" };

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      centerId: string | null;
      grants: SessionGrant[];
      tokenVersion: number;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
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
        token.role = user.role ?? "SALES";
        token.centerId = user.centerId ?? null;
        token.grants = user.grants ?? [];
        token.tokenVersion = user.tokenVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? (token.sub as string);
        session.user.role = (token.role as string) ?? "SALES";
        session.user.centerId = (token.centerId as string | null) ?? null;
        session.user.grants = (token.grants as SessionGrant[]) ?? [];
        session.user.tokenVersion = (token.tokenVersion as number) ?? 0;
      }
      return session;
    },
  },
});
