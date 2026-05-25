import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { loadCreateOrderFormData } from "../_actions";
import { OrderCreateForm } from "../_components/order-create-form";

export const metadata = { title: "Tạo đơn hàng | Admin" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "orders:manage")) {
    redirect("/dashboard?error=unauthorized");
  }

  const data = await loadCreateOrderFormData();

  return (
    <div className="max-w-4xl">
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-gray-900">
        Tạo đơn hàng thủ công
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Dùng cho khách walk-in tại trung tâm hoặc nhập tay đơn đã thoả thuận
        offline.
      </p>

      <OrderCreateForm
        paymentMethods={data.paymentMethods}
        courses={data.courses}
        packages={data.packages}
        products={data.products}
        centers={data.centers}
      />
    </div>
  );
}
