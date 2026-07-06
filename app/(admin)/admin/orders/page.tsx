import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ShoppingBag } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { Button } from "@/components/ui/button";
import { OrdersListClient } from "./_components/orders-list-client";

export const metadata = { title: "Đơn hàng | Admin" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate list-level (nhiều đơn) — không có 1 centerId cụ thể, không truyền target.
  if (!(await checkPermission("orders:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  const canCreate = await checkPermission("orders:manage");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
            <ShoppingBag className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Đơn hàng</h1>
            <p className="mt-1 text-sm text-gray-500">
              Theo dõi & quản lý đơn hàng khoá học, gói combo, kỳ thi
            </p>
          </div>
        </div>
        {canCreate && (
          <Link href="/orders/new">
            <Button>
              <Plus className="h-4 w-4" />
              Tạo đơn thủ công
            </Button>
          </Link>
        )}
      </div>

      <OrdersListClient />
    </div>
  );
}
