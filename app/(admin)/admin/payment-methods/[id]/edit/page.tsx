import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { PaymentMethodForm } from "../../_components/payment-method-form";

export const metadata = { title: "Sửa phương thức thanh toán | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPaymentMethodPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // PaymentMethod là entity toàn cục (không có centerId) — không có target để truyền.
  if (!(await checkPermission("payments:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  // PaymentMethod là catalog toàn cục (không scoped) — scopedDb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const method = await sdb.paymentMethod.findUnique({ where: { id } });
  if (!method) notFound();

  return (
    <div>
      <Link
        href="/payment-methods"
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
