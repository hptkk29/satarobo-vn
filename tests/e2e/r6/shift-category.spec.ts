/**
 * R6-B2 (WorkShiftConfig) + R6-B3 (CourseCategoryDef). Postgres LOCAL (.env.test).
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import {
  getShiftConfig,
  upsertShiftConfig,
  deleteShiftConfig,
  seedDefaultShifts,
  DEFAULT_SHIFTS,
} from "../../../lib/attendance/shift-config";
import {
  createCategory,
  deleteCategory,
  backfillCourseCategories,
} from "../../../lib/courses/category-service";

test.describe("[R6-B2] WorkShift config", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[R6-B2-T12-01] seed 3 ca mặc định + đọc lại từ DB", async () => {
    const n = await seedDefaultShifts(null);
    expect(n).toBe(3);
    const sang = await getShiftConfig("CA_SANG");
    expect(sang.startTime).toBe("08:00");
    expect(sang.toleranceMinutes).toBe(15);
  });

  test("[R6-B2-T1-01] CRUD: đổi giờ/tolerance per-center → check-in đọc giá trị mới", async () => {
    const c = await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-sh", address: "a", city: "" } });
    await upsertShiftConfig({ centerId: c.id, code: "CA_SANG", name: "Ca sáng CS1", startTime: "07:30", endTime: "11:00", toleranceMinutes: 10 });
    const cs1 = await getShiftConfig("CA_SANG", { centerId: c.id });
    expect(cs1.startTime).toBe("07:30");
    expect(cs1.toleranceMinutes).toBe(10);
    // cơ sở khác chưa cấu hình → default trong code.
    expect((await getShiftConfig("CA_SANG", { centerId: "other" })).startTime).toBe(DEFAULT_SHIFTS.CA_SANG.startTime);
  });

  test("[R6-B2-T7-01] ca đang dùng (có ShiftRegistration) → không xoá", async () => {
    const cfg = await upsertShiftConfig({ centerId: null, code: "CA_TOI", name: "Ca tối", startTime: "18:00", endTime: "21:00", toleranceMinutes: 15 });
    const user = await db.user.create({ data: { email: "gv-sh@test.local", name: "GV A", role: "TEACHER" } });
    await db.shiftRegistration.create({ data: { userId: user.id, date: new Date("2026-06-08"), shifts: ["CA_TOI"] } });
    const res = await deleteShiftConfig(cfg.id);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("đang được dùng");
  });
});

test.describe("[R6-B3] CourseCategory model", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[R6-B3-T1-01] thêm danh mục → tạo course thuộc danh mục", async () => {
    const cat = await createCategory({ code: "STEM_NEW", name: "STEM mới" });
    const course = await db.course.create({ data: { name: "Khoá STEM", slug: "khoa-stem-b3", categoryId: cat.id } });
    const withCat = await db.course.findUnique({ where: { id: course.id }, include: { categoryDef: true } });
    expect(withCat!.categoryDef!.name).toBe("STEM mới");
  });

  test("[R6-B3-T7-01] danh mục có course → không xoá", async () => {
    const cat = await createCategory({ code: "HAS_COURSE", name: "Có khoá" });
    await db.course.create({ data: { name: "K1", slug: "k1-b3", categoryId: cat.id } });
    const res = await deleteCategory(cat.id);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("đang có khoá");
  });

  test("[R6-B3-T12-01] backfill enum → categoryId", async () => {
    await createCategory({ code: "LAP_TRINH_ROBOT", name: "Lập trình Robot" });
    const c = await db.course.create({ data: { name: "LTR", slug: "ltr-b3", category: "LAP_TRINH_ROBOT" } });
    const n = await backfillCourseCategories();
    expect(n).toBe(1);
    const after = await db.course.findUnique({ where: { id: c.id }, select: { categoryId: true } });
    expect(after!.categoryId).not.toBeNull();
    // chạy lại idempotent → 0.
    expect(await backfillCourseCategories()).toBe(0);
  });
});
