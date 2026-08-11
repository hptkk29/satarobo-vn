/**
 * Nền Hệ thống P0 · US-01 AC3 — Liệt kê toàn bộ quyền theo module.
 *
 *   pnpm exec tsx scripts/list-permissions.ts                 # từ khai báo tĩnh, KHÔNG cần DB
 *   pnpm exec tsx scripts/list-permissions.ts --db            # đối chiếu thêm bảng PermissionDescriptor
 *   pnpm exec tsx scripts/list-permissions.ts --db --strict   # lệch → exit 1 (dùng cho CI/deploy gate)
 *
 * "Lệch" khi --strict = key khai báo mà DB thiếu, key active thừa trong DB,
 * hoặc key đang khai báo nhưng DB ghi isActive=false (chưa sync lại).
 * Key thừa nhưng isActive=false là trạng thái deactivate hợp lệ — chỉ ghi nhận.
 */
import "./_load-env"; // nạp .env trước khi Prisma đọc DATABASE_URL (chỉ cần khi --db)
import { ALL_MODULE_DECLS, collectDescriptors } from "../lib/permissions/registry";
import type { DescriptorRow } from "../lib/permissions/registry/types";

const WITH_DB = process.argv.includes("--db");
const STRICT = process.argv.includes("--strict");

function fmtSensitive(fields: string[]): string {
  return fields.length > 0 ? fields.join(",") : "—";
}

function printStatic(descriptors: Map<string, DescriptorRow>): void {
  // Gom theo module, giữ thứ tự khai báo.
  const byModule = new Map<string, DescriptorRow[]>();
  for (const row of descriptors.values()) {
    const list = byModule.get(row.module) ?? [];
    list.push(row);
    byModule.set(row.module, list);
  }

  const keyW = Math.max(3, ...[...descriptors.keys()].map((k) => k.length));
  const actW = Math.max(6, ...[...descriptors.values()].map((r) => r.action.length));

  for (const [module, rows] of byModule) {
    console.log(`\n■ module: ${module} — ${rows.length} quyền`);
    console.log(`  ${"key".padEnd(keyW)}  ${"action".padEnd(actW)}  scopable  sensitiveFields`);
    for (const r of rows) {
      console.log(
        `  ${r.key.padEnd(keyW)}  ${r.action.padEnd(actW)}  ${(r.scopable ? "yes" : "no").padEnd(8)}  ${fmtSensitive(r.sensitiveFields)}`,
      );
    }
  }
  console.log(`\nTổng: ${byModule.size} module · ${descriptors.size} quyền.`);
}

/** Đối chiếu khai báo tĩnh ↔ bảng PermissionDescriptor. Trả về true nếu LỆCH. */
async function compareWithDb(descriptors: Map<string, DescriptorRow>): Promise<boolean> {
  // Script chạy ngoài Next → dùng PrismaClient trực tiếp (như scripts/cleanup-zztest.ts).
  // Ưu tiên DIRECT_URL (session pooler :5432): findMany trần qua transaction pooler
  // :6543 dính quirk `prepared statement "s0" already exists` (42P05) — đã ăn thật
  // 09/08 khi nghiệm thu US-01. Không có DIRECT_URL thì append pgbouncer=true như
  // lib/db.ts phòng thủ.
  const { PrismaClient } = await import("@prisma/client");
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  const url =
    raw && !process.env.DIRECT_URL && !raw.includes("pgbouncer=")
      ? `${raw}${raw.includes("?") ? "&" : "?"}pgbouncer=true`
      : raw;
  const db = new PrismaClient(url ? { datasourceUrl: url } : undefined);
  try {
    const rows = await db.permissionDescriptor.findMany({
      select: { key: true, isActive: true },
      orderBy: { key: "asc" },
    });
    const dbByKey = new Map(rows.map((r) => [r.key, r]));

    const missing: string[] = []; // khai báo có, DB không có
    const inactive: string[] = []; // khai báo có, DB isActive=false
    for (const key of descriptors.keys()) {
      const row = dbByKey.get(key);
      if (!row) missing.push(key);
      else if (!row.isActive) inactive.push(key);
    }
    const extraActive: string[] = []; // DB active nhưng không còn trong khai báo
    const extraInactive: string[] = []; // DB inactive + không khai báo = deactivate hợp lệ
    for (const r of rows) {
      if (descriptors.has(r.key)) continue;
      (r.isActive ? extraActive : extraInactive).push(r.key);
    }

    console.log(`\n── Đối chiếu DB (${rows.length} row PermissionDescriptor) ──`);
    const printList = (label: string, list: string[]) => {
      console.log(`  ${label}: ${list.length}${list.length ? ` → ${list.join(", ")}` : ""}`);
    };
    printList("Thiếu trong DB (khai báo có, DB không)", missing);
    printList("Khai báo có nhưng DB isActive=false", inactive);
    printList("Thừa trong DB & đang ACTIVE", extraActive);
    printList("Thừa trong DB nhưng đã deactivate (hợp lệ)", extraInactive);

    const drifted = missing.length > 0 || inactive.length > 0 || extraActive.length > 0;
    console.log(drifted ? "\n⚠️  LỆCH giữa khai báo tĩnh và DB — chạy lại sync registry." : "\n✅ DB khớp khai báo tĩnh.");
    return drifted;
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const descriptors = collectDescriptors(ALL_MODULE_DECLS); // throw nếu key trùng (AC2)
  printStatic(descriptors);

  if (!WITH_DB) return;
  const drifted = await compareWithDb(descriptors);
  if (drifted && STRICT) process.exit(1);
}

main().catch((e) => {
  console.error("❌ Lỗi:", e);
  process.exit(1);
});
