// app/(admin)/admin/lop-trial/moi/page.tsx — GĐ2. Tạo lớp trải nghiệm.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { layLuaChonTaoLop } from "../_lib/queries";
import { layCauHinhKhung } from "@/lib/trial/khung-gio-db";
import { vnTodayUtc } from "@/lib/trial/service";
import { vnYmd } from "@/lib/time/vn";
import { CreateForm } from "../_components/create-form";
import { BulkForm } from "../_components/bulk-form";

export const dynamic = "force-dynamic";

export default async function TaoLopTrialPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Trang này CHỈ để ghi → gác bằng quyền ghi, không phải trials:view.
  //
  // 22/09/2026 — đổi sang `trials:create-class`: Sale vẫn có `trials:manage` (họ cần nó để
  // thêm case + xếp học viên), nên cổng cũ ở đây không chặn được ai. Gác CẢ TRANG chứ
  // không chỉ giấu nút: trên thanh địa chỉ ai cũng gõ được `/lop-trial/moi`.
  if (!(await checkPermission("trials:create-class"))) redirect("/lop-trial");

  const actor = await resolveActor(session.user.id);
  // 28/08 — form chỉ còn CƠ SỞ + KHOÁ. Không nạp giáo viên/phòng/cấu hình số buổi nữa:
  // ba thứ đó chuyển xuống khối "Thêm buổi học" ở trang chi tiết lớp.
  // `courses` KHÔNG còn dùng: ô "Khoá trải nghiệm" đã gỡ khỏi cả hai form theo chốt
  // 22/09/2026 vòng 2 (QLCS mở lớp chưa biết học viên nào sẽ vào, nên chưa biết khoá).
  const { centers } = await layLuaChonTaoLop(actor);
  // Khung giờ đọc ở SERVER rồi truyền xuống — ô chọn trên form phải bày đúng thứ server
  // sẽ nhận. "Hôm nay" cũng tính ở server theo lịch VN: để client đọc đồng hồ máy là máy
  // đặt sai múi giờ sẽ mở lớp nhầm ngày.
  const cauHinhKhung = await layCauHinhKhung();
  const homNay = vnYmd(vnTodayUtc());

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
        Mỗi lớp là MỘT NGÀY và MỘT KHUNG GIỜ. Sale chọn lớp theo ngày hẹn khách, rồi thêm
        case trong đúng khung giờ này và chọn giáo viên có ca làm phủ trọn khung đó.
      </p>

      {/* `coSoCuaToi` — cơ sở của CHÍNH người đang mở màn, để form đặt mặc định.
          Chủ dự án 18/09: "set mặc định cơ sở là cơ sở của sale đó nhưng vẫn có thể chọn
          cơ sở khác". Bản cũ mặc định `centers[0]` — với Sale một cơ sở thì trùng nhau
          nên không ai thấy, nhưng với người nhìn được nhiều cơ sở (Hội sở / Quản trị) thì
          đó là cơ sở ĐẦU BẢNG CHỮ CÁI, không phải cơ sở của họ. */}
      <CreateForm
        centers={centers}
        coSoCuaToi={session.user.centerId ?? null}
        cauHinhKhung={cauHinhKhung}
        homNay={homNay}
      />

      <div className="space-y-2 pt-2">
        <h3 className="text-base font-semibold text-foreground">Hoặc mở lớp cho cả kỳ</h3>
        <p className="text-sm text-muted-foreground">
          Chọn khoảng ngày và các thứ — hệ thống mở lớp cho mọi ngày khớp, theo đúng khung
          giờ đã cấu hình của từng thứ. Dùng khi xếp lịch đầu tháng.
        </p>
        <BulkForm
          centers={centers}
          coSoMacDinh={
            (session.user.centerId && centers.some((c) => c.id === session.user.centerId)
              ? session.user.centerId
              : centers[0]?.id) ?? ""
          }
          cauHinhKhung={cauHinhKhung}
          homNay={homNay}
        />
      </div>
    </div>
  );
}
