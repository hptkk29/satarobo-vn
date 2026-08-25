/**
 * KHU VỰC A · A-01 — dữ liệu test "QLCS giữ 2 cơ sở KHÁC VÙNG".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ĐỌC TRƯỚC KHI "DỌN DẸP" FILE NÀY
 *
 * Tài khoản `seedPureCenterManagerTwoRegions()` CỐ Ý:
 *   • KHÔNG có `SUPER_ADMIN` (cả `User.role`, `User.roles[]` lẫn `UserOrgRole`);
 *   • KHÔNG có bất kỳ vai nào neo tại `HO`/`ROOT`;
 *   • KHÔNG neo vai ở `REGION` — đúng 2 dòng `UserOrgRole` neo tại 2 `OrgUnit` type
 *     `CENTER`, mà 2 cơ sở đó nằm ở HAI vùng khác nhau (CS1 ∈ DANANG, CS3 ∈ HUE).
 *
 * VÌ SAO, nguyên văn `docs/prd/A-nen-tang.md` §6.9.1(a): người đang giữ 2 cơ sở trên prod
 * vừa là QLCS vừa là `SUPER_ADMIN`. `SUPER_ADMIN` đi vào nhánh `isHoLevel` của
 * `buildActor()` (`lib/auth/actor.ts:252-255`) và thấy MỌI cơ sở bất kể cấu hình đa cơ sở
 * đúng hay sai ⇒ **nghiệm thu A-01 bằng tài khoản đó sẽ LUÔN XANH, kể cả khi A-01 hỏng
 * hoàn toàn**. Đó là nội dung bất biến `L-A13` trong `docs/plan/test-coverage.md:218`.
 *
 * Cùng lý do đó, việc neo vai ở HO/ROOT "cho tiện" cũng bị cấm: chỉ cần MỘT dòng ở HO là
 * `isHoLevel = true` ⇒ `visibleCenterIds` = mọi cơ sở sống (`lib/auth/actor.ts:278-281`),
 * và test lại xanh giả. A-01-3 (`docs/prd/A-nen-tang.md` §5) biến điều này thành yêu cầu.
 *
 * ⇒ Thêm quyền cho tài khoản này để "test chạy được" là làm hỏng đúng thứ nó đang đo.
 * `assertPureCenterManagerTwoRegions()` ở cuối file chốt chặn bằng mã, không bằng lời hứa:
 * nó ném lỗi ngay lúc seed nếu ai đó nới ra. Đừng gỡ nó.
 *
 * Ca ĐỐI CHỨNG bắt buộc đi kèm: `seedSuperAdminControlTwoRegions()` dựng đúng hình dạng
 * tài khoản prod (QLCS 2 cơ sở + `SUPER_ADMIN` tại HO). Spec phải khẳng định tài khoản
 * này thấy CẢ cơ sở thứ ba — để bộ test tự chứng minh vì sao fixture thuần là bắt buộc
 * (nửa sau của L-A13).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * KHÔNG đụng `resetDb()` — mọi hàm ở đây chỉ THÊM (upsert), spec tự gọi `resetDb()` trước.
 */
import { db } from "../../../lib/db";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { ORG_CODES } from "./fixtures";
import { assertTestDb, seedOrg, seedRoles, seedUser } from "./seed";

/** Actor kỹ thuật để gọi service RBAC khi seed (khuôn dùng chung với ~6 spec a0). */
const SEED_ACTOR: RbacActor = { id: "a01-seed-actor", name: "Seed A-01", role: "SUPER_ADMIN" };

/** Email của 2 tài khoản A-01 — đặt tên nói thẳng vai trò để không ai dùng nhầm. */
export const A01_EMAILS = {
  /** QLCS THUẦN 2 cơ sở khác vùng — tài khoản DUY NHẤT được dùng nghiệm thu A-01. */
  pureCenterManager: "a01-qlcs-thuan-2cs@test.satarobo.local",
  /** Ca đối chứng: vừa QLCS 2 cơ sở vừa SUPER_ADMIN (hình dạng tài khoản trên prod). */
  superAdminControl: "a01-qlcs-kiem-superadmin@test.satarobo.local",
} as const;

export type TwoRegionTree = {
  /** `Center.id` theo mã. CS3 là cơ sở thuộc vùng HUE. */
  centerIds: Record<"HO" | "CS1" | "CS2" | "CS3", string>;
  /** `OrgUnit.id` theo mã. */
  orgUnitIds: Record<"HO" | "DANANG" | "HUE" | "CS1" | "CS2" | "CS3", string>;
};

