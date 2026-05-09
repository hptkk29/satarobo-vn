import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validators/auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      centerId: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
    centerId?: string | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
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

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          centerId: user.centerId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? "SALES";
        token.centerId = user.centerId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = (token.role as string) ?? "SALES";
      session.user.centerId = (token.centerId as string | null) ?? null;
      return session;
    },
  },
});
