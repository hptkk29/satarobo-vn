// lib/lms/session-ownership.ts — #06 (L6): predicate THUẦN "buổi có thuộc GV này không".
//
// Tách khỏi file 'use server' (chỉ export async được) để unit-test được + tái dùng ở cả
// action lẫn e2e. Buổi THUỘC GV khi:
//   - lớp ∈ assignedClassIds (GV đứng lớp / trợ giảng — resolveActor nạp từ Class), HOẶC
//   - GV là người DẠY THAY buổi này (substituteTeacherId === userId), HOẶC
//   - GV là người THỰC DẠY buổi này (actualTeacherId === userId).
// Cách ly CƠ SỞ do scopedDb(actor).findUnique lo (IDOR → null); predicate này chỉ xét
// quyền-sở-hữu-buổi, KHÔNG chạm dữ liệu PH (câu 46).
export function isSessionOwnedByTeacher(
  session: {
    classId: string;
    substituteTeacherId: string | null;
    actualTeacherId: string | null;
  },
  teacher: { userId: string; assignedClassIds: ReadonlySet<string> },
): boolean {
  return (
    teacher.assignedClassIds.has(session.classId) ||
    session.substituteTeacherId === teacher.userId ||
    session.actualTeacherId === teacher.userId
  );
}
