// prisma/patch-rbac-staff.ts — K1 (go-live 26/07): gán UserOrgRole cho TÀI KHOẢN THẬT.
//
// Bối cảnh: hệ chạy LAI auth cũ (User.role/roles[]) + mới (resolveActor/UserOrgRole).
// Nhân sự thật (GV/Sale/QL/Kế toán/Đào tạo/Marketing) CHƯA có UserOrgRole →
// resolveActor() ra scope rỗng → vỡ dropdown cơ sở / danh sách lớp (RC-A).
// Script này map role legacy → RoleDef mới + OrgUnit đúng cơ sở:
//   SUPER_ADMIN → SUPER_ADMIN @ HO
//   CENTER_MANAGER → CENTER_MANAGER @ cơ sở · SALES_CSM → CENTER_SALES_CSM @ cơ sở
//   TEACHER → TEACHER @ cơ sở
//   ACCOUNTANT → có centerId ? CENTER_ACCOUNTANT @ cơ sở : HO_ACCOUNTANT @ HO
//   MARKETING → HO_MARKETING @ HO · HR → HO_HR @ HO (chức năng Hội sở, cross-center)
//   TRAINING → TRAINING @ HO (RoleDef upsert tối thiểu, CHƯA có perm — H5 bổ sung)
//   PARENT → BỎ QUA (portal đi theo ownership, không cần UserOrgRole)
// Cơ sở suy từ User.centerId; fallback đuôi email `.cs1@`/`.cs2@`. Role cơ sở mà
// không suy được cơ sở → SKIP + cảnh báo (không đoán bừa HO).
//
// AN TOÀN PROD: idempotent (upsert theo khoá composite), KHÔNG xoá/không reset
// RolePermission, KHÔNG sửa User.centerId.
//
//   pnpm exec tsx prisma/patch-rbac-staff.ts            # DRY-RUN (mặc định, không ghi)
//   pnpm exec tsx prisma/patch-rbac-staff.ts --apply    # thực thi
//
// Dry-run KHÔNG gọi seedOrgUnits / upsert RoleDef (cả hai đều ghi) — chỉ đọc và in
// kế hoạch. Prod đã có cây OrgUnit (A0) + 14 RoleDef (seed-prod-roles) nên đọc đủ.
import { PrismaClient } from "@prisma/client";
import { seedOrgUnits } from "./seed-orgunit";

// DIRECT_URL (session pooler :5432) — tránh lỗi prepared statement trên transaction pooler.
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

