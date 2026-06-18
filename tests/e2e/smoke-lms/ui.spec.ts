import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { login } from "../_helpers/auth";
import { makeToken } from "../../../lib/portal/active-site-token";

const SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret-smoke";
const ctx: Record<string, string> = {};

test.beforeAll(async () => {
  await resetDb();
  const cs1 = await db.center.create({
    data: { name: "Cơ sở 1", slug: "cs1-uismoke", address: "211 NHT", code: "CS1" },
  });
  await seedOrg(["HO", "CS1", "CS2"]);
  await seedRoles();
  const cs1Org = await db.orgUnit.findFirst({ where: { code: "CS1" }, select: { id: true } });
  const rootOrg = await db.orgUnit.findFirst({ where: { code: "SATAROBO" }, select: { id: true } });
  const teacherRole = await db.roleDef.findUnique({ where: { code: "TEACHER" }, select: { id: true } });
  const saRole = await db.roleDef.findUnique({ where: { code: "SUPER_ADMIN" }, select: { id: true } });

  const sa = await seedUser({ email: "sa@ui.vn", role: "SUPER_ADMIN", name: "Super" });
  const tA = await seedUser({ email: "ta@ui.vn", role: "TEACHER", name: "GV A", centerId: cs1.id });
  const parent = await seedUser({ email: "ph@ui.vn", role: "PARENT", name: "Phu Huynh" });

  await db.userOrgRole.createMany({
    data: [
      { userId: tA.id, orgUnitId: cs1Org!.id, roleId: teacherRole!.id, grantedById: sa.id },
      { userId: sa.id, orgUnitId: rootOrg!.id, roleId: saRole!.id, grantedById: sa.id },
    ],
  });

  const course = await db.course.create({ data: { name: "LTR", slug: "ltr-uismoke" } });
  const classA = await db.class.create({
    data: { name: "Lớp A", courseId: course.id, centerId: cs1.id, teacherId: tA.id },
  });
  const s1 = await db.student.create({
    data: { name: "HV Một", parentUserId: parent.id, centerId: cs1.id },
  });
  await db.enrollment.create({
    data: { studentId: s1.id, classId: classA.id, courseId: course.id, status: "STUDYING" },
  });
  const thread = await db.messageThread.create({
    data: { studentId: s1.id, subject: "Hỏi tiến độ", createdByUserId: parent.id },
  });
  await db.message.create({
    data: { threadId: thread.id, senderUserId: parent.id, senderRole: "PARENT", senderName: "Phu Huynh", body: "Chào thầy ạ" },
  });

  Object.assign(ctx, { sa: "sa@ui.vn", parent: "ph@ui.vn", s1: s1.id });
});

test("admin: hộp thư tin nhắn render + có thread; compliance render", async ({ page }) => {
  await login(page, { email: ctx.sa });

  await page.goto("/admin/tin-nhan");
  await expect(page.getByRole("heading", { name: "Tin nhắn phụ huynh" })).toBeVisible();
  await expect(page.getByText("HV Một")).toBeVisible();

  await page.goto("/admin/compliance");
  await expect(page.getByRole("heading", { name: /Tuân thủ dữ liệu/ })).toBeVisible();

  // P6 — dashboard báo cáo LMS (Recharts) render.
  await page.goto("/admin/bao-cao/lms");
  await expect(page.getByRole("heading", { name: "Báo cáo LMS" })).toBeVisible();
  await expect(page.getByText("Hiệu suất giáo viên")).toBeVisible();
});

test("portal: PH xem hộp thư + gửi tin mới", async ({ page, context }) => {
  await login(page, { email: ctx.parent });
  await context.addCookies([
    { name: "portal_active_site", value: makeToken(ctx.s1, SECRET), domain: "localhost", path: "/" },
  ]);

  await page.goto("/portal/tin-nhan");
  await expect(page.getByRole("heading", { name: "Tin nhắn" })).toBeVisible();
  // hội thoại seed sẵn hiển thị
  await expect(page.getByText("Hỏi tiến độ")).toBeVisible();

  // gửi tin mới
  await page.getByPlaceholder(/Tiêu đề/).fill("Hỏi thêm");
  await page.getByPlaceholder(/Nhập tin nhắn/).fill("Cảm ơn thầy");
  await page.getByRole("button", { name: "Gửi" }).click();
  await expect(page.getByText("Hỏi thêm").first()).toBeVisible({ timeout: 15_000 });
});
