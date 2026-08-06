// Logic lọc giáo viên theo cơ sở — THUẦN (không đụng DB) để dùng chung 3 nơi:
//  - form tạo/sửa lớp (client) lọc dropdown GV theo đơn vị đang chọn,
//  - guard server-side createClass/updateClass (defense-in-depth),
//  - unit test (chạy ở CI lane mặc định, không cần DB).
// Tách khỏi lib/teachers/assignable.ts (import @/lib/db) để KHÔNG kéo Prisma vào
// client bundle. R2-RBAC-3 — cách ly CS1↔CS2 khi phân công GV.

export type TeacherCenterLite = { id: string; centerId: string | null };

/**
 * Lọc GV theo `centerId` của đơn vị đang chọn, nhưng LUÔN giữ các id trong
 * `keepIds` (GV đang chọn / đang gán sẵn của lớp) để `<Select>` không tự rớt giá
 * trị đang chọn — gốc bug "Lớp học hiện trống". `centerId == null` (đơn vị HO không
 * có cơ sở) → chỉ giữ keepIds.
 */
export function filterTeachersByCenter<T extends TeacherCenterLite>(
  teachers: T[],
  centerId: string | null,
  keepIds: (string | null | undefined)[] = [],
  hoCenterIds: string[] = [],
): T[] {
  const keep = new Set(keepIds.filter(Boolean) as string[]);
  if (centerId == null) return teachers.filter((t) => keep.has(t.id));
  const ho = new Set(hoCenterIds);
  return teachers.filter(
    (t) => t.centerId === centerId || (t.centerId != null && ho.has(t.centerId)) || keep.has(t.id),
  );
}

/**
 * GV chính/trợ giảng được gán có hợp lệ cho lớp ở `centerId` không. Lớp HO/không
 * cơ sở (centerId null) → không ràng buộc. Trả message lỗi (VI) hoặc null nếu OK.
 * Backfill User.centerId GV = 100% (R2-RBAC-1) nên GV centerId null = không hợp lệ
 * cho lớp có cơ sở (cũng bắt được teacherId không tồn tại → centerId undefined).
 */
export function teacherCenterAssignmentError(
  centerId: string | null,
  assigned: { id: string; centerId: string | null | undefined }[],
  hoCenterIds: string[] = [],
): string | null {
  if (!centerId) return null;
  const ho = new Set(hoCenterIds);
  for (const t of assigned) {
    if (t.centerId === centerId) continue;
    // GV thuộc HỘI SỞ = nguồn lực chung, được điều đi dạy ở mọi cơ sở (chốt 06/08:
    // GV Đà Nẵng về HO rồi phân lịch xuống CS). KHÁC với GV thuộc CS khác — vẫn chặn.
    if (t.centerId != null && ho.has(t.centerId)) continue;
    // centerId null/undefined = GV chưa gán cơ sở HOẶC teacherId không tồn tại → chặn.
    return t.centerId == null
      ? "Giáo viên/trợ giảng không hợp lệ hoặc chưa gán đơn vị"
      : "Giáo viên/trợ giảng phải thuộc cùng cơ sở với lớp, hoặc thuộc Hội sở";
  }
  return null;
}
