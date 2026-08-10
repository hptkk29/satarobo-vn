/**
 * Nền Hệ thống P1 — TS-05 (dời node cập nhật path cả nhánh) + TS-06 (pháp nhân).
 * Chạy trên Postgres LOCAL (job `e2e-a0`). Đây là tầng DB; phần THUẦN ở lib/org/path.test.ts.
 *
 * Fixture chuẩn của 04-TestScenarios: HO → {VUNG_A, DANANG} → {CS_F (Vùng-A), CS1, CS_L}.
 * Dựng bằng chính service (createOrgUnit) chứ không INSERT tay — để test đi qua đúng đường
 * mà UI và script sẽ đi.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg } from "../_helpers/seed";
import { OrgRuleError } from "../../../lib/org/types";
import {
  createOrgUnit,
  getSubtreeCenterIds,
  updateOrgUnit,
} from "../../../lib/org/org-service";
import {
  createLegalEntity,
  listLegalEntities,
  softDeleteLegalEntity,
  updateLegalEntity,
} from "../../../lib/org/legal-entity";

async function expectOrgError(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    if (e instanceof OrgRuleError) {
      expect(e.code).toBe(code);
      return;
    }
    throw e;
  }
  throw new Error(`Mong đợi OrgRuleError(${code}) nhưng không có lỗi nào`);
}

const byCode = (code: string) => db.orgUnit.findUnique({ where: { code } });

/** Dựng cây mẫu TS-05 trên nền seed (HO → DANANG → CS1/CS2). */
async function seedFixtureTree() {
  await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-p1", address: "211", city: "" } });
  await db.center.create({ data: { code: "CS2", name: "CS2", slug: "cs2-p1", address: "114", city: "" } });
  await db.center.create({ data: { code: "HO", name: "Hội sở", slug: "ho-p1", address: "114", city: "" } });
  await seedOrg(["HO", "CS1", "CS2"]);

  const ho = await byCode("HO");
  const vungA = await createOrgUnit({
    type: "REGION",
    code: "VUNG_A",
    name: "Vùng A",
    parentId: ho!.id,
  });
  const csfCenter = await db.center.create({
    data: { code: "CSF", name: "CS-F", slug: "csf-p1", address: "X", city: "" },
  });
  const csf = await createOrgUnit({
    type: "CENTER",
    code: "CS_F",
    name: "Cơ sở nhượng quyền",
    parentId: vungA.id,
    centerId: csfCenter.id,
    relationshipType: "FRANCHISEE",
  });
  return { ho: ho!, vungA, csf, csfCenterId: csfCenter.id };
}

