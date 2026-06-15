import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { queryPayments, loadOrderOptions } from "./_actions";
import { PaymentsClient } from "./_components/payments-client";

export const metadata = { title: "Thanh toán | Admin" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "payments:manage")) {
    redirect("/dashboard?error=unauthorized");
  }

  // Kế toán/quản lý mới thấy nút xác nhận/từ chối/điều chỉnh.
  const canConfirm =
    can(session.user, "payments:manage") &&
    (hasRole(session.user, "ACCOUNTANT") ||
      hasRole(session.user, "SUPER_ADMIN") ||
      hasRole(session.user, "CENTER_MANAGER"));

  const [rows, orders] = await Promise.all([
    queryPayments({}),
    loadOrderOptions(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
          <CreditCard className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thanh toán</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ghi nhận khoản thu (Sale) &amp; xác nhận / từ chối / điều chỉnh (Kế toán)
          </p>
        </div>
      </div>

      <PaymentsClient
        initialRows={rows}
        orders={orders}
        canConfirm={canConfirm}
        canRecord={can(session.user, "payments:manage")}
      />
    </div>
  );
}
