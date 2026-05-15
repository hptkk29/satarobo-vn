import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaDatabaseUrl: string | undefined;
};

function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) return undefined;

  try {
    const url = new URL(process.env.DATABASE_URL);
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    // Supabase transaction pooler chấp nhận nhiều connection cùng lúc;
    // mặc định Prisma + pgbouncer=true có thể về 1 → build song song timeout.
    // Override defaults nếu user chưa set trong DATABASE_URL.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }
    return url.toString();
  } catch {
    return process.env.DATABASE_URL;
  }
}

const databaseUrl = getDatabaseUrl();

if (
  process.env.NODE_ENV !== "production" &&
  globalForPrisma.prisma &&
  globalForPrisma.prismaDatabaseUrl !== databaseUrl
) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: databaseUrl
      ? {
          db: {
            url: databaseUrl,
          },
        }
      : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaDatabaseUrl = databaseUrl;
}
