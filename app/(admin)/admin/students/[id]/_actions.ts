"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RoboticsSkill, SkillLevel } from "@prisma/client";
import { hasRole } from "@/lib/auth/permissions";
import { getFreshGateUser } from "@/lib/auth/fresh-gate-user";
import { resolveActor } from "@/lib/auth/actor";
import { roleManagesCenter } from "@/lib/auth/managed-centers";
import { scopedDb } from "@/lib/db-scope";

type Result = { ok: true } | { ok: false; error: string };

// Quyền chấm năng lực: SUPER_ADMIN, QLCS trong phạm vi cơ sở MÌNH QUẢN LÝ, hoặc GV dạy
// lớp HS đang học.
//
// A-01-6 (bất biến L-A6, 25/08 — sửa 26/08/2026) — nhánh QLCS đổi từ "bằng cơ sở NEO
// (`user.centerId`, ảnh chụp lúc đăng nhập)" sang "cơ sở người này đang giữ vai QLCS".
//
// ⚠️ Bản 25/08 kiểm `visibleCenterIds` AND `passesScope("Student", …)` và CẢ HAI vế đều
// sai chỗ: `passesScope` ở đây TRÙNG đúng lớp lọc mà `sdb.student.findUnique` vừa chạy
// (cùng gọi `getModelVisibleCenterIds("Student", actor)`), nên nó không thêm lớp nào; còn
// `students:view-all` của một vai KIÊM NHIỆM (CENTER_ACCOUNTANT@CS2, hay HO_MARKETING@HO
// khi tài khoản kiêm MARKETING) kéo cơ sở lạ vào cả hai vế. Kết quả: QLCS CS1 ghi được
// bản ghi năng lực lên học viên CS2. Lý lẽ + hai kịch bản đo được: khối chú thích đầu
// `lib/auth/managed-centers.ts`.
//
// 26/08 — vai đọc TỪ DB (`getFreshGateUser`) chứ không từ JWT, đồng bộ với cổng buổi học
// (`canManageSessionClass`): gỡ vai QLCS trong DB phải có tác dụng ngay, không đợi người
// đó đăng xuất. `session.user` (JWT) không mang mảng `roles` nên `hasRole` trên nó còn bỏ
// sót cả vai phụ.
async function canAssessStudent(
  user: { id: string; role: string; centerId: string | null },
  studentId: string,
): Promise<boolean> {
  const fresh = await getFreshGateUser(user.id);
  const u = fresh ?? user;
  if (hasRole(u, "SUPER_ADMIN")) return true;
  const actor = await resolveActor(user.id);
  const sdb = scopedDb(actor);
  const student = await sdb.student.findUnique({
    where: { id: studentId },
    select: { centerId: true },
  });
  if (!student) return false;
  if (hasRole(u, "CENTER_MANAGER")) {
    return roleManagesCenter(actor, "CENTER_MANAGER", student.centerId);
  }
  if (hasRole(u, "TEACHER")) {
    const teaches = await sdb.enrollment.findFirst({
      where: {
        studentId,
        class: { OR: [{ teacherId: user.id }, { assistantId: user.id }] },
      },
      select: { id: true },
    });
    return !!teaches;
  }
  return false;
}

const skillsSchema = z.object({
  studentId: z.string().min(1),
  // LMS-17 — gắn đánh giá vào buổi/bài (tuỳ chọn; null = đánh giá tổng).
  classSessionId: z.string().min(1).optional().nullable(),
  lessonId: z.string().min(1).optional().nullable(),
  items: z
    .array(
      z.object({
        skill: z.nativeEnum(RoboticsSkill),
        level: z.nativeEnum(SkillLevel),
        note: z.string().trim().max(1000).optional().or(z.literal("")),
      }),
    )
    .max(10),
});

/** LMS-5 — lưu đánh giá năng lực (mỗi lần lưu = bản ghi lịch sử mới). */
export async function saveStudentSkills(input: unknown): Promise<Result> {
  const parsed = skillsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { studentId, items, classSessionId, lessonId } = parsed.data;
  if (items.length === 0) return { ok: true };

  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const allowed = await canAssessStudent(
    { id: session.user.id, role: session.user.role, centerId: session.user.centerId },
    studentId,
  );
  if (!allowed) return { ok: false, error: "Không có quyền chấm năng lực học sinh này" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  try {
    await sdb.studentSkillAssessment.createMany({
      data: items.map((it) => ({
        studentId,
        skill: it.skill,
        level: it.level,
        note: it.note || null,
        assessedById: session.user.id,
        classSessionId: classSessionId ?? null,
        lessonId: lessonId ?? null,
      })),
    });
  } catch (err) {
    return { ok: false, error: `Lỗi lưu năng lực: ${err instanceof Error ? err.message : "Unknown"}` };
  }

  revalidatePath(`/students/${studentId}/edit`);
  return { ok: true };
}
