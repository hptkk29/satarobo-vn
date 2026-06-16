/**
 * R7-10 — Khung chương trình: resize N buổi + trạng thái buổi + đề xuất chỉnh sửa.
 * Postgres LOCAL (.env.test). SKELETON — chưa chạy trong CI (cần seed đầy đủ).
 *
 * RTM: AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4 · race↔C5.
 *
 * Service nghiệp vụ: lib/lms/curriculum.ts (resizeCurriculum/planResize/setLessonStatus/
 * archiveLesson). Phần gate/UI ở app/(admin)/admin/curriculums/_actions.ts.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import {
  planResize,
  resizeCurriculum,
  archiveLesson,
  setLessonStatus,
} from "../../../lib/lms/curriculum";

// ── helpers ────────────────────────────────────────────────────────────────
async function makeCurriculum(lessonCount: number): Promise<string> {
  const course = await db.course.create({
    data: { name: "R7-10 Course", slug: `r7-10-${Date.now()}-${Math.random()}` },
  });
  const curriculum = await db.curriculum.create({
    data: { courseId: course.id, name: "R7-10 Curriculum", version: 1 },
  });
  for (let i = 1; i <= lessonCount; i++) {
    await db.lesson.create({
      data: { curriculumId: curriculum.id, order: i, title: `Buổi ${i}` },
    });
  }
  return curriculum.id;
}

test.describe("[R7-10] Curriculum sessions", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  // AC1 / C1 — sinh đủ N + tăng giữ nguyên data cũ.
  test("[R7-10-C1] tạo 12 buổi → 12 mục; 12→14 append giữ data cũ", async () => {
    const id = await makeCurriculum(12);
    expect(await db.lesson.count({ where: { curriculumId: id, archivedAt: null } })).toBe(12);

    const r = await resizeCurriculum({ curriculumId: id, targetN: 14 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(2);

    const active = await db.lesson.findMany({
      where: { curriculumId: id, archivedAt: null },
      orderBy: { order: "asc" },
    });
    expect(active).toHaveLength(14);
    // Buổi 1..12 cũ giữ nguyên title.
    expect(active[0].title).toBe("Buổi 1");
    expect(active[11].title).toBe("Buổi 12");
    // Buổi mới = INCOMPLETE.
    expect(active[12].status).toBe("INCOMPLETE");
  });

  // AC2 / C2 — giảm có exam → cần confirm; archive (soft) không mất link.
  test("[R7-10-C2] 12→10 buổi 11 có exam → cần confirm; archive giữ link", async () => {
    const id = await makeCurriculum(12);
    const lesson11 = await db.lesson.findFirst({ where: { curriculumId: id, order: 11 } });
    expect(lesson11).not.toBeNull();
    const exam = await db.exam.create({
      data: { title: "Đề thi buổi 11", lessonId: lesson11!.id },
    });

    // Không confirm → chặn.
    const plan = await planResize(id, 10);
    expect(plan.needsConfirm).toBe(true);
    const noConfirm = await resizeCurriculum({ curriculumId: id, targetN: 10 });
    expect(noConfirm.ok).toBe(false);
    if (!noConfirm.ok) expect(noConfirm.code).toBe("NEEDS_CONFIRM");

    // Confirm → archive (soft).
    const ok = await resizeCurriculum({ curriculumId: id, targetN: 10, confirm: true });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.archived).toBe(2);

    // Buổi 11 vẫn đọc được (archivedAt set, không xóa) + exam link còn nguyên.
    const archived = await db.lesson.findUnique({ where: { id: lesson11!.id } });
    expect(archived).not.toBeNull();
    expect(archived!.archivedAt).not.toBeNull();
    const examAfter = await db.exam.findUnique({ where: { id: exam.id } });
    expect(examAfter!.lessonId).toBe(lesson11!.id);
    expect(await db.lesson.count({ where: { curriculumId: id, archivedAt: null } })).toBe(10);
  });

  // AC2 edge — archive buổi IN_USE bị chặn.
  test("[R7-10-C2b] archive buổi IN_USE → chặn", async () => {
    const id = await makeCurriculum(3);
    const l = await db.lesson.findFirst({ where: { curriculumId: id, order: 3 } });
    await setLessonStatus({ lessonId: l!.id, status: "IN_USE", actorId: null });
    const res = await archiveLesson({ lessonId: l!.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("IN_USE");
  });

  // AC3 / C3 — LOCKED chặn sửa nội dung; unlock chỉ Đào tạo (gate ở action).
  test.fixme("[R7-10-C3] buổi LOCKED chặn sửa; unlock bởi Đào tạo + audit", async () => {
    // TODO: login TEACHER → sửa buổi LOCKED qua UI bị chặn;
    //       login CENTER_MANAGER → mở khóa (setLessonStatusAction) → AuditLog "UNLOCK".
  });

  // AC4 / C4 — GV gửi đề xuất → Đào tạo reject + phản hồi → GV thấy trạng thái.
  test.fixme("[R7-10-C4] GV đề xuất → Đào tạo reject + phản hồi", async () => {
    // TODO: TEACHER submitLessonChangeRequest → OPEN;
    //       CENTER_MANAGER handleLessonChangeRequest(REJECTED, response) → status+response;
    //       GV xem lại thấy REJECTED + nội dung phản hồi.
  });

  // C5 — 2 resize song song → optimistic lock (1 thắng, 1 báo reload).
  test("[R7-10-C5] 2 resize giảm song song → optimistic lock", async () => {
    const id = await makeCurriculum(12);
    const tail = await db.lesson.findMany({
      where: { curriculumId: id, order: { gt: 10 } },
      select: { id: true, version: true },
    });
    // Cùng snapshot version (như 2 người mở cùng lúc).
    const expectedVersions: Record<string, number> = {};
    for (const l of tail) expectedVersions[l.id] = l.version;

    const [a, b] = await Promise.all([
      resizeCurriculum({ curriculumId: id, targetN: 10, confirm: true, expectedVersions }),
      resizeCurriculum({ curriculumId: id, targetN: 10, confirm: true, expectedVersions }),
    ]);

    // Tính an toàn (optimistic lock): ĐÚNG 1 lần archive thật (archived===2); lần còn
    // lại KHÔNG được archive trùng — hoặc CONFLICT (version lệch) hoặc noop (re-plan thấy
    // đã 10 buổi, tuỳ thời điểm chạy). Quan trọng: KHÔNG double-archive + hội tụ 10 buổi.
    const archivers = [a, b].filter((r) => r.ok && r.archived === 2);
    const losers = [a, b].filter(
      (r) => (r.ok && r.archived === 0) || (!r.ok && r.code === "CONFLICT"),
    );
    expect(archivers).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(await db.lesson.count({ where: { curriculumId: id, archivedAt: null } })).toBe(10);
  });
});
