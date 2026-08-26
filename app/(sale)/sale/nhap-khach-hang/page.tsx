// app/(sale)/sale/nhap-khach-hang/page.tsx — biểu mẫu nhập khách, bản site Sale.
//
// Trước 23/08/2026, tư vấn viên gõ `/nhap-khach-hang` trên host sale bị 307 sang
// host admin — tức muốn nhập một khách là bị đá khỏi site của mình rồi phải bấm
// quay lại. Nay site Sale có bản của nó.
//
// ⚠️ Thân trang cố ý MỎNG và giống hệt bản admin, vì cả hai chỉ là chỗ ghép của
// đúng ba mảnh dùng chung:
//     `loadIntakeCenterOptions()` · `<QuickLeadForm>` · `quickLeadSubmit`
// Chép logic sang đây là mở đường cho hai biểu mẫu trôi lệch nhau — đúng kiểu
// hỏng đã gặp với hai màn nhận xét buổi học. Đường ghi vẫn là `ingestIntakeLead`,
// không mở đường ghi lead thứ hai.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { loadIntakeCenterOptions } from "@/lib/lead/intake/center-options";
import { QuickLeadForm } from "@/components/lead-intake/quick-lead-form";

export const metadata = { title: "Nhập khách hàng | Tư vấn tuyển sinh" };
export const dynamic = "force-dynamic";

export default async function SaleNhapKhachHangPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fnhap-khach-hang");
  // Layout site Sale đã gác đăng nhập + vai Sale thuần; đây là gate QUYỀN riêng
  // của trang. Server Action vẫn tự kiểm lần nữa — nó là endpoint gọi thẳng được,
  // gate trang chưa bao giờ là đủ.
  if (!(await checkAnyPermission(PAGE_GATES["/sale/nhap-khach-hang"]))) {
    redirect("/sale");
  }

  const actor = await resolveActor(session.user.id);
  const centers = await loadIntakeCenterOptions(actor);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Nhập khách hàng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhập nhanh khách thu được từ quảng cáo, sự kiện, hoặc tư vấn trực tiếp.
          Hệ thống tự kiểm tra trùng số điện thoại và tự giao cho tư vấn viên theo
          cơ sở.
        </p>
      </div>
      <QuickLeadForm centers={centers} />
    </div>
  );
}
