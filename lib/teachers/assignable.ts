import { db } from "@/lib/db";

export type AssignableTeacher = {
  id: string;
  name: string | null;
  role: string;
};

/**
 * Nguồn DUY NHẤT xác định "giáo viên có thể phân lớp" (fix #9 — trước đây mỗi form
 * lọc một kiểu: trang Lớp học dùng `roles hasSome [TEACHER, CENTER_MANAGER]` nên
 * lọt quản lý/sale; trang Lớp trải nghiệm dùng `roles has TEACHER` strict nên chỉ
 * thấy 2 người).
 *
 * Điều kiện 1 user là giáo viên hợp lệ:
 *  - active + chưa xoá, VÀ
 *  - (có role TEACHER trong roles[]  HOẶC  có TeacherProfile status = ACTIVE).
 *
 * KHÔNG gồm người chỉ là CENTER_MANAGER/SALES_CSM thuần. Người đa vai trò mà CÓ
 * TEACHER vẫn xuất hiện.
 *
 * @param opts.includeIds  luôn kèm các user id này (vd: GV đang được gán vào lớp
 *   dù dữ liệu của họ không còn match điều kiện) để `<Select>` không tự rớt giá
 *   trị đang chọn — đây là gốc của bug "gán từ trang Giáo viên nhưng Lớp học hiện
 *   trống".
 */
export async function getAssignableTeachers(opts?: {
  includeIds?: (string | null | undefined)[];
}): Promise<AssignableTeacher[]> {
  const includeIds = (opts?.includeIds ?? []).filter(Boolean) as string[];

  const rows = await db.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { isActive: true, roles: { has: "TEACHER" } },
        { isActive: true, teacherProfile: { is: { status: "ACTIVE" } } },
        ...(includeIds.length ? [{ id: { in: includeIds } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });

  return rows;
}
