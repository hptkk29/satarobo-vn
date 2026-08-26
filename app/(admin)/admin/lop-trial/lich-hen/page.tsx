// app/(admin)/admin/lop-trial/lich-hen/page.tsx — GĐ2.
// Mặt phẳng V1: buổi hẹn học thử 1-1 gắn thẳng vào lead (model TrialClass).
// Thay màn /admin/trials cũ. CỐ Ý không gộp chung bảng với lớp trải nghiệm: hai bên
// là hai model khác nhau, gộp được thì đã gộp từ lâu.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission, canViewLeadPii } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { layDanhSachHen } from "../_lib/queries";
import { BookingFilterChips } from "../_components/booking-filter-chips";
import { SearchForm } from "../_components/search-form";
import { BookingList } from "../_components/booking-list";

export const dynamic = "force-dynamic";

export default async function LichHenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:view"))) redirect("/dashboard");

  const { status, q } = await searchParams;
  const canManage = await checkPermission("trials:manage");
  // Chỉ GV THUẦN mới bị ép chỉ thấy buổi của mình. Người kiêm nhiệm (quản lý cơ sở kiêm
  // dạy) phải thấy cả buổi của người khác lẫn buổi CHƯA gán ai để còn xếp lịch.
  const ownTeacherId =
    hasRole(session.user, "TEACHER") && !canManage ? session.user.id : null;

  const actor = await resolveActor(session.user.id);
  // S-1 — màn này mở cho `trials:view` (QL cơ sở + Sale + GV + Đào tạo) nhưng chỉ
  // Sale có `leads:view-pii`. Hỏi quyền thật thay vì suy từ vai: quyền còn có thể
  // bị thu theo từng người bằng grant.
  const canViewPii = await canViewLeadPii();
  // CỐ Ý chạy tuần tự, không Promise.all: danh sách GV phải kèm `includeIds` là các GV
  // ĐANG được gán, mà chỉ biết được sau khi có bookings.
  const { bookings, rooms, classes } = await layDanhSachHen(actor, status, {
    ownTeacherId,
    q,
    canViewPii,
  });
  const teachers = await getAssignableTeachers({
    centerIds: actor.visibleCenterIds,
    // Thiếu `includeIds` là bug ÂM: GV đã đổi cơ sở hoặc nghỉ việc rớt khỏi danh sách
    // ⇒ `<select>` không khớp `value` nên hiện TRỐNG, trong khi tiêu đề thẻ vẫn in tên
    // GV đó. Người dùng sửa ghi chú rồi bấm "Lưu lịch" là gỡ luôn phân công mà không
    // hề biết. Giữ GV đang gán trong danh sách để ô luôn hiển thị đúng hiện trạng.
    includeIds: bookings.map((b) => b.teacherId),
  });

  return (
    <div className="space-y-4">
      <BookingFilterChips current={status} q={q} />

      <SearchForm
        action="/lop-trial/lich-hen"
        placeholder={
          canViewPii
            ? "Tìm theo tên phụ huynh, SĐT hoặc tên con…"
            : "Tìm theo tên phụ huynh hoặc tên con…"
        }
        defaultValue={q}
        hidden={{ status }}
      />

      <BookingList
        bookings={bookings}
        teachers={teachers.map((t) => ({ id: t.id, name: t.name ?? "(không tên)" }))}
        rooms={rooms}
        classes={classes}
        canManage={canManage}
      />
    </div>
  );
}
