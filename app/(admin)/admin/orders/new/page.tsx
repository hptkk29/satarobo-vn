import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
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
  if (!can(session.user, "orders:manage")) {
    redirect("/dashboard?error=unauthorized");
  }

  const data = await loadCreateOrderFormData();

  // convert-v2: tạo đơn GẮN lead (từ trang convert). Đọc lead trong tầm nhìn cơ sở
  // actor (scopedDb) — ngoài scope/không tồn tại → bỏ qua leadId (đơn walk-in thường).
  const { leadId } = await searchParams;
  let lead: { id: string; parentName: string; phone: string; email: string | null; centerId: string | null } | null = null;
  if (leadId) {
    const actor = await resolveActor(session.user.id);
    lead = await scopedDb(actor).lead.findUnique({
      where: { id: leadId },
      select: { id: true, parentName: true, phone: true, email: true, centerId: true },
    });
  }

  return (
    <div className="max-w-4xl">
      <Link
        href={lead ? `/leads/${lead.id}/convert` : "/orders"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        {lead ? "Quay lại chốt lead" : "Quay lại danh sách"}
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-gray-900">
        Tạo đơn hàng thủ công
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {lead
          ? `Đơn gắn với lead "${lead.parentName}" — sau khi ghi nhận thanh toán sẽ đủ điều kiện chốt (convert).`
          : "Dùng cho khách walk-in tại trung tâm hoặc nhập tay đơn đã thoả thuận offline."}
      </p>

      <OrderCreateForm
        paymentMethods={data.paymentMethods}
        courses={data.courses}
        packages={data.packages}
        products={data.products}
        centers={data.centers}
        leadId={lead?.id ?? null}
        defaultCustomer={
          lead
            ? { name: lead.parentName, phone: lead.phone, email: lead.email ?? "" }
            : undefined
        }
        defaultCenterId={lead?.centerId ?? null}
      />
    </div>
  );
}