test.describe("[US-05][TS-05] materialized path", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[US-05-IT-01] tạo node dưới vùng → path/depth đúng ngay", async () => {
    const { csf } = await seedFixtureTree();
    expect(csf.path).toBe("/ho/vung-a/cs-f/");
    expect(csf.depth).toBe(2);
    expect(csf.relationshipType).toBe("FRANCHISEE");
  });

  test("[US-05-IT-02] dời CS_F sang DANANG → path đổi, phạm vi vùng đổi theo", async () => {
    const { vungA, csf, csfCenterId } = await seedFixtureTree();
    const dn = await byCode("DANANG");

    // Trước khi dời: CS-F thuộc Vùng-A.
    expect(await getSubtreeCenterIds(vungA.id)).toContain(csfCenterId);
    expect(await getSubtreeCenterIds(dn!.id)).not.toContain(csfCenterId);

    await updateOrgUnit(csf.id, { parentId: dn!.id });

    const moved = await byCode("CS_F");
    expect(moved?.path).toBe("/ho/danang/cs-f/");
    expect(moved?.depth).toBe(2);

    // TS-05 nguyên văn: "query UNIT_AND_BELOW của Vùng-A không còn thấy dữ liệu CS-F,
    // của Đà Nẵng thấy".
    expect(await getSubtreeCenterIds(vungA.id)).not.toContain(csfCenterId);
    expect(await getSubtreeCenterIds(dn!.id)).toContain(csfCenterId);
  });

  test("[US-05-IT-03] dời node CÓ CON → mọi hậu duệ đổi path trong CÙNG transaction", async () => {
    const { csf } = await seedFixtureTree();
    const dn = await byCode("DANANG");

    const lab = await createOrgUnit({
      type: "DEPARTMENT",
      code: "LAB_F",
      name: "Phòng lab",
      parentId: csf.id,
    });
    const kho = await createOrgUnit({
      type: "DEPARTMENT",
      code: "KHO_F",
      name: "Kho",
      parentId: lab.id,
    });
    expect(lab.path).toBe("/ho/vung-a/cs-f/lab-f/");
    expect(kho.path).toBe("/ho/vung-a/cs-f/lab-f/kho-f/");

    await updateOrgUnit(csf.id, { parentId: dn!.id });

    expect((await byCode("LAB_F"))?.path).toBe("/ho/danang/cs-f/lab-f/");
    expect((await byCode("KHO_F"))?.path).toBe("/ho/danang/cs-f/lab-f/kho-f/");
    expect((await byCode("KHO_F"))?.depth).toBe(4);
  });

  test("[US-05-IT-04] dời tạo VÒNG → chặn, và KHÔNG để lại path nửa vời", async () => {
    // Dùng chuỗi DEPARTMENT → DEPARTMENT vì đó là cặp loại mà V9 CHO PHÉP; nếu thử
    // "HO xuống dưới REGION" thì V9 chặn trước và ta không bao giờ chạm tới nhánh cycle.
    const { csf } = await seedFixtureTree();
    const lab = await createOrgUnit({ type: "DEPARTMENT", code: "LAB_F", name: "Lab", parentId: csf.id });
    const kho = await createOrgUnit({ type: "DEPARTMENT", code: "KHO_F", name: "Kho", parentId: lab.id });

    await expectOrgError(updateOrgUnit(lab.id, { parentId: kho.id }), "ORG_CYCLE");

    // Cây phải NGUYÊN VẸN: không path nào bị ghi nửa chừng.
    expect((await byCode("LAB_F"))?.parentId).toBe(csf.id);
    expect((await byCode("LAB_F"))?.path).toBe("/ho/vung-a/cs-f/lab-f/");
    expect((await byCode("KHO_F"))?.path).toBe("/ho/vung-a/cs-f/lab-f/kho-f/");
  });

  test("[US-05-IT-04b] V9 chặn TRƯỚC cycle khi loại cha sai — thông báo nói đúng nguyên nhân", async () => {
    const { ho, vungA } = await seedFixtureTree();
    // HO xuống dưới REGION vừa sai loại (V9) vừa tạo vòng (V5). V9 chạy trước vì rẻ hơn
    // và nói đúng cái người dùng làm sai; đây là hành vi CHỦ ĐÍCH, ghim lại kẻo đảo thứ tự.
    await expectOrgError(updateOrgUnit(ho.id, { parentId: vungA.id }), "ORG_PARENT_TYPE_INVALID");
    expect((await byCode("HO"))?.parentId).toBeNull();
    expect((await byCode("HO"))?.path).toBe("/ho/");
  });

  test("[US-05-IT-05][AC3] CENTER không được làm cha REGION — cả khi TẠO lẫn khi DỜI", async () => {
    const { vungA } = await seedFixtureTree();
    const cs1 = await byCode("CS1");

    await expectOrgError(
      createOrgUnit({ type: "REGION", code: "VUNG_B", name: "Vùng B", parentId: cs1!.id }),
      "ORG_PARENT_TYPE_INVALID",
    );
    await expectOrgError(
      updateOrgUnit(vungA.id, { parentId: cs1!.id }),
      "ORG_PARENT_TYPE_INVALID",
    );
  });

  test("[US-05-IT-06] đổi CODE cũng kéo path của cả nhánh", async () => {
    const { csf } = await seedFixtureTree();
    await createOrgUnit({ type: "DEPARTMENT", code: "LAB_F", name: "Lab", parentId: csf.id });

    await updateOrgUnit(csf.id, { code: "CS_FRANCHISE" });

    expect((await byCode("CS_FRANCHISE"))?.path).toBe("/ho/vung-a/cs-franchise/");
    expect((await byCode("LAB_F"))?.path).toBe("/ho/vung-a/cs-franchise/lab-f/");
  });

  test("[US-05-IT-07] Center 'hoi-so' KHÔNG còn mồ côi — HO mang centerId", async () => {
    // Đây là lỗ đã đo được trước P1: không OrgUnit nào trỏ tới Center('hoi-so') nên mọi
    // bản ghi của Hội sở nhận orgUnitId = null vĩnh viễn (và biến mất ở P4).
    await seedFixtureTree();
    const ho = await byCode("HO");
    const hoCenter = await db.center.findFirst({ where: { code: "HO" }, select: { id: true } });
    expect(ho?.centerId).toBe(hoCenter!.id);

    // …nhưng centerId của HO KHÔNG được lọt vào phạm vi "cơ sở" của ai cả.
    const centersOfHo = await getSubtreeCenterIds(ho!.id);
    expect(centersOfHo).not.toContain(hoCenter!.id);
  });
});

