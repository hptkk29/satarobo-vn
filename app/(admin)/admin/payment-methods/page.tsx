import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, CreditCard } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Button } from "@/components/ui/button";
import { PaymentMethodsTable } from "./_components/payment-methods-table";

export const metadata = { title: "Phương thức thanh toán | Admin" };
export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // PaymentMethod là entity toàn cục (không có centerId) — không có target để truyền.
  if (!(await checkPermission("payments:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // PaymentMethod là catalog toàn cục (không scoped) — scopedDb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const methods = await sdb.paymentMethod.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Phương thức thanh toán
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Quản lý các phương thức thanh toán: tiền mặt, chuyển khoản,
              gateway online
            </p>
          </div>
        </div>
        <Link href="/payment-methods/new">
          <Button>
            <Plus className="h-4 w-4" />
            Thêm phương thức
          </Button>
        </Link>
      </div>

      <PaymentMethodsTable methods={methods} />
    </div>
  );
}
