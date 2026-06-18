import { PrismaClient } from "@prisma/client";
import { SOFT_DELETE_MODELS, injectSoftDelete } from "@/lib/soft-delete";

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

const basePrisma =
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
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.prismaDatabaseUrl = databaseUrl;
}

// FIX-C3 (B1) — soft-delete filter ở TẦNG base: MỌI read (db trần + scopedDb, vì
// scopedDb = db.$extends) đều ẩn row đã xóa của SOFT_DELETE_MODELS. Override bằng
// cách truyền `deletedAt` trong where (vd đọc "Thùng rách"). Chỉ thêm query hook
// (không đổi surface) → cast về PrismaClient để mọi call-site type cũ không vỡ.
// ⚠️ Nested include/_count KHÔNG được hook → chỗ đọc lồng phải tự thêm deletedAt.
export const db = basePrisma.$extends({
  query: {
    $allModels: {
      findMany({ model, args, query }) {
        return query(injectSoftDelete(model, args));
      },
      findFirst({ model, args, query }) {
        return query(injectSoftDelete(model, args));
      },
      findFirstOrThrow({ model, args, query }) {
        return query(injectSoftDelete(model, args));
      },
      count({ model, args, query }) {
        return query(injectSoftDelete(model, args));
      },
      aggregate({ model, args, query }) {
        return query(injectSoftDelete(model, args));
      },
      groupBy({ model, args, query }) {
        return query(injectSoftDelete(model, args));
      },
      async findUnique({ model, args, query }) {
        // findUnique chỉ nhận where unique → lọc hậu kỳ: row đã xóa → trả null.
        const r = (await query(args)) as { deletedAt?: Date | null } | null;
        if (r && SOFT_DELETE_MODELS.has(model) && r.deletedAt != null) return null;
        return r;
      },
    },
  },
}) as unknown as PrismaClient;