test.describe("[US-06][TS-06] LegalEntity — pháp nhân", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[US-06-IT-01] tạo + MST hợp lệ/không hợp lệ", async () => {
    const le = await createLegalEntity({
      taxCode: "0402301783",
      legalName: "CTCP Công nghệ Giáo dục Sata Robo",
      isPrimary: true,
    });
    expect(le.isPrimary).toBe(true);

    await expectOrgError(
      createLegalEntity({ taxCode: "12345", legalName: "X" }),
      "LEGAL_TAXCODE_INVALID",
    );
    await expectOrgError(
      createLegalEntity({ taxCode: "0402301783", legalName: "Trùng MST" }),
      "LEGAL_TAXCODE_CONFLICT",
    );
    // Đơn vị phụ thuộc: 10 số + "-" + 3 số.
    await createLegalEntity({ taxCode: "0402301783-001", legalName: "Chi nhánh" });
  });

  test("[US-06-IT-02][AC2] pháp nhân gốc isPrimary DUY NHẤT", async () => {
    const a = await createLegalEntity({ taxCode: "0402301783", legalName: "A", isPrimary: true });
    const b = await createLegalEntity({ taxCode: "0101243150", legalName: "B", isPrimary: true });

    const all = await listLegalEntities();
    expect(all.filter((x) => x.isPrimary).map((x) => x.id)).toEqual([b.id]);

    // Nâng lại A → B tự hạ cờ.
    await updateLegalEntity(a.id, { isPrimary: true });
    const sau = await listLegalEntities();
    expect(sau.filter((x) => x.isPrimary).map((x) => x.id)).toEqual([a.id]);
  });

  test("[US-06-IT-03][AC1] 1 pháp nhân ↔ N đơn vị; 1 đơn vị ↔ 1 pháp nhân", async () => {
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-le", address: "211", city: "" } });
    await db.center.create({ data: { code: "CS2", name: "CS2", slug: "cs2-le", address: "114", city: "" } });
    await db.center.create({ data: { code: "HO", name: "HO", slug: "ho-le", address: "114", city: "" } });
    await seedOrg(["HO", "CS1", "CS2"]);
    // MST khác pháp nhân gốc do seedOrg tạo (0402301783) — tránh đụng unique.
    const le = await createLegalEntity({ taxCode: "0101243150", legalName: "Pháp nhân B" });

    const cs1 = await byCode("CS1");
    const cs2 = await byCode("CS2");
    await updateOrgUnit(cs1!.id, { legalEntityId: le.id });
    await updateOrgUnit(cs2!.id, { legalEntityId: le.id });

    const gan = await db.orgUnit.findMany({ where: { legalEntityId: le.id }, select: { code: true } });
    expect(gan.map((g) => g.code).sort()).toEqual(["CS1", "CS2"]);
  });

  test("[US-06-IT-04][AC3][TS-06] không xoá được pháp nhân còn đơn vị ACTIVE; đóng đơn vị rồi xoá được", async () => {
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-del", address: "211", city: "" } });
    await db.center.create({ data: { code: "HO", name: "HO", slug: "ho-del", address: "114", city: "" } });
    await seedOrg(["HO", "CS1"]);
    const le = await createLegalEntity({ taxCode: "0101243150", legalName: "Pháp nhân B" });
    const cs1 = await byCode("CS1");
    await updateOrgUnit(cs1!.id, { legalEntityId: le.id });

    try {
      await softDeleteLegalEntity(le.id);
      throw new Error("Mong đợi bị chặn");
    } catch (e) {
      expect(e).toBeInstanceOf(OrgRuleError);
      expect((e as OrgRuleError).code).toBe("LEGAL_HAS_ACTIVE_ORG_UNITS");
      // TS-06 đòi "kèm danh sách đơn vị chặn".
      expect((e as OrgRuleError).message).toContain("CS1");
    }

    await updateOrgUnit(cs1!.id, { status: "CLOSED" });
    const xoa = await softDeleteLegalEntity(le.id);
    expect(xoa.deletedAt).not.toBeNull();
  });

  test("[US-06-IT-05] đơn vị hết hiệu lực (effectiveTo quá khứ) KHÔNG chặn xoá pháp nhân", async () => {
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-eff", address: "211", city: "" } });
    await db.center.create({ data: { code: "HO", name: "HO", slug: "ho-eff", address: "114", city: "" } });
    await seedOrg(["HO", "CS1"]);
    const le = await createLegalEntity({ taxCode: "0101243150", legalName: "Pháp nhân B" });
    const cs1 = await byCode("CS1");
    await updateOrgUnit(cs1!.id, {
      legalEntityId: le.id,
      effectiveTo: new Date("2020-01-01T00:00:00Z"),
    });

    const xoa = await softDeleteLegalEntity(le.id);
    expect(xoa.deletedAt).not.toBeNull();
  });
});
