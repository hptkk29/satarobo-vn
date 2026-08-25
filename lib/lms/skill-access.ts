import "server-only";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { roleManagesCenter } from "@/lib/auth/managed-centers";

// LMS-17 — quyền chấm năng lực robot, DÙNG CHUNG cho UI gate (page) lẫn server action
// (trước đây UI chỉ mở cho SUPER_ADMIN/CENTER_MANAGER, chặn nhầm GV dù backend cho phép).
//   SUPER_ADMIN · CENTER_MANAGER trong phạm vi cơ sở MÌNH QUẢN LÝ · GV/trợ giảng dạy lớp HS.
//
// ⚠️ TÌNH TRẠNG (đo 26/08/2026 bằng grep toàn repo): hàm này CHƯA có call-site sản xuất
// nào — `app/(admin)/admin/students/[id]/_actions.ts` giữ bản riêng, `.../edit/page.tsx`
// giữ bản UI riêng. Nó đang là KHUÔN MẪU sẽ bị chép lại khi ai đó nối UI gate vào, nên
// điều kiện ở đây phải đúng bằng bản server, không được lệch một ly.
//
// A-01-6 (bất biến L-A6, 25/08 — sửa 26/08/2026) — nhánh QLCS đổi từ "bằng cơ sở NEO"
// sang "cơ sở người này đang GIỮ VAI QLCS". Bản 25/08 kiểm `visibleCenterIds` AND
// `passesScope("Student", …)`, và cả hai vế đều nở theo vai KIÊM NHIỆM (kế toán cơ sở khác
// mang `students:view-all`; vai Hội sở cho `centerScope: "ALL"`) ⇒ phép AND không cắt gì.
// Lý lẽ + hai kịch bản đo được: khối chú thích đầu `lib/auth/managed-centers.ts`.
// Riêng file này KHÔNG có `scopedDb` đứng trước (đọc bằng `db` trần) ⇒ điều kiện dưới đây
// là lớp cách ly cơ sở DUY NHẤT của đường này.
export async function canAssessStudent(
  user: { id: string; role?: string | null; roles?: string[] | null; centerId: string | null },
  studentId: string,
): Promise<boolean> {
  if (hasRole(user, "SUPER_ADMIN")) return true;
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { centerId: true },
  });
  if (!student) return false;
  if (hasRole(user, "CENTER_MANAGER")) {
    const actor = await resolveActor(user.id);
    return roleManagesCenter(actor, "CENTER_MANAGER", student.centerId);
  }
  if (hasRole(user, "TEACHER")) {
    const teaches = await db.enrollment.findFirst({
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
