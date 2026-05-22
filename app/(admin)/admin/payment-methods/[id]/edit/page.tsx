import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { PaymentMethodForm } from "../../_components/payment-method-form";

export const metadata = { title: "Sửa phương thức thanh toán | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPaymentMethodPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "payments:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const method = await db.paymentMethod.findUnique({ where: { id } });
  if (!method) notFound();

  return (
    <div>
      <Link
        href="/admin/payment-methods"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-gray-900">{method.name}</h1>
      <p className="mb-6 font-mono text-sm text-gray-500">{method.code}</p>

      <PaymentMethodForm method={method} />
    </div>
  );
}
