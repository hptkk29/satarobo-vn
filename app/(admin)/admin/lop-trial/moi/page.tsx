// app/(admin)/admin/lop-trial/moi/page.tsx — GĐ2. Tạo lớp trải nghiệm.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { getSetting } from "@/lib/settings/service";
import { layCauHinh, layLuaChonTaoLop } from "../_lib/queries";
import { CreateForm } from "../_components/create-form";

export const dynamic = "force-dynamic";

export default async function TaoLopTrialPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Trang này CHỈ để ghi → gác bằng quyền ghi, không phải trials:view.
  if (!(await checkPermission("trials:manage"))) redirect("/lop-trial");

  const actor = await resolveActor(session.user.id);
  const [{ centers, rooms }, teachers, config, maxSessions] = await Promise.all([
    layLuaChonTaoLop(actor),
    // Lúc tạo lớp chưa biết cơ sở nào được chọn nên nạp toàn bộ GV khả dụng; ràng buộc
    // thật nằm ở server action. Đây là hành vi của màn cũ, giữ nguyên để nghiệm thu
    // không lệch — lệch với trang chi tiết (lọc theo cơ sở) là nợ đã biết, xử lý riêng.
    getAssignableTeachers({}),
    // Số buổi mặc định LẤY TỪ CẤU HÌNH chương trình, không hardcode ở form: hardcode là
    // cách giá trị mặc định lặng lẽ đi ngược chốt nghiệp vụ sau mỗi lần đổi cấu hình.
    layCauHinh(actor),
    // Trần đọc ở cấp GLOBAL (không truyền orgUnitId) vì cơ sở còn chưa được chọn khi
    // form mở ra. Cơ sở có override thấp hơn thì server action vẫn là chốt chặn cuối.
    getSetting("crm.trialMaxSessions"),
  ]);

  return (
    <div className="space-y-4">
      <Link
        href="/lop-trial"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      <h2 className="text-lg font-semibold text-foreground">Tạo lớp trải nghiệm</h2>
      <p className="text-sm text-muted-foreground">
        Lớp là một khung giờ dùng lại nhiều lần, không gắn ngày khai giảng. Tạo xong nhớ
        thêm buổi, vì lớp chưa có buổi thì không xếp được học viên.
      </p>

      <CreateForm
        centers={centers}
        rooms={rooms}
        teachers={teachers.map((t) => ({ id: t.id, name: t.name ?? "(không tên)" }))}
        defaultSessionCount={config?.sessionCount ?? maxSessions}
        maxSessions={maxSessions}
      />
    </div>
  );
}
