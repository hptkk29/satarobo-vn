import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { PaymentMethodForm } from "../_components/payment-method-form";

export const metadata = { title: "Thêm phương thức thanh toán | Admin" };
export const dynamic = "force-dynamic";

export default async function NewPaymentMethodPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "payments:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  return (
    <div>
      <Link
        href="/admin/payment-methods"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Thêm phương thức thanh toán
      </h1>

      <PaymentMethodForm />
    </div>
  );
}
