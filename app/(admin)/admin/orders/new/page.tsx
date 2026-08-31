import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { provinces } from "vietnam-address-data";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
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
    <div className="max-w-4xl">
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
          : "Dùng cho khách walk-in tại trung tâm hoặc nhập tay đơn đã thoả thuận offline."}
      </p>

      <OrderCreateForm
        paymentMethods={data.paymentMethods}
        courses={data.courses}
        products={data.products}
        centers={data.centers}
        provinces={provinces.map((p) => ({ value: p.id, label: p.name }))}
        leadId={lead?.id ?? null}
        defaultCustomer={
          lead
            ? { name: lead.parentName, phone: lead.phone, email: lead.email ?? "" }
            : undefined
        }
        defaultCenterId={lead?.centerId ?? null}
        // Sale (không có `orders:manage`) KHÔNG đổi được cơ sở: cổng server đã ép theo
        // cơ sở của lead, nên để ô mở là cho họ chọn một thứ sẽ bị vứt im lặng.
        lockCenter={!canManageAll}
      />
    </div>
  );
}
