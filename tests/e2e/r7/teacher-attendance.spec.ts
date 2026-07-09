// #06 L6 (câu 47/50/46) — điểm danh site GV: guard sở hữu buổi + makeup liên cơ sở +
// không lộ contact PH. Kiểm TẦNG DỮ LIỆU (guard + roster) — đúng cơ chế mà
// saveClassAttendanceAction dùng: withMakeupException nạp buổi + isSessionOwnedByTeacher
// gác quyền sở hữu. Postgres LOCAL, không cần dev server.
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { testEmail } from "../_helpers/fixtures";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { resolveActorUncached } from "../../../lib/auth/actor";
import { scopedDb, withMakeupException } from "../../../lib/db-scope";
import { isSessionOwnedByTeacher } from "../../../lib/lms/session-ownership";
import { buildSessionAttendanceRows } from "../../../lib/attendance/roster";

const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };

async function orgId(code: string) {
  return (await db.orgUnit.findUnique({ where: { code }, select: { id: true } }))!.id;
}
async function centerIdOf(code: string) {
  return (await db.orgUnit.findUnique({ where: { code }, select: { centerId: true } }))!.centerId!;
}
async function makeClass(ctr: string, teacherId: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  const course = await db.course.create({ data: { name: `Khoá ${rand}`, slug: `ka-${rand}` }, select: { id: true } });
  return db.class.create({
    data: { name: `Lớp ${rand}`, courseId: course.id, centerId: ctr, teacherId, status: "ACTIVE" },
    select: { id: true, courseId: true },
  });
}
async function makeSession(
  classId: string,
  ctr: string,
  extra: { substituteTeacherId?: string; actualTeacherId?: string } = {},
) {
  return db.classSession.create({
    data: { classId, centerId: ctr, date: new Date("2026-08-01T02:00:00Z"), status: "SCHEDULED", ...extra },
    select: { id: true },
  });
}
const ownerArgs = (s: { classId: string; substituteTeacherId: string | null; actualTeacherId: string | null }) => s;

test.describe("[#06-L6] teacher attendance guard + makeup liên cơ sở", () => {
  let c1 = "", c2 = "";
  let gv1 = { id: "" }, gv2 = { id: "" };
  let cls1: { id: string; courseId: string };
  let cls2: { id: string; courseId: string };
  let actorGv1: Awaited<ReturnType<typeof resolveActorUncached>>;

  test.beforeEach(async () => {
    await resetDb();
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-att", address: "a", city: "" } });
    await db.center.create({ data: { code: "CS2", name: "CS2", slug: "cs2-att", address: "b", city: "" } });
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    c1 = await centerIdOf("CS1");
    c2 = await centerIdOf("CS2");
    gv1 = await seedUser({ email: testEmail("gv1-att"), role: "TEACHER", centerId: c1 });
    gv2 = await seedUser({ email: testEmail("gv2-att"), role: "TEACHER", centerId: c2 });
    const teacherRoleId = (await db.roleDef.findUnique({ where: { code: "TEACHER" }, select: { id: true } }))!.id;
    await assignUserOrgRole(SA, { userId: gv1.id, orgUnitId: await orgId("CS1"), roleId: teacherRoleId, reason: "seed" });
    await assignUserOrgRole(SA, { userId: gv2.id, orgUnitId: await orgId("CS2"), roleId: teacherRoleId, reason: "seed" });
    // Lớp phải tồn tại TRƯỚC resolveActor (assignedClassIds tính lúc resolve).
    cls1 = await makeClass(c1, gv1.id); // lớp GV1 @ CS1
    cls2 = await makeClass(c2, gv2.id); // lớp GV2 @ CS2
    actorGv1 = await resolveActorUncached(gv1.id);
  });

  test("[câu 50] GV nạp + sở hữu buổi lớp MÌNH → cho điểm danh", async () => {
    const s = await makeSession(cls1.id, c1);
    const loaded = await withMakeupException(actorGv1).classSession.findUnique({
      where: { id: s.id },
      select: { classId: true, substituteTeacherId: true, actualTeacherId: true },
    });
    expect(loaded).not.toBeNull();
    expect(isSessionOwnedByTeacher(ownerArgs(loaded!), { userId: gv1.id, assignedClassIds: actorGv1.assignedClassIds })).toBe(true);
  });

  test("[câu 50] GV KHÔNG sở hữu buổi lớp GV KHÁC → guard chặn (dù nạp được)", async () => {
    const s = await makeSession(cls2.id, c2);
    // withMakeupException bỏ lọc cơ sở nên nạp được — nhưng ownership sai ⇒ chặn.
    const loaded = await withMakeupException(actorGv1).classSession.findUnique({
      where: { id: s.id },
      select: { classId: true, substituteTeacherId: true, actualTeacherId: true },
    });
    expect(loaded).not.toBeNull();
    expect(isSessionOwnedByTeacher(ownerArgs(loaded!), { userId: gv1.id, assignedClassIds: actorGv1.assignedClassIds })).toBe(false);
  });

  test("[câu 47] GV dạy thay buổi CƠ SỞ KHÁC: scopedDb ẩn, withMakeupException hiện + sở hữu đúng", async () => {
    const s = await makeSession(cls2.id, c2, { substituteTeacherId: gv1.id });
    // scopedDb: GV1 chỉ thấy CS1 ⇒ buổi CS2 bị ẩn (chứng minh vì sao cần exception).
    expect(await scopedDb(actorGv1).classSession.findUnique({ where: { id: s.id } })).toBeNull();
    // withMakeupException: nạp được buổi cơ sở khác GV dạy thay.
    const loaded = await withMakeupException(actorGv1).classSession.findUnique({
      where: { id: s.id },
      select: { classId: true, substituteTeacherId: true, actualTeacherId: true },
    });
    expect(loaded).not.toBeNull();
    expect(isSessionOwnedByTeacher(ownerArgs(loaded!), { userId: gv1.id, assignedClassIds: actorGv1.assignedClassIds })).toBe(true);
  });

  test("[câu 46] roster điểm danh KHÔNG lộ SĐT/tên phụ huynh", async () => {
    const student = await db.student.create({
      data: { name: "HS Test", centerId: c1, parentName: "Phụ Huynh X", parentPhone: "0999888777" },
      select: { id: true },
    });
    await db.enrollment.create({
      data: { studentId: student.id, classId: cls1.id, courseId: cls1.courseId, status: "STUDYING" },
    });
    const s = await makeSession(cls1.id, c1);

    const { rows } = await buildSessionAttendanceRows(actorGv1, s.id);
    const row = rows.find((r) => r.studentId === student.id);
    expect(row).toBeTruthy();
    expect(row!.studentName).toBe("HS Test");
    // Không field nào của row chứa contact phụ huynh.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("0999888777");
    expect(serialized).not.toContain("Phụ Huynh X");
  });
});
