/**
 * A0-06 — AuditLog hợp nhất: writeAudit + scope viewer + EXPORT. Postgres LOCAL.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { testEmail } from "../_helpers/fixtures";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { resolveActorUncached } from "../../../lib/auth/actor";
import { writeAudit, getAuditLogsScoped } from "../../../lib/audit/audit-log";

const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };
const orgId = async (code: string) =>
  (await db.orgUnit.findUnique({ where: { code }, select: { id: true } }))!.id;

async function userActor(email: string, orgCode: string, roleCode: string) {
  const u = await seedUser({ email: testEmail(email), role: "ACCOUNTANT" });
  const r = (await db.roleDef.findUnique({ where: { code: roleCode }, select: { id: true } }))!.id;
  await assignUserOrgRole(SA, { userId: u.id, orgUnitId: await orgId(orgCode), roleId: r, reason: "seed" });
  return resolveActorUncached(u.id);
}

test.describe("[A0-06] AuditLog hợp nhất", () => {
  test.beforeEach(async () => {
    await resetDb();
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
  });

  test("[A0-06-T9-01] writeAudit ghi đúng actor/old/new/changedFields/reason (AC1)", async () => {
    const cs1 = await orgId("CS1");
    const log = await writeAudit({
      actor: { id: "u1", name: "Nguyen" }, module: "test", entityType: "Thing", entityId: "x1",
      action: "UPDATE", oldValues: { a: 1, b: 2 }, newValues: { a: 1, b: 9 },
      reason: "sửa b", orgUnitId: cs1,
    });
    expect(log.actorName).toBe("Nguyen");
    expect(log.changedFields).toEqual(["b"]);
    expect(log.reason).toBe("sửa b");
  });

  test("[A0-06-T9-03] system action → actorName=System, actorId null (AC7)", async () => {
    const log = await writeAudit({
      actor: { id: null, name: "System" }, module: "cron", entityType: "Job", entityId: "j1", action: "CREATE",
    });
    expect(log.actorId).toBeNull();
    expect(log.actorName).toBe("System");
  });

  test("[A0-06-T5-01/02/03] viewer scope theo orgUnit (AC3)", async () => {
    const cs1 = await orgId("CS1");
    const cs2 = await orgId("CS2");
    await writeAudit({ actor: { id: "s", name: "S" }, module: "m", entityType: "T", entityId: "a", action: "CREATE", orgUnitId: cs1 });
    await writeAudit({ actor: { id: "s", name: "S" }, module: "m", entityType: "T", entityId: "b", action: "CREATE", orgUnitId: cs2 });

    const cm1 = await userActor("cm1", "CS1", "CENTER_MANAGER");
    const cm2 = await userActor("cm2", "CS2", "CENTER_MANAGER");
    const sa = await userActor("sa", "HO", "SUPER_ADMIN");

    expect((await getAuditLogsScoped(cm1)).map((l) => l.orgUnitId)).toEqual([cs1]);
    expect((await getAuditLogsScoped(cm2)).map((l) => l.orgUnitId)).toEqual([cs2]);
    expect((await getAuditLogsScoped(sa)).length).toBe(2); // SUPER_ADMIN thấy tất cả
  });

  test("[A0-06-T10-03] export → sinh AuditLog action=EXPORT (AC5)", async () => {
    await writeAudit({
      actor: { id: "u1", name: "U" }, module: "orders", entityType: "Order", entityId: "*",
      action: "EXPORT", reason: "xuất Excel (filter month=6)",
    });
    const log = await db.auditLog.findFirst({ where: { action: "EXPORT" } });
    expect(log?.module).toBe("orders");
    expect(log?.reason).toContain("xuất Excel");
  });
});
