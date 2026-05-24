import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Ticket } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { VouchersTable } from "./_components/vouchers-table";

export const metadata = { title: "Mã khuyến mãi | Admin" };
export const dynamic = "force-dynamic";

export default async function VouchersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "vouchers:view")) {
    redirect("/dashboard?error=unauthorized");
  }

  const canManage = can(session.user, "vouchers:manage");

  const vouchers = await db.voucher.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      discountKind: true,
      discountPercent: true,
      discountAmount: true,
      maxDiscount: true,
      quantity: true,
      usedCount: true,
      validFrom: true,
      validUntil: true,
      isActive: true,
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
            <Ticket className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mã khuyến mãi</h1>
            <p className="mt-1 text-sm text-gray-500">
              Quản lý voucher giảm giá cho khoá học, gói combo, sản phẩm
            </p>
          </div>
        </div>
        {canManage && (
          <Link href="/vouchers/new">
            <Button>
              <Plus className="h-4 w-4" />
              Tạo voucher
            </Button>
          </Link>
        )}
      </div>

      <VouchersTable vouchers={vouchers} canManage={canManage} />
    </div>
  );
}