type Mapping = { roleCode: string; org: "HO" | "CENTER" | "CENTER_OR_HO" };
const LEGACY_TO_ROLEDEF: Record<string, Mapping> = {
  SUPER_ADMIN: { roleCode: "SUPER_ADMIN", org: "HO" },
  CENTER_MANAGER: { roleCode: "CENTER_MANAGER", org: "CENTER" },
  SALES_CSM: { roleCode: "CENTER_SALES_CSM", org: "CENTER" },
  TEACHER: { roleCode: "TEACHER", org: "CENTER" },
  ACCOUNTANT: { roleCode: "HO_ACCOUNTANT", org: "CENTER_OR_HO" },
  MARKETING: { roleCode: "HO_MARKETING", org: "HO" },
  // Sửa 06/07/2026 (Kiệt duyệt Phương án A, addendum HR): trước đây hard-code "HO"
  // — mọi user role HR (kể cả thực tập sinh tại 1 cơ sở) đều bị gán HO_HR@HO toàn
  // hệ thống. Đổi sang CENTER_OR_HO giống ACCOUNTANT: có centerId → CENTER_HR tại
  // cơ sở đó; không suy được cơ sở → HO_HR@HO (fallback an toàn).
  HR: { roleCode: "HO_HR", org: "CENTER_OR_HO" },
  TRAINING: { roleCode: "TRAINING", org: "HO" },
};

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`🔧 K1 patch: gán UserOrgRole cho tài khoản thật… [${APPLY ? "APPLY" : "DRY-RUN"}]`);

  if (APPLY) {
    await seedOrgUnits(db);

    // RoleDef TRAINING chưa có trong seed-roles (11 role) — upsert tối thiểu để
    // Đào tạo có scope HO-level; RolePermission của TRAINING do vé H5 bổ sung.
    await db.roleDef.upsert({
      where: { code: "TRAINING" },
      update: { isActive: true },
      create: { code: "TRAINING", name: "Đào tạo (toàn LMS)" },
    });
  } else {
    console.log("🔎 DRY-RUN — không ghi gì vào DB. Thêm --apply để thực thi.\n");
  }

  const orgs = await db.orgUnit.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, centerId: true },
  });
  const hoOrg = orgs.find((o) => o.code === "HO");
  if (!hoOrg) throw new Error("Thiếu OrgUnit HO — dừng.");
  const orgByCenterId = new Map(orgs.filter((o) => o.centerId).map((o) => [o.centerId as string, o]));
  const orgByCode = new Map(orgs.map((o) => [o.code, o]));

  const roleDefs = await db.roleDef.findMany({ select: { id: true, code: true } });
  const roleByCode = new Map(roleDefs.map((r) => [r.code, r.id]));

  const users = await db.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, email: true, role: true, roles: true, centerId: true },
  });

  let created = 0, kept = 0;
  const skipped: string[] = [];

  for (const u of users) {
    const legacyRoles = [...new Set([u.role, ...(u.roles ?? [])])].filter(Boolean) as string[];
    for (const legacy of legacyRoles) {
      if (legacy === "PARENT") continue;
      const m = LEGACY_TO_ROLEDEF[legacy];
      if (!m) { skipped.push(`${u.email}: role legacy lạ ${legacy}`); continue; }

      // Suy OrgUnit đích.
      let target = null as { id: string; code: string } | null;
      // AUTH-SĐT P5/P6 — suy cơ sở từ ĐUÔI EMAIL là đường dự phòng của thời email
      // còn bắt buộc. Nay `User.email` nullable: `?? ""` giữ script không nổ, nhưng
      // với tài khoản không email thì nhánh này im lặng không suy được gì —
      // `u.centerId` mới là nguồn đáng tin. Cảnh báo bên dưới để lần chạy `--apply`
      // không âm thầm bỏ sót người.
      const emailCenter = /\.cs([12])@/.exec(u.email ?? "")?.[1];
      const centerOrg =
        (u.centerId && orgByCenterId.get(u.centerId)) ||
        (emailCenter ? orgByCode.get(`CS${emailCenter}`) : undefined);
      if (!u.centerId && !u.email && m.org !== "HO") {
        skipped.push(
          `${u.id}: không có centerId lẫn email → không suy được cơ sở (gán UserOrgRole tay)`,
        );
        continue;
      }
      if (m.org === "HO") target = hoOrg;
      else if (m.org === "CENTER") target = centerOrg ?? null;
      else target = centerOrg ?? hoOrg; // CENTER_OR_HO: kế toán không gắn cơ sở → Hội sở

      // Kế toán/Nhân sự gắn cơ sở → role CENTER_* thay vì HO_* (Phương án A, addendum HR 06/07/2026).
      const CENTER_OVERRIDE: Record<string, string> = {
        ACCOUNTANT: "CENTER_ACCOUNTANT",
        HR: "CENTER_HR",
      };
      const roleCode = centerOrg && CENTER_OVERRIDE[legacy] ? CENTER_OVERRIDE[legacy] : m.roleCode;
      const roleId = roleByCode.get(roleCode);
      if (!target) { skipped.push(`${u.email}: ${legacy} cần cơ sở nhưng không suy được`); continue; }
      if (!roleId) { skipped.push(`${u.email}: thiếu RoleDef ${roleCode}`); continue; }

      const existing = await db.userOrgRole.findUnique({
        where: { userId_orgUnitId_roleId: { userId: u.id, orgUnitId: target.id, roleId } },
      });
      // upsert.update kích hoạt lại dòng đã REVOKED/hết hạn → đó cũng là một lượt GHI,
      // dry-run phải nêu ra (đừng để nó ẩn dưới nhãn "giữ nguyên").
      const willReactivate = !!existing && (existing.status !== "ACTIVE" || existing.effectiveTo !== null);
      if (existing && !willReactivate) { kept++; continue; }

      const label = willReactivate ? `${roleCode} @ ${target.code} (KÍCH HOẠT LẠI)` : `${roleCode} @ ${target.code}`;
      if (!APPLY) {
        created++;
        console.log(`  [dry] ${u.email} → ${label}`);
        continue;
      }
      await db.userOrgRole.upsert({
        where: { userId_orgUnitId_roleId: { userId: u.id, orgUnitId: target.id, roleId } },
        update: { status: "ACTIVE", effectiveTo: null },
        create: {
          userId: u.id, orgUnitId: target.id, roleId, status: "ACTIVE",
          grantedById: u.id, // nguồn cấp = script K1 (như tiền lệ patch-rbac-admins)
        },
      });
      created++;
      console.log(`  ✓ ${u.email} → ${label}`);
    }
  }

  console.log(
    APPLY
      ? `✅ Tạo mới ${created} · giữ nguyên ${kept} UserOrgRole.`
      : `🔎 DRY-RUN: sẽ ghi ${created} · giữ nguyên ${kept} UserOrgRole. Chạy lại với --apply để thực thi.`,
  );
  if (skipped.length) {
    console.warn("⚠️  Bỏ qua (cần người quyết):");
    for (const s of skipped) console.warn(`  - ${s}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ patch-rbac-staff thất bại:", e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
