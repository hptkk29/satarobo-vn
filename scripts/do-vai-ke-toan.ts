/**
 * scripts/do-vai-ke-toan.ts — ĐO hiện trạng vai KẾ TOÁN trên prod. CHỈ ĐỌC.
 *
 * Không có chế độ ghi, không tham số nào bật ghi. Toàn bộ là `findMany`/`count`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — việc 2, chủ dự án yêu cầu BIẾT TRƯỚC khi ghi
 *
 * Chốt: chỉ MỘT người mang vai kế toán — chị Nguyễn Thị Bích Huệ (SR.NV.002), vai
 * `HO_ACCOUNTANT` neo tại Hội sở, vì chị làm kế toán cho cả ba pháp nhân. Không ai mang
 * `CENTER_ACCOUNTANT`.
 *
 * Hai câu phải trả lời TRƯỚC khi dựng script neo vai:
 *   1. Ai đang mang `HO_ACCOUNTANT` trên prod? Nếu không phải chị Huệ ⇒ vai gán nhầm,
 *      báo chủ dự án quyết gỡ hay giữ. KHÔNG tự gỡ.
 *   2. Chị Huệ hiện đang mang vai gì?
 *
 * ⚠️ Đo `UserOrgRole` chứ KHÔNG đọc màn `/admin/users/[id]/permissions` — màn đó vẽ RBAC
 * v1 (ghi nhận trong sổ nhớ dự án). Nguồn quyền thật là `UserOrgRole` × `RoleDef`.
 *
 * ⚠️ Liệt kê MỌI `status`, không lọc `ACTIVE`. Một dòng `REVOKED`/hết hạn vẫn là dấu vết
 * cần nhìn: nó nói ai TỪNG giữ vai, và nó chặn đường `@@id([userId, orgUnitId, roleId])`
 * khi tạo lại — tưởng "chưa có" rồi `create` là dính lỗi khoá trùng.
 *
 * Đo kèm `LegalEntity` (ghi nhận của chủ dự án: ba pháp nhân riêng, bảng lương về sau nhiều
 * khả năng tách theo PHÁP NHÂN chứ không chỉ theo cơ sở).
 *
 * CHẠY: pnpm tsx scripts/do-vai-ke-toan.ts
 */
// `_load-env` phải chạy TRƯỚC `_script-db` — Prisma đọc DATABASE_URL ngay lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";

const db = scriptDb();

/** Mã nhân sự của người DUY NHẤT được chốt mang vai kế toán. */
const MA_NV_KE_TOAN = "SR.NV.002";

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(88));
  console.log(s);
  console.log("═".repeat(88));
}
function muc(s: string) {
  console.log("");
  console.log(`── ${s} ${"─".repeat(Math.max(0, 82 - s.length))}`);
}

// ⚠️ `UserOrgRole` KHÔNG có quan hệ `orgUnit` — chỉ có `orgUnitId` trần và quan hệ `role`,
// `user`. Đơn vị phải tra riêng ở `docTenDonVi()`.
//
// Bẫy đi kèm, đáng ghi: `tsc` CHO QUA bản sai. Tách `select` ra một hằng `as const` là nó
// rời khỏi phép kiểm kiểu của Prisma — lỗi chỉ nổ lúc chạy. Viết `select` THẲNG trong lời
// gọi thì `tsc` bắt được ngay. Đây là họ hàng của luật 7: kiểu chỉ bảo vệ được chỗ nào nó
// còn nhìn thấy.
const CHON_VAI = {
  userId: true,
  orgUnitId: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  role: { select: { code: true, name: true } },
} as const;

/** `orgUnitId` → mã đơn vị. Tra một lượt cho cả danh sách. */
async function docTenDonVi(ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const ds = await db.orgUnit.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, code: true },
  });
  return new Map(ds.map((o) => [o.id, o.code]));
}

