// #06 (L6) — BROWSER e2e site giáo viên: DoD "GV không xem được SĐT/email PH;
// không lộ studentId trên URL; host×role".
//
// Đây là test TRÌNH DUYỆT THẬT (khác teacher-attendance.spec.ts kiểm tầng dữ liệu):
// login TEACHER qua form /login → điều hướng /teacher/lop (lớp → buổi → roster điểm
// danh) + /teacher/lich, rồi soi HTML render + URL. Nhờ đó bắt được rò rỉ ở RANH GIỚI
// RSC → client (payload flight nhúng trong HTML) mà test tầng-helper không thấy: trang
// map roster bỏ studentPhone trước khi truyền xuống <AttendancePanel> (câu 46). Cần dev
// server bật TEACHER_SITE_ENABLED=true (xem playwright.teacher.config.ts).
//
// ⚠️ GIỚI HẠN host×role: trên localhost, route-policy map mọi host → hostKind
// "unknown" → decideRoute trả {type:"next"} (proxy passthrough), nên KHÔNG thể test
// redirect giaovien-vs-admin bằng trình duyệt. Phần host×role ĐÃ có unit test riêng ở
// lib/auth/route-policy.test.ts (+ switchable-areas.test.ts). Ở đây chỉ khẳng định
// tầng RENDER: trang teacher hiển thị đúng qua gate layout (auth + flag + role).
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { testEmail, TEST_PASSWORD } from "../_helpers/fixtures";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";

const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };

// PII "mồi" đặc trưng — nếu bất kỳ chuỗi nào rò ra HTML/URL, assert bắt ngay.
const STUDENT_NAME = "Trần Minh Kiệt";
const STUDENT_PHONE = "0911222333"; // SĐT của HV (roster helper CÓ, trang phải strip)
const PARENT_NAME = "Phụ Huynh Bí Mật";
const PARENT_PHONE = "0999888777"; // SĐT phụ huynh — GV không được xem (câu 46)
const PARENT_EMAIL = "ph-secret-46@example.com"; // email phụ huynh — GV không được xem

let teacherEmail = "";
let className = "";
let classId = "";
let sessionId = "";
let studentId = "";

async function orgId(code: string) {
  return (await db.orgUnit.findUnique({ where: { code }, select: { id: true } }))!.id;
}
async function centerIdOf(code: string) {
  return (await db.orgUnit.findUnique({ where: { code }, select: { centerId: true } }))!.centerId!;
}

