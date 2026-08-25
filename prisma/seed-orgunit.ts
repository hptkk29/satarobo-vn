// prisma/seed-orgunit.ts — Seed cây OrgUnit idempotent (ticket A0-01 §3; đổi hình ở P1 · US-05).
//
// HÌNH CÂY (chủ dự án chốt 11/08/2026 theo BA 08/08 §1.1 — README bàn giao §1 "BA thắng"):
//
//   HO (gốc, depth 0)                       path "/ho/"
//    └── DANANG (REGION)                    path "/ho/danang/"
//         ├── CS1 (CENTER, OWNED)           path "/ho/danang/cs1/"
//         └── CS2 (CENTER, OWNED)           path "/ho/danang/cs2/"
//
// VÙNG THỨ HAI — CHỈ DỰNG KHI ĐƯỢC XIN (khu vực A · A-01, xem OPTIONAL_REGIONS):
//
//    └── HUE (REGION)                       path "/ho/hue/"
//         └── CS3 (CENTER, OWNED)           path "/ho/hue/cs3/"
//
// Vì sao phải có: PRD `docs/prd/A-nen-tang.md` §6.1 điểm 6 ghi "KHÁC VÙNG là đường CHƯA AI
// ĐI — seed chỉ có đúng một REGION (DANANG)". Bất biến L-A1 (`docs/plan/test-coverage.md`)
// đòi nghiệm thu A-01 bằng một QLCS giữ 2 cơ sở **khác vùng**, nên dữ liệu test phải có
// vùng thứ hai. Vì sao **không** dựng mặc định: `pnpm db:seed` chạy trên DB dev — mà DB dev
// DÙNG CHUNG với test.satarobo.vn (CLAUDE.md) — nên dựng mặc định là đẻ một cơ sở giả vào
// môi trường nghiệm thu của người thật. Xin bằng `seedOrgUnits(db, [... , "CS3"])`.
//
// KHÁC hình cũ hai điểm, cả hai đều có chủ đích:
//  1. KHÔNG còn node ROOT "SATAROBO". Trước đây ROOT là gốc kỹ thuật và HO/CS1/CS2 nằm
//     ngang hàng dưới nó (Doc 15 OI-1). Bản BA thắng nên HO là gốc thật. Node SATAROBO
//     trên DB ĐANG CHẠY không bị migration đụng tới — nó được dời/đóng bằng
//     `scripts/nen-p1-reshape-org-tree.ts` (dry-run mặc định, người vận hành chạy tay).
//  2. OrgUnit("HO").centerId = Center("HO") = "hoi-so". Trước P1 luật cấm HO mang centerId,
//     nên Center "hoi-so" MỒ CÔI: `orgUnitIdForCenter('hoi-so')` trả null ⇒ mọi bản ghi
//     của Hội sở không bao giờ nhận orgUnitId, và tới P4 (lật scope sang orgUnitId) thì
//     biến mất sạch. Đây là bịt lỗ đó tại gốc.
import { PrismaClient, type OrgUnitType } from "@prisma/client";
import { childPath } from "../lib/org/path";

type UnitSpec = {
  code: string;
  type: OrgUnitType;
  name: string;
  address: string | null;
  /** Center cũ (code) để gán centerId. HO cũng có — xem ghi chú đầu file. */
  centerCode: string | null;
  /** code của đơn vị cha; null = gốc. */
  parentCode: string | null;
};

/** Xương sống LUÔN được dựng, kể cả khi `codes` chỉ xin một cơ sở — cơ sở phải có tổ tiên. */
const SPINE: UnitSpec[] = [
  {
    code: "HO",
    type: "HO",
    name: "Hội sở",
    address: "114 Hoàng Diệu, Đà Nẵng",
    // ⚠️ centerCode: null CÓ CHỦ ĐÍCH. Center("hoi-so") là bản ghi MỒ CÔI đã biết — gắn nó
    // vào đây làm rò quyền qua màn nhân sự (xem ghi chú dài ở validateCenterId).
    // Việc bịt mồ côi thuộc US-07, bằng cầu ánh xạ tường minh.
    centerCode: null,
    parentCode: null,
  },
  {
    code: "DANANG",
    type: "REGION",
    name: "Khối Đà Nẵng",
    address: null,
    centerCode: null,
    parentCode: "HO",
  },
];