/** In một dòng phân vai + tên người giữ. */
async function inVai(
  ds: {
    userId: string;
    orgUnitId: string;
    status: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    role: { code: string; name: string };
  }[],
) {
  if (!ds.length) {
    console.log("  (không dòng nào)");
    return;
  }
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(ds.map((x) => x.userId))] } },
    select: { id: true, name: true, email: true, employee: { select: { employeeCode: true, fullName: true, status: true } } },
  });
  const theoId = new Map(users.map((u) => [u.id, u]));
  const donVi = await docTenDonVi(ds.map((x) => x.orgUnitId));
  for (const d of ds) {
    const u = theoId.get(d.userId);
    const nv = u?.employee;
    console.log(
      `  ${(nv?.employeeCode ?? "(không nối nhân sự)").padEnd(14)}` +
        `${(nv?.fullName ?? u?.name ?? "(không rõ tên)").slice(0, 26).padEnd(28)}` +
        `${d.role.code.padEnd(20)}@ ${(donVi.get(d.orgUnitId) ?? d.orgUnitId).padEnd(10)}` +
        `${d.status.padEnd(10)}` +
        `từ ${d.effectiveFrom.toISOString().slice(0, 10)}` +
        `${d.effectiveTo ? ` đến ${d.effectiveTo.toISOString().slice(0, 10)}` : " (vô thời hạn)"}`,
    );
    console.log(`      email=${u?.email ?? "(không có)"} · tình trạng nhân sự=${nv?.status ?? "—"}`);
  }
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(db), false);
  tieu("ĐO VAI KẾ TOÁN TRÊN PROD (chỉ đọc) — hai câu phải trả lời trước khi ghi");

  // ── 1. Ai đang mang HO_ACCOUNTANT ──────────────────────────────────────────
  muc("1. Ai đang mang HO_ACCOUNTANT (MỌI status, không lọc ACTIVE)");
  const ho = await db.userOrgRole.findMany({
    where: { role: { code: "HO_ACCOUNTANT" } },
    select: CHON_VAI,
    orderBy: { effectiveFrom: "asc" },
  });
  await inVai(ho);
  console.log(`  → tổng ${ho.length} dòng · ACTIVE: ${ho.filter((x) => x.status === "ACTIVE").length}`);

  // ── 2. Ai đang mang CENTER_ACCOUNTANT ──────────────────────────────────────
  // Chốt: KHÔNG ai được mang vai này. Đo để biết có phải gỡ ai không.
  muc("2. Ai đang mang CENTER_ACCOUNTANT (chốt: KHÔNG ai được mang)");
  const cs = await db.userOrgRole.findMany({
    where: { role: { code: "CENTER_ACCOUNTANT" } },
    select: CHON_VAI,
    orderBy: { effectiveFrom: "asc" },
  });
  await inVai(cs);
  console.log(`  → tổng ${cs.length} dòng · ACTIVE: ${cs.filter((x) => x.status === "ACTIVE").length}`);

  // ── 3. Chị Huệ đang mang vai gì ────────────────────────────────────────────
  muc(`3. ${MA_NV_KE_TOAN} hiện đang mang vai gì`);
  const nv = await db.employee.findUnique({
    where: { employeeCode: MA_NV_KE_TOAN },
    select: {
      id: true, employeeCode: true, fullName: true, email: true, status: true,
      centerId: true, orgUnitId: true,
      center: { select: { code: true, name: true } },
      userAccount: { select: { id: true, email: true, name: true, role: true, roles: true, centerId: true } },
    },
  });
  if (!nv) {
    console.log(`  ⚠️ KHÔNG tìm thấy nhân sự mã ${MA_NV_KE_TOAN}. Kiểm lại mã trước khi làm tiếp.`);
  } else {
    console.log(`  nhân sự : ${nv.fullName} · ${nv.employeeCode} · tình trạng ${nv.status}`);
    console.log(`  email   : ${nv.email ?? "(không có)"}`);
    console.log(`  cơ sở   : ${nv.center?.code ?? "(không gán)"} · orgUnitId=${nv.orgUnitId ?? "null"}`);
    if (!nv.userAccount) {
      console.log("  ⚠️ CHƯA CÓ TÀI KHOẢN. Không neo vai được — vai neo trên `User`, không phải `Employee`.");
    } else {
      console.log(`  tài khoản: ${nv.userAccount.email} · role(v1)=${nv.userAccount.role} · roles(v1)=[${nv.userAccount.roles.join(", ")}]`);
      const vai = await db.userOrgRole.findMany({
        where: { userId: nv.userAccount.id },
        select: CHON_VAI,
        orderBy: { effectiveFrom: "asc" },
      });
      console.log(`  vai v2 (UserOrgRole) — ${vai.length} dòng:`);
      await inVai(vai);
    }
  }

  // ── 4. Hội sở neo ở đâu ────────────────────────────────────────────────────
  muc("4. Đơn vị Hội sở — nơi sẽ neo vai");
  const hoUnit = await db.orgUnit.findUnique({
    where: { code: "HO" },
    select: { id: true, code: true, name: true, type: true, path: true, legalEntityId: true },
  });
  console.log(hoUnit ? `  ${hoUnit.code} · ${hoUnit.name} · type=${hoUnit.type} · path=${hoUnit.path}` : "  ⚠️ KHÔNG có OrgUnit code=HO");

  // ── 5. LegalEntity — ghi nhận cho về sau ───────────────────────────────────
  // Chủ dự án: ba pháp nhân riêng (Hội sở công ty tổng, CS1 và CS2 hai công ty con).
  // Bảng lương về sau nhiều khả năng phải tách theo PHÁP NHÂN chứ không chỉ theo cơ sở.
  muc("5. LegalEntity — hiện đang được dùng thế nào");
  const pn = await db.legalEntity.findMany({
    where: { deletedAt: null },
    select: {
      id: true, taxCode: true, legalName: true, isPrimary: true, isActive: true,
      orgUnits: { select: { code: true, name: true, type: true } },
    },
    orderBy: { legalName: "asc" },
  });
  console.log(`  tổng ${pn.length} pháp nhân (chưa xoá mềm)`);
  for (const p of pn) {
    console.log(`    ${p.taxCode.padEnd(16)}${p.legalName.slice(0, 40).padEnd(42)}gốc=${p.isPrimary} bật=${p.isActive}`);
    console.log(`      đơn vị trỏ tới: ${p.orgUnits.length ? p.orgUnits.map((o) => o.code).join(", ") : "(KHÔNG đơn vị nào)"}`);
  }
  const khongPhapNhan = await db.orgUnit.findMany({
    where: { legalEntityId: null },
    select: { code: true, type: true },
    orderBy: { code: "asc" },
  });
  console.log(`  đơn vị CHƯA gán pháp nhân: ${khongPhapNhan.length ? khongPhapNhan.map((o) => `${o.code}(${o.type})`).join(", ") : "(không có)"}`);

  console.log("");
  console.log("Toàn bộ phép đo trên là SELECT. Không dòng nào bị ghi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