/** Login TEACHER qua form thật; chịu được cold-compile của `next dev`. */
async function loginTeacher(page: Page) {
  // KHÔNG dùng waitUntil "domcontentloaded": form Waves là controlled input —
  // fill trước khi React hydrate xong sẽ bị hydration XOÁ TRẮNG giá trị →
  // validation "Email không hợp lệ" chặn, signIn không bao giờ bắn (fail câm).
  await page.goto(`/login?callbackUrl=${encodeURIComponent("/teacher/lop")}`);
  const email = page.getByLabel("Email");
  // Điền rồi xác nhận giá trị CÒN DÍNH (hydration muộn vẫn có thể wipe sau "load")
  // — bị wipe thì toPass() điền lại tới khi ổn định.
  await expect(async () => {
    await email.fill(teacherEmail);
    await page.getByLabel("Mật khẩu").fill(TEST_PASSWORD);
    await expect(email).toHaveValue(teacherEmail, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
}

/** Mọi chuỗi PH + SĐT HV KHÔNG được xuất hiện trong HTML render (kể cả flight RSC). */
async function expectNoContactLeak(page: Page) {
  const html = await page.content();
  expect(html).not.toContain(STUDENT_PHONE);
  expect(html).not.toContain(PARENT_PHONE);
  expect(html).not.toContain(PARENT_EMAIL);
  expect(html).not.toContain(PARENT_NAME);
}

test.describe("[#06-L6] site GV (browser): không lộ contact PH / studentId trên URL", () => {
  test.beforeAll(async () => {
    await resetDb();
    // Upsert (không create): test DB dùng CHUNG giữa các phiên/suite chạy song song —
    // create theo code unique sẽ dính race "resetDb của mình + seed của suite khác".
    await db.center.upsert({
      where: { code: "CS1" },
      create: { code: "CS1", name: "CS1", slug: "cs1-gv-pii", address: "a", city: "" },
      update: {},
    });
    await db.center.upsert({
      where: { code: "CS2" },
      create: { code: "CS2", name: "CS2", slug: "cs2-gv-pii", address: "b", city: "" },
      update: {},
    });
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    const c1 = await centerIdOf("CS1");

    teacherEmail = testEmail("gv-site-pii");
    const gv = await seedUser({ email: teacherEmail, role: "TEACHER", centerId: c1 });
    const teacherRoleId = (await db.roleDef.findUnique({ where: { code: "TEACHER" }, select: { id: true } }))!.id;
    await assignUserOrgRole(SA, {
      userId: gv.id,
      orgUnitId: await orgId("CS1"),
      roleId: teacherRoleId,
      reason: "seed e2e #06 browser",
    });

    const rand = Math.random().toString(36).slice(2, 8);
    className = `Lớp Robot Alpha ${rand}`;
    const course = await db.course.create({ data: { name: `Khoá ${rand}`, slug: `ka-${rand}` }, select: { id: true } });
    // teacherId = gv → lớp vào actor.assignedClassIds (gate quyền của mọi trang teacher).
    const cls = await db.class.create({
      data: { name: className, courseId: course.id, centerId: c1, teacherId: gv.id, status: "ACTIVE" },
      select: { id: true, courseId: true },
    });
    classId = cls.id;

    const student = await db.student.create({
      data: {
        name: STUDENT_NAME,
        centerId: c1,
        phone: STUDENT_PHONE,
        parentName: PARENT_NAME,
        parentPhone: PARENT_PHONE,
        parentEmail: PARENT_EMAIL,
      },
      select: { id: true },
    });
    studentId = student.id;
    await db.enrollment.create({
      data: { studentId: student.id, classId: cls.id, courseId: cls.courseId, status: "STUDYING" },
    });

    // Buổi trong khoảng [hôm nay−3, +28] để cả /lop lẫn /lich đều thấy.
    const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const sess = await db.classSession.create({
      data: { classId: cls.id, centerId: c1, date: when, status: "SCHEDULED" },
      select: { id: true },
    });
    sessionId = sess.id;
  });

  test("[câu 46 + studentId-URL] /teacher/lop → roster: tên HV hiện, KHÔNG lộ SĐT/email PH; studentId không lên URL", async ({ page }) => {
    await loginTeacher(page);

    // (a) Danh sách lớp được phân.
    await page.goto("/teacher/lop", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Lớp của tôi" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(className)).toBeVisible();
    expect(page.url()).not.toContain(studentId);
    await expectNoContactLeak(page);

    // (b) Chọn lớp → các buổi. URL chỉ mang classId, KHÔNG studentId.
    await page.getByText(className).first().click();
    await page.waitForURL(/\/teacher\/lop\?classId=/, { timeout: 30_000 });
    expect(page.url()).toContain(classId);
    expect(page.url()).not.toContain(studentId);

    // (c) Chọn buổi → roster điểm danh. URL mang classId + sessionId, KHÔNG studentId.
    await page.locator('a[href*="sessionId="]').first().click();
    await page.waitForURL(/sessionId=/, { timeout: 30_000 });
    expect(page.url()).toContain(sessionId);
    expect(page.url()).not.toContain(studentId);

    // Roster: tên HV hiển thị (GV cần biết điểm danh ai)…
    await expect(page.getByText(STUDENT_NAME)).toBeVisible({ timeout: 30_000 });
    // …nhưng KHÔNG lộ SĐT HV lẫn tên/SĐT/email phụ huynh (kể cả trong payload RSC).
    await expectNoContactLeak(page);
  });

  test("[câu 46 + studentId-URL] /teacher/lich hiển thị lịch dạy, KHÔNG lộ contact PH; studentId không lên URL", async ({ page }) => {
    await loginTeacher(page);
    await page.goto("/teacher/lich", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Lịch dạy" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(className).first()).toBeVisible();
    expect(page.url()).not.toContain(studentId);
    await expectNoContactLeak(page);
  });
});
