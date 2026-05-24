import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { OrderDetailClient } from "../_components/order-detail-client";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL } from "@/lib/orders/status";
import type { OrderStatus } from "@prisma/client";

export const metadata = { title: "Chi tiết đơn hàng | Admin" };
export const dynamic = "force-dynamic";

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  CONFIRMED: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  COMPLETED: "bg-green-100 text-green-800 hover:bg-green-100",
  CANCELLED: "bg-red-100 text-red-800 hover:bg-red-100",
  REFUNDED: "bg-purple-100 text-purple-800 hover:bg-purple-100",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "orders:view")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      paymentMethod: true,
      student: { select: { id: true, name: true } },
      lead: { select: { id: true, parentName: true } },
      center: { select: { id: true, name: true } },
      history: { orderBy: { createdAt: "desc" } },
      voucherRedemption: {
        include: {
          voucher: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const canManage = can(session.user, "orders:manage");

  return (
    <div className="max-w-5xl">
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-gray-900">
              {order.code}
            </h1>
            <Badge variant="outline">{ORDER_TYPE_LABEL[order.type]}</Badge>
            <Badge className={STATUS_BADGE_CLASS[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Tạo:{" "}
            {new Intl.DateTimeFormat("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(order.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-gray-900 tabular-nums">
            {order.totalAmount.toLocaleString("vi-VN")} đ
          </div>
        </div>
      </div>

      <OrderDetailClient order={order} canManage={canManage} />
    </div>
  );
}
