// prisma/seed-orgunit.ts — Seed cây OrgUnit idempotent (ticket A0-01 §3).
// ROOT(SATAROBO) → HO, CS1, CS2 ĐỘC LẬP NGANG HÀNG (Doc 15 OI-1).
// Tái dùng: seedOrgUnits(db) trong seed chính + helper test seedOrg().
import { PrismaClient, type OrgUnitType } from "@prisma/client";

type UnitSpec = {
  code: string;
  type: OrgUnitType;
  name: string;
  address: string | null;
  /** Center cũ (code) để gán centerId — chỉ type CENTER. */
  centerCode: string | null;
};

const ROOT: UnitSpec = {
  code: "SATAROBO",
  type: "ROOT",
  name: "Sata Robo",
  address: null,
  centerCode: null,
};

const UNITS: UnitSpec[] = [
  { code: "HO", type: "HO", name: "Hội sở", address: "114 Hoàng Diệu, Đà Nẵng", centerCode: null },
  { code: "CS1", type: "CENTER", name: "Cơ sở 1", address: "211 Nguyễn Hữu Thọ, Đà Nẵng", centerCode: "CS1" },
  { code: "CS2", type: "CENTER", name: "Cơ sở 2", address: "114 Hoàng Diệu, Đà Nẵng", centerCode: "CS2" },
];

/**
 * Seed ROOT + các đơn vị con. `codes` lọc tập con (mặc định: tất cả HO/CS1/CS2).
 * Idempotent qua upsert theo `code` → chạy nhiều lần không tạo trùng (AC8).
 */
export async function seedOrgUnits(db: PrismaClient, codes?: string[]): Promise<void> {
  const root = await db.orgUnit.upsert({
    where: { code: ROOT.code },
    update: { type: ROOT.type, name: ROOT.name, address: ROOT.address, parentId: null, isActive: true, deletedAt: null },
    create: { code: ROOT.code, type: ROOT.type, name: ROOT.name, address: ROOT.address },
  });

  const wanted = codes
    ? UNITS.filter((u) => codes.map((c) => c.toUpperCase()).includes(u.code))
    : UNITS;

  for (const u of wanted) {
    let centerId: string | null = null;
    if (u.centerCode) {
      const c = await db.center.findFirst({ where: { code: u.centerCode }, select: { id: true } });
      centerId = c?.id ?? null;
    }
    await db.orgUnit.upsert({
      where: { code: u.code },
      update: { type: u.type, name: u.name, address: u.address, parentId: root.id, centerId, isActive: true, deletedAt: null },
      create: { code: u.code, type: u.type, name: u.name, address: u.address, parentId: root.id, centerId },
    });
  }
}

// Chạy trực tiếp: `tsx prisma/seed-orgunit.ts` (không kích hoạt khi được import).
if (process.argv[1]?.includes("seed-orgunit")) {
  const db = new PrismaClient();
  seedOrgUnits(db)
    .then(() => console.log("✅ Seeded OrgUnit (ROOT/HO/CS1/CS2)"))
    .catch((e) => {
      console.error("❌ seedOrgUnits:", e);
      process.exitCode = 1;
    })
    .finally(() => void db.$disconnect());
}
