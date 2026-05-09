import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      centerId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/types" {
  interface User {
    role?: string;
    centerId?: string | null;
  }
}
