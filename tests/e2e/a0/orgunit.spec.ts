/**
 * A0-01 — OrgUnit DB layer (schema + service + seed). Chạy trên Postgres LOCAL.
 * Case tag [A0-01-T..] để đối chiếu RTM ticket A0-01.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg } from "../_helpers/seed";
import { OrgRuleError } from "../../../lib/org/types";
import {
  createOrgUnit,
  getOrgUnit,
  getSubtreeCenterIds,
  getAncestors,
  isAncestor,
  listOrgUnits,
  softDeleteOrgUnit,
  updateOrgUnit,
} from "../../../lib/org/org-service";

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

async function byCode(code: string) {
  return db.orgUnit.findUnique({ where: { code } });
}

/** Tạo 2 Center cũ (CS1/CS2) để OrgUnit CENTER link centerId (cho AC5). */
async function seedCenters() {
  await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-test", address: "211 NHT", city: "" } });
  await db.center.create({ data: { code: "CS2", name: "CS2", slug: "cs2-test", address: "114 HD", city: "" } });
}

test.describe("[A0-01] OrgUnit DB layer", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[A0-01-T1-02] seed → 4 OrgUnit, HO.parent=ROOT, CS cùng cấp HO (AC2)", async () => {
    await seedOrg(["HO", "CS1", "CS2"]);
    expect(await db.orgUnit.count()).toBe(4);
    const root = await byCode("SATAROBO");
    const ho = await byCode("HO");
    const cs1 = await byCode("CS1");
    expect(root?.parentId).toBeNull();
    expect(ho?.parentId).toBe(root?.id); // KHÔNG phải CS2 (OI-1)
    expect(cs1?.parentId).toBe(root?.id);
  });

  test("[A0-01-T3-03] HO & CS2 cùng address vẫn tạo được (AC3)", async () => {
    await seedOrg(["HO", "CS1", "CS2"]);
    const ho = await byCode("HO");
    const cs2 = await byCode("CS2");
    expect(ho?.address).toBe("114 Hoàng Diệu, Đà Nẵng");
    expect(cs2?.address).toBe("114 Hoàng Diệu, Đà Nẵng");
    expect(ho?.id).not.toBe(cs2?.id);
  });

  test("[A0-01-T1-03/04][A0-01-T5-01] getSubtreeCenterIds: ROOT=[CS1,CS2], CS1=[CS1], HO=[] (AC5)", async () => {
    await seedCenters();
    await seedOrg(["HO", "CS1", "CS2"]);
    const root = await byCode("SATAROBO");
    const ho = await byCode("HO");
    const cs1 = await byCode("CS1");
    const cs1Center = await db.center.findFirst({ where: { code: "CS1" }, select: { id: true } });
    const cs2Center = await db.center.findFirst({ where: { code: "CS2" }, select: { id: true } });

    const rootIds = await getSubtreeCenterIds(root!.id);
    expect(rootIds.sort()).toEqual([cs1Center!.id, cs2Center!.id].sort());
    expect(await getSubtreeCenterIds(cs1!.id)).toEqual([cs1Center!.id]);
    expect(await getSubtreeCenterIds(ho!.id)).toEqual([]); // OI-1: HO độc lập
  });

  test("[A0-01-T1-05/06] getAncestors + isAncestor", async () => {
    await seedOrg(["HO", "CS1", "CS2"]);
    const root = await byCode("SATAROBO");
    const cs1 = await byCode("CS1");
    const cs2 = await byCode("CS2");
    const anc = await getAncestors(cs1!.id);
    expect(anc.map((n) => n.code)).toEqual(["CS1", "SATAROBO"]);
    expect(await isAncestor(root!.id, cs2!.id)).toBe(true);
    expect(await isAncestor(cs1!.id, cs2!.id)).toBe(false);
  });

  test("[A0-01-T5-02] thêm CS3 → subtree(ROOT) tự gồm CS3, không sửa code (AC6)", async () => {
    await seedCenters();
    await seedOrg(["HO", "CS1", "CS2"]);
    const root = await byCode("SATAROBO");
    const cs3Center = await db.center.create({ data: { code: "CS3", name: "CS3", slug: "cs3-test", address: "X", city: "" } });
    await createOrgUnit({ type: "CENTER", code: "CS3", name: "Cơ sở 3", parentId: root!.id, centerId: cs3Center.id });
    const ids = await getSubtreeCenterIds(root!.id);
    expect(ids).toContain(cs3Center.id);
  });

  test("[A0-01-T2-01] code trùng → CONFLICT (AC4/V1)", async () => {
    await seedOrg(["HO"]);
    const root = await byCode("SATAROBO");
    await expectOrgError(
      createOrgUnit({ type: "HO", code: "HO", name: "Trùng", parentId: root!.id }),
      "ORG_CODE_CONFLICT",
    );
  });

  test("[A0-01-T2-02/04/05/07/08] validations (V2/V3/V4/V7)", async () => {
    await seedOrg(["HO", "CS1", "CS2"]);
    const root = await byCode("SATAROBO");
    // V2 code rỗng
    await expectOrgError(createOrgUnit({ type: "CENTER", code: "", name: "X", parentId: root!.id }), "ORG_CODE_REQUIRED");
    // V4 non-root thiếu parent
    await expectOrgError(createOrgUnit({ type: "CENTER", code: "NOPAR", name: "X" }), "ORG_PARENT_REQUIRED");
    // V4 parent không tồn tại
    await expectOrgError(createOrgUnit({ type: "CENTER", code: "GHOST", name: "X", parentId: "nope" }), "ORG_PARENT_NOT_FOUND");
    // V3 ROOT thứ 2
    await expectOrgError(createOrgUnit({ type: "ROOT", code: "ROOT2", name: "X" }), "ORG_MULTIPLE_ROOT");
    // V7 centerId cho type=HO
    await expectOrgError(createOrgUnit({ type: "HO", code: "HO2", name: "X", parentId: root!.id, centerId: "c1" }), "ORG_CENTERID_NOT_CENTER");
  });

  test("[A0-01-T7-01] đổi parent tạo cycle → từ chối (V5)", async () => {
    await seedOrg(["HO", "CS1", "CS2"]);
    const root = await byCode("SATAROBO");
    const cs1 = await byCode("CS1");
    // Đặt ROOT.parent = CS1 (CS1 là hậu duệ ROOT) → cycle.
    await expectOrgError(updateOrgUnit(root!.id, { parentId: cs1!.id }), "ORG_CYCLE");
  });

  test("[A0-01-T7-03] soft-delete CS1 → ẩn khỏi list mặc định; subtree(ROOT) mất CS1 (AC7)", async () => {
    await seedCenters();
    await seedOrg(["HO", "CS1", "CS2"]);
    const root = await byCode("SATAROBO");
    const cs1 = await byCode("CS1");
    const cs1Center = await db.center.findFirst({ where: { code: "CS1" }, select: { id: true } });
    await softDeleteOrgUnit(cs1!.id);
    const codes = (await listOrgUnits()).map((o) => o.code);
    expect(codes).not.toContain("CS1");
    expect(await getOrgUnit(cs1!.id)).toBeNull();
    expect(await getSubtreeCenterIds(root!.id)).not.toContain(cs1Center!.id);
  });

  test("[A0-01-T7-04] soft-delete ROOT khi còn con → chặn (V8)", async () => {
    await seedOrg(["HO", "CS1", "CS2"]);
    const root = await byCode("SATAROBO");
    await expectOrgError(softDeleteOrgUnit(root!.id), "ORG_HAS_CHILDREN");
  });

  test("[A0-01-T6-02] seed 2 lần idempotent → vẫn 4 (AC8)", async () => {
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedOrg(["HO", "CS1", "CS2"]);
    expect(await db.orgUnit.count()).toBe(4);
  });
});