const CENTERS: UnitSpec[] = [
  {
    code: "CS1",
    type: "CENTER",
    name: "Cơ sở 1",
    address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
    centerCode: "CS1",
    parentCode: "DANANG",
  },
  {
    code: "CS2",
    type: "CENTER",
    name: "Cơ sở 2",
    address: "114 Hoàng Diệu, Đà Nẵng",
    centerCode: "CS2",
    parentCode: "DANANG",
  },
];

/**
 * Vùng PHỤ — không nằm trong xương sống, chỉ dựng khi `codes` gọi tên vùng, hoặc khi
 * `codes` xin một cơ sở có cha là vùng đó (xem `seedOrgUnits`).
 *
 * ⚠️ ĐỪNG dời mấy dòng này lên `SPINE` cho "gọn". SPINE luôn được dựng, kể cả với
 * `seedOrg(["HO","CS1"])`, nên dời lên là đổi số đơn vị của ~30 spec đang chạy
 * (vd `tests/e2e/a0/orgunit.spec.ts:62` chốt cứng `orgUnit.count() === 4`) và đẻ thêm
 * một vùng rỗng vào DB dev/test dùng chung.
 */
const OPTIONAL_REGIONS: UnitSpec[] = [
  {
    code: "HUE",
    type: "REGION",
    name: "Khối Huế",
    address: null,
    centerCode: null,
    parentCode: "HO",
  },
];

/**
 * Cơ sở KHÔNG dựng mặc định — chỉ có khi `codes` gọi đúng tên. Dùng cho kịch bản
 * "một người quản 2 cơ sở khác vùng" (A-01): CS1 thuộc DANANG, CS3 thuộc HUE.
 *
 * ⚠️ BẪY IM LẶNG: OrgUnit CS3 chỉ có tác dụng khi tồn tại bản ghi `Center` mã "CS3".
 * Vòng lặp dưới đọc `db.center.findFirst({ where: { code } })` và gán `centerId = null`
 * nếu không thấy — KHÔNG báo lỗi. Mà `getSubtreeCenterIds` chỉ nhặt node có
 * `type === "CENTER" && n.centerId` (`lib/org/org-tree.ts:68`) ⇒ thiếu Center thì
 * `visibleCenterIds` rỗng và cả kịch bản 2 vùng lặng lẽ vô nghĩa. Fixture test tự tạo
 * Center trước khi gọi (xem `tests/e2e/_helpers/seed-multi-region.ts`).
 */
const OPT_IN_CENTERS: UnitSpec[] = [
  {
    code: "CS3",
    type: "CENTER",
    name: "Cơ sở 3",
    address: "Thành phố Huế",
    centerCode: "CS3",
    parentCode: "HUE",
  },
];

/**
 * US-06 AC2 — pháp nhân GỐC của SataRobo. MST lấy từ `lib/locations.ts` (nguồn đang dùng
 * cho JSON-LD của site public) để không đẻ ra con số thứ hai.
 * Idempotent theo `taxCode`.
 */
export async function seedPrimaryLegalEntity(db: PrismaClient): Promise<string> {
  const taxCode = "0402301783";
  // Hạ cờ mọi pháp nhân gốc KHÁC trước khi upsert — DB có partial unique index
  // `LegalEntity_isPrimary_unique`. Trên DB dev/test (dùng chung với test.satarobo.vn),
  // ai đó tạo pháp nhân gốc khác qua UI là `pnpm db:seed` đỏ ở ngay dòng đầu, kéo theo
  // toàn bộ cây OrgUnit không được seed.
  await db.legalEntity.updateMany({
    where: { isPrimary: true, taxCode: { not: taxCode } },
    data: { isPrimary: false },
  });
  const le = await db.legalEntity.upsert({
    where: { taxCode },
    update: {
      legalName: "Công ty Cổ phần Công nghệ Giáo dục Sata Robo",
      isPrimary: true,
      isActive: true,
      deletedAt: null,
    },
    create: {
      taxCode,
      legalName: "Công ty Cổ phần Công nghệ Giáo dục Sata Robo",
      address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
      isPrimary: true,
    },
    select: { id: true },
  });
  return le.id;
}