type CenterSpec = { id: string; code: string; name: string; slug: string; address: string; city: string };

/**
 * Bản ghi `Center` phải có TRƯỚC khi seed OrgUnit.
 *
 * ⚠️ Đây là bẫy im lặng của `seedOrgUnits`: nó đọc `db.center.findFirst({ where: { code } })`
 * và gán `centerId = null` nếu không thấy — KHÔNG báo lỗi (`prisma/seed-orgunit.ts` vòng
 * lặp upsert). Mà `getSubtreeCenterIds` chỉ nhặt node `type === "CENTER" && n.centerId`
 * (`lib/org/org-tree.ts:68`) ⇒ thiếu `Center("CS3")` thì OrgUnit CS3 vô hình, QLCS chỉ
 * thấy 1 cơ sở, và cả kịch bản 2 vùng lặng lẽ vô nghĩa trong khi test vẫn "chạy".
 */
const CENTER_SPECS: CenterSpec[] = [
  { id: "a01-center-cs1", code: "CS1", name: "Cơ sở 1", slug: "a01-cs1", address: "211 Nguyễn Hữu Thọ", city: "Đà Nẵng" },
  { id: "a01-center-cs2", code: "CS2", name: "Cơ sở 2", slug: "a01-cs2", address: "114 Hoàng Diệu", city: "Đà Nẵng" },
  { id: "a01-center-cs3", code: "CS3", name: "Cơ sở 3", slug: "a01-cs3", address: "Thành phố Huế", city: "Huế" },
  { id: "a01-center-ho", code: "HO", name: "Hội sở", slug: "a01-ho", address: "114 Hoàng Diệu", city: "Đà Nẵng" },
];

/**
 * Dựng cây 2 vùng + 15 RoleDef, idempotent:
 *
 *   HO ─┬─ DANANG ─┬─ CS1
 *       │          └─ CS2
 *       └─ HUE ────── CS3
 *
 * CS2 giữ lại làm **cơ sở thứ ba** của kịch bản L-A1: QLCS được gán CS1 + CS3, nên mọi
 * truy vấn chạm CS2 phải trả 0 dòng (không lỗi).
 */
export async function seedTwoRegionTree(): Promise<TwoRegionTree> {
  assertTestDb();

  for (const c of CENTER_SPECS) {
    const data = { name: c.name, slug: c.slug, address: c.address, city: c.city, isActive: true };
    await db.center.upsert({
      where: { code: c.code },
      update: data,
      create: { id: c.id, code: c.code, ...data },
    });
  }

  await seedRoles();
  // "CS3" trong `codes` kéo theo vùng cha HUE (prisma/seed-orgunit.ts · OPTIONAL_REGIONS).
  await seedOrg([ORG_CODES.HO, ORG_CODES.CS1, ORG_CODES.CS2, ORG_CODES.CS3]);

  const centerIds = {
    HO: await centerIdByCode("HO"),
    CS1: await centerIdByCode("CS1"),
    CS2: await centerIdByCode("CS2"),
    CS3: await centerIdByCode("CS3"),
  };
  const orgUnitIds = {
    HO: await orgUnitIdByCode(ORG_CODES.HO),
    DANANG: await orgUnitIdByCode(ORG_CODES.DANANG),
    HUE: await orgUnitIdByCode(ORG_CODES.HUE),
    CS1: await orgUnitIdByCode(ORG_CODES.CS1),
    CS2: await orgUnitIdByCode(ORG_CODES.CS2),
    CS3: await orgUnitIdByCode(ORG_CODES.CS3),
  };

  // Chốt ngay tại đây rằng CS3 THẬT SỰ nối được về Center — nếu không, xem ghi chú
  // CENTER_SPECS ở trên: cả kịch bản sẽ vô nghĩa mà không có dấu hiệu nào.
  const cs3 = await db.orgUnit.findUnique({
    where: { code: ORG_CODES.CS3 },
    select: { centerId: true, parentId: true },
  });
  if (cs3?.centerId !== centerIds.CS3 || cs3.parentId !== orgUnitIds.HUE) {
    throw new Error(
      `[A-01 fixture] OrgUnit("CS3") không nối đúng: centerId=${cs3?.centerId ?? "null"} ` +
        `(mong đợi ${centerIds.CS3}), parentId=${cs3?.parentId ?? "null"} (mong đợi HUE ${orgUnitIds.HUE}).`,
    );
  }

  return { centerIds, orgUnitIds };
}

