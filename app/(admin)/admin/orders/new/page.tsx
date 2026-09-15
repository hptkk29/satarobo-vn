import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { provinces } from "vietnam-address-data";
import { auth } from "@/lib/auth";
import { getSetting } from "@/lib/settings/service";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { nationalPhone } from "@/lib/phone";
import { loadCreateOrderFormData } from "../_actions";
import { OrderCreateForm } from "../_components/order-create-form";

export const metadata = { title: "Tạo đơn hàng | Admin" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // G-A (21/08/2026) — cổng tạo đơn là `orders:create`; `orders:manage` chỉ còn
  // quyết định có được tạo đơn KHÔNG gắn lead hay không (xem dưới).
  if (!(await checkPermission("orders:create"))) {
    redirect("/dashboard?error=unauthorized");
  }
  const canManageAll = await checkPermission("orders:manage");

  const data = await loadCreateOrderFormData();
  // Trần % giảm — THAM SỐ VẬN HÀNH (`orders.maxDiscountPercent`, mặc định 50). Đọc ở đây
  // rồi truyền xuống form: client không gọi được `getSetting`, và một hằng cứng ở client
  // là con số thứ hai sống song song với cấu hình. Server action đọc LẠI độc lập — đây
  // chỉ là lớp trải nghiệm, không phải lớp bảo vệ.
  const tranPhanTram = await getSetting("orders.maxDiscountPercent");

  // convert-v2: tạo đơn GẮN lead (từ trang convert). Đọc lead trong tầm nhìn cơ sở
  // actor (scopedDb) — ngoài scope/không tồn tại → bỏ qua leadId (đơn walk-in thường).
  const { leadId } = await searchParams;
  let lead: { id: string; parentName: string; phone: string; email: string | null; centerId: string | null } | null = null;
  let leadAssignedToId: string | null = null;
  if (leadId) {
    const actor = await resolveActor(session.user.id);
    const row = await scopedDb(actor).lead.findUnique({
      where: { id: leadId },
      select: { id: true, parentName: true, phone: true, email: true, centerId: true, assignedToId: true },
    });
    if (row) {
      const { assignedToId, ...rest } = row;
      lead = rest;
      leadAssignedToId = assignedToId;
    }
  }

  // G-A — Sale (chỉ có `orders:create`) chỉ tạo đơn cho khách CỦA MÌNH. Chặn ngay
  // ở trang thay vì để họ điền xong cả form rồi mới báo lỗi khi bấm Lưu.
  // Server action vẫn kiểm lại độc lập — đây chỉ là lớp trải nghiệm, không phải
  // lớp bảo vệ (gọi thẳng action vẫn bị `checkOrderCreateOwnership()` chặn).
  if (!canManageAll) {
    if (!lead) {
      redirect("/leads?error=chon-khach-truoc-khi-tao-don");
    }
    if (leadAssignedToId !== session.user.id) {
      redirect(`/leads/${lead.id}?error=khong-phai-khach-cua-ban`);
    }
  }

  return (
    /* Trần 104rem (1664px) thay cho `max-w-4xl` (896px) cũ. Form nay hai cột nên cần
       bề ngang thật; vẫn phải CÓ trần vì ở 4k/8k một form trải hết màn thì mắt phải
       quét cả mét giữa nhãn và ô nhập. Cùng con số với màn chi tiết đơn. */
    <div className="mx-auto w-full max-w-[104rem]">
      <Link
        href={lead ? `/leads/${lead.id}/convert` : "/orders"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {lead ? "Quay lại chốt lead" : "Quay lại danh sách"}
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-foreground">
        Tạo đơn hàng thủ công
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {lead
          ? `Đơn gắn với lead "${lead.parentName}" — sau khi ghi nhận thanh toán sẽ đủ điều kiện chốt (convert).`
          : "Dùng cho khách walk-in tại trung tâm hoặc nhập tay đơn đã thoả thuận offline. Một đơn nhận NHIỀU dòng — phụ huynh có hai con học hai khoá thì vẫn là một đơn, một công nợ, một mã QR."}
      </p>

      <OrderCreateForm
        paymentMethods={data.paymentMethods}
        courses={data.courses}
        products={data.products}
        centers={data.centers}
        students={data.students}
        provinces={provinces.map((p) => ({ value: p.id, label: p.name }))}
        leadId={lead?.id ?? null}
        defaultCustomer={
          lead
            ? {
                name: lead.parentName,
                // DẠNG NỘI ĐỊA (`09…`), không phải chuỗi thô trong DB.
                //
                // `Lead.phone` lưu cả `84…` lẫn `0…` (di sản 6 hàm chuẩn hoá cũ) — đo
                // trên `satarobo_local`: lead mẫu mang `84930000001`, và trước bản này ô
                // SĐT hiện đúng chuỗi đó. Không sai về tiền (`phoneVn` nhận cả hai và
                // chuẩn hoá lại) nhưng LỆCH với đường kia: chọn lead từ gợi ý SĐT thì
                // `chonLead` đã đổi về `09…`. Hai đường vào cùng một ô mà hiện hai kiểu
                // là thứ người bán sẽ hỏi, và là thứ không ai trả lời được.
                phone: nationalPhone(lead.phone) ?? lead.phone,
                email: lead.email ?? "",
              }
            : undefined
        }
        defaultCenterId={lead?.centerId ?? null}
        // Sale (không có `orders:manage`) KHÔNG đổi được cơ sở: cổng server đã ép theo
        // cơ sở của lead, nên để ô mở là cho họ chọn một thứ sẽ bị vứt im lặng.
        lockCenter={!canManageAll}
        tranPhanTram={tranPhanTram}
      />
    </div>
  );
}