/**
 * Seed cây. `codes` lọc CƠ SỞ (mặc định: CS1 + CS2); xương sống HO/DANANG luôn có.
 * Idempotent qua upsert theo `code` → chạy nhiều lần không tạo trùng (AC8).
 * `path`/`depth` tính ngay tại đây, không trông chờ migration backfill — seed chạy trên
 * DB test vốn được TRUNCATE sạch nên không có gì để backfill.
 * Mọi đơn vị gắn về pháp nhân gốc (US-06 AC2) — chưa có franchise thật nên tất cả OWNED.
 *
 * Cơ sở/vùng OPT-IN (A-01): `seedOrgUnits(db, ["HO","CS1","CS2","CS3"])` dựng thêm
 * HUE + CS3. Bỏ "CS3" ra khỏi `codes` ⇒ cây trở về đúng hình cũ, không dư node nào —
 * đó là lý do mọi call-site cũ không phải sửa.
 */
export async function seedOrgUnits(db: PrismaClient, codes?: string[]): Promise<void> {
  const wanted = codes?.map((c) => c.toUpperCase());
  const wantedCenters = wanted
    ? [...CENTERS, ...OPT_IN_CENTERS].filter((u) => wanted.includes(u.code))
    : CENTERS;
  // Vùng phụ chỉ dựng khi có lý do đứng đó: được gọi tên thẳng, HOẶC là cha của một cơ
  // sở đang xin (cơ sở phải có tổ tiên, y như xương sống). Không có con thì một REGION
  // rỗng chẳng chứng minh được gì mà vẫn làm lệch số đếm đơn vị của spec khác.
  const wantedRegions = OPTIONAL_REGIONS.filter(
    (r) => (wanted?.includes(r.code) ?? false) || wantedCenters.some((c) => c.parentCode === r.code),
  );

  // "HO" trong `codes` nghĩa là "cần đơn vị HO" — nó vốn nằm trong xương sống nên không
  // phải lọc gì; giữ chữ ký cũ để 20+ call-site `seedOrg(["HO","CS1","CS2"])` không đổi.
  const legalEntityId = await seedPrimaryLegalEntity(db);
  const idByCode = new Map<string, string>();
  const pathByCode = new Map<string, string>();

  // Thứ tự BẮT BUỘC: xương sống → vùng phụ → cơ sở. `parentId`/`parentPath` đọc từ
  // `idByCode`/`pathByCode` đã điền ở vòng trước, nên cha phải đi trước con.
  for (const u of [...SPINE, ...wantedRegions, ...wantedCenters]) {
    const parentId = u.parentCode ? (idByCode.get(u.parentCode) ?? null) : null;
    const parentPath = u.parentCode ? (pathByCode.get(u.parentCode) ?? null) : null;
    const path = childPath(parentPath, u.code);
    const depth = path.split("/").filter(Boolean).length - 1;

    let centerId: string | null = null;
    if (u.centerCode) {
      const c = await db.center.findFirst({
        where: { code: u.centerCode },
        select: { id: true },
      });
      centerId = c?.id ?? null;
    }

    const common = {
      type: u.type,
      name: u.name,
      address: u.address,
      parentId,
      centerId,
      path,
      depth,
      relationshipType: "OWNED" as const,
      status: "ACTIVE" as const,
      legalEntityId,
      isActive: true,
      deletedAt: null,
    };
    const row = await db.orgUnit.upsert({
      where: { code: u.code },
      update: common,
      create: { code: u.code, ...common },
    });
    idByCode.set(u.code, row.id);
    pathByCode.set(u.code, path);
  }
}

// Chạy trực tiếp: `tsx prisma/seed-orgunit.ts` (không kích hoạt khi được import).
if (process.argv[1]?.includes("seed-orgunit")) {
  const db = new PrismaClient();
  seedOrgUnits(db)
    .then(() => console.log("✅ Seeded OrgUnit (HO → DANANG → CS1/CS2)"))
    .catch((e) => {
      console.error("❌ seedOrgUnits:", e);
      process.exitCode = 1;
    })
    .finally(() => void db.$disconnect());
}