export type SeededUser = { id: string; email: string };

/**
 * 🔴 Tài khoản nghiệm thu A-01: QLCS **thuần**, giữ CS1 (vùng DANANG) + CS3 (vùng HUE).
 *
 * Đọc khối chú thích đầu file trước khi sửa hàm này. Tóm tắt: không `SUPER_ADMIN`,
 * không vai HO, không neo REGION — nếu không, test A-01 xanh giả.
 *
 * `User.centerId` cố ý đặt = CS1 (ảnh chụp lúc đăng nhập, `lib/auth.ts`) để mô phỏng đúng
 * prod: **cơ sở thứ hai KHÔNG nằm trong snapshot đó**. Chính chỗ lệch này là thứ A-01-6
 * (RT-1, ~10 cổng GHI so `record.centerId === session.user.centerId`) phải vượt qua.
 *
 * Hai dòng vai đi qua `assignUserOrgRole()` — ĐÚNG đường gán tay của
 * `/admin/users/[id]/org-roles`, không phải `db.userOrgRole.create` tắt. Nhờ vậy fixture
 * mang đúng phân loại nguồn gốc dòng (SL-01, `UserOrgRole.source`) và dùng lại được cho
 * ca A-12 "sửa ô Đơn vị không được thu hồi dòng gán tay".
 */
export async function seedPureCenterManagerTwoRegions(tree: TwoRegionTree): Promise<SeededUser> {
  assertTestDb();
  const user = await seedUser({
    email: A01_EMAILS.pureCenterManager,
    name: "QLCS thuần 2 cơ sở",
    role: "CENTER_MANAGER",
    roles: ["CENTER_MANAGER"], // KHÔNG thêm SUPER_ADMIN — xem khối chú thích đầu file.
    centerId: tree.centerIds.CS1,
  });

  const roleId = await roleDefIdByCode("CENTER_MANAGER");
  for (const orgUnitId of [tree.orgUnitIds.CS1, tree.orgUnitIds.CS3]) {
    await assignUserOrgRole(SEED_ACTOR, {
      userId: user.id,
      orgUnitId,
      roleId,
      reason: "Fixture A-01: QLCS thuần giữ 2 cơ sở khác vùng (L-A1/L-A13)",
    });
  }

  await assertPureCenterManagerTwoRegions(user.id);
  return { id: user.id, email: user.email };
}

/**
 * Ca ĐỐI CHỨNG của L-A13 — dựng đúng hình dạng tài khoản trên prod: cùng 2 dòng QLCS như
 * fixture thuần, **cộng thêm** `SUPER_ADMIN` neo tại HO.
 *
 * Spec dùng nó để khẳng định vế thứ hai: tài khoản này thấy CẢ cơ sở thứ ba (CS2) dù không
 * được gán — tức mọi phép đo A-01 chạy trên tài khoản kiểu này đều vô giá trị.
 * KHÔNG dùng tài khoản này để nghiệm thu A-01.
 */
export async function seedSuperAdminControlTwoRegions(tree: TwoRegionTree): Promise<SeededUser> {
  assertTestDb();
  const user = await seedUser({
    email: A01_EMAILS.superAdminControl,
    name: "QLCS kiêm SUPER_ADMIN (đối chứng)",
    role: "SUPER_ADMIN",
    roles: ["SUPER_ADMIN", "CENTER_MANAGER"],
    centerId: tree.centerIds.CS1,
  });

  const cmRoleId = await roleDefIdByCode("CENTER_MANAGER");
  for (const orgUnitId of [tree.orgUnitIds.CS1, tree.orgUnitIds.CS3]) {
    await assignUserOrgRole(SEED_ACTOR, {
      userId: user.id,
      orgUnitId,
      roleId: cmRoleId,
      reason: "Fixture A-01 (đối chứng): QLCS 2 cơ sở",
    });
  }
  await assignUserOrgRole(SEED_ACTOR, {
    userId: user.id,
    orgUnitId: tree.orgUnitIds.HO,
    roleId: await roleDefIdByCode("SUPER_ADMIN"),
    reason: "Fixture A-01 (đối chứng): SUPER_ADMIN tại HO — đúng hình dạng tài khoản prod",
  });

  return { id: user.id, email: user.email };
}

