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