/**
 * Chốt chặn bằng mã cho bất biến L-A13 + A-01-3. Ném lỗi nếu tài khoản "thuần" bị nới:
 * có `SUPER_ADMIN`, có vai neo ngoài type `CENTER`, hoặc 2 cơ sở lại cùng một vùng.
 *
 * Gọi sẵn trong `seedPureCenterManagerTwoRegions()`; export ra để spec khẳng định lại
 * (rẻ, và biến "đừng dọn dẹp" thành một test đỏ thay vì một lời nhắn trong comment).
 */
export async function assertPureCenterManagerTwoRegions(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, roles: true },
  });
  if (!user) throw new Error(`[A-01 fixture] Không tìm thấy user ${userId}.`);

  const legacyRoles = [user.role, ...user.roles];
  if (legacyRoles.includes("SUPER_ADMIN")) {
    throw new Error(
      `[A-01 fixture] ${user.email} mang SUPER_ADMIN ở User.role/roles[] — vi phạm L-A13. ` +
        `SUPER_ADMIN đi vào nhánh isHoLevel nên thấy MỌI cơ sở: A-01 sẽ xanh kể cả khi hỏng. ` +
        `Cần tài khoản có SUPER_ADMIN thì dùng seedSuperAdminControlTwoRegions().`,
    );
  }

  const rows = await db.userOrgRole.findMany({
    where: { userId, status: "ACTIVE" },
    select: { orgUnitId: true, role: { select: { code: true } } },
  });
  if (rows.length === 0) throw new Error(`[A-01 fixture] ${user.email} không có dòng UserOrgRole nào.`);

  const units = await db.orgUnit.findMany({
    where: { id: { in: rows.map((r) => r.orgUnitId) } },
    select: { id: true, code: true, type: true, parentId: true },
  });
  const unitById = new Map(units.map((u) => [u.id, u]));

  for (const r of rows) {
    if (r.role.code === "SUPER_ADMIN") {
      throw new Error(`[A-01 fixture] ${user.email} có UserOrgRole vai SUPER_ADMIN — vi phạm L-A13.`);
    }
    const unit = unitById.get(r.orgUnitId);
    if (!unit) throw new Error(`[A-01 fixture] UserOrgRole trỏ OrgUnit không tồn tại: ${r.orgUnitId}.`);
    if (unit.type !== "CENTER") {
      throw new Error(
        `[A-01 fixture] ${user.email} neo vai tại OrgUnit "${unit.code}" type ${unit.type}. ` +
          `Chỉ được neo tại type CENTER: neo ở HO/ROOT bật isHoLevel (thấy mọi cơ sở, A-01-3 cấm), ` +
          `neo ở REGION làm subtree tự gom cả vùng nên không còn đo được "hợp N cơ sở khác vùng".`,
      );
    }
  }

  const regionIds = new Set(rows.map((r) => unitById.get(r.orgUnitId)?.parentId ?? ""));
  if (regionIds.size < 2) {
    throw new Error(
      `[A-01 fixture] ${user.email} giữ ${rows.length} cơ sở nhưng chỉ ${regionIds.size} vùng. ` +
        `L-A1 đòi 2 cơ sở KHÁC vùng — cùng vùng thì một dòng neo ở REGION cũng ra kết quả, ` +
        `nên kịch bản không chứng minh được gì.`,
    );
  }
}

// ─── tra cứu id (giữ riêng để hàm chính đọc thẳng, không lặp select) ────────────

async function centerIdByCode(code: string): Promise<string> {
  const row = await db.center.findFirst({ where: { code }, select: { id: true } });
  if (!row) throw new Error(`[A-01 fixture] Không có Center mã "${code}".`);
  return row.id;
}

async function orgUnitIdByCode(code: string): Promise<string> {
  const row = await db.orgUnit.findUnique({ where: { code }, select: { id: true } });
  if (!row) throw new Error(`[A-01 fixture] Không có OrgUnit mã "${code}" — seedOrg có xin mã này chưa?`);
  return row.id;
}

async function roleDefIdByCode(code: string): Promise<string> {
  const row = await db.roleDef.findUnique({ where: { code }, select: { id: true } });
  if (!row) throw new Error(`[A-01 fixture] Không có RoleDef mã "${code}" — seedRoles() chưa chạy?`);
  return row.id;
}
