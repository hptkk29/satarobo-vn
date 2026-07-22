import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Badge } from "@/components/ui/badge";
import { OrderDetailClient } from "../_components/order-detail-client";
import { SendEmailModal } from "../_components/send-email-modal";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, deriveInstallmentBadge } from "@/lib/orders/status";
import { getPaymentConfig, buildTransferContent, buildVietQrImageUrl } from "@/lib/payments/vietqr";
import { maskPhone, maskEmail } from "@/lib/utils";
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
  // Gate trước khi fetch order → chưa có centerId, không truyền target được (xem báo cáo).
  if (!(await checkPermission("orders:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  // Cách ly cơ sở: Order ∈ SCOPED_MODELS — findUnique qua scopedDb chống IDOR
  // (đơn cơ sở ngoài tầm nhìn → null → notFound).
  const sdb = scopedDb(await resolveActor(session.user.id));
  const order = await sdb.order.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { id: true, sku: true } },
        },
      },
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
      // OD1 — kế hoạch 2 đợt kèm reminderDays (số ngày nhắc trước hạn đợt 2) để pre-fill.
      installments: {
        orderBy: { soDot: "asc" },
        select: {
          id: true,
          soDot: true,
          amount: true,
          status: true,
          dueDate: true,
          paidAt: true,
          reminderDays: true,
        },
      },
      // (b) PA-A 22/07 — trạng thái sổ kế toán (Payment.accountantStatus) hiển thị
      // read-only cạnh kế hoạch đợt: installment PAID = "Sale đã thu", tiền chỉ
      // "xong" khi kế toán CONFIRMED bên /payments.
      payments: {
        select: { amount: true, accountantStatus: true },
      },
    },
  });
  if (!order) notFound();

  // orders:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  const canManage = await checkPermission("orders:manage");
  // Che liên hệ khách trên PHẦN HIỂN THỊ nếu thiếu quyền. QR (nội dung CK) + gửi email
  // vẫn dùng `order` GỐC ở server (chức năng), chỉ bản `displayOrder` xuống client bị che
  // → không leak qua RSC payload.
  const canViewPii = await checkPermission("orders:view-pii");
  // OD1b — duyệt kế hoạch trả góp 2 đợt tách khỏi orders:manage (ACCOUNTANT không có quyền duyệt).
  // order đã fetch có centerId → truyền target để scope-aware (CENTER nếu có role seed sau này).
  const canApprove = await checkPermission("installments:approve", { centerId: order.centerId });

  // Commit 4 — thanh toán 2 đợt + QR (nội dung CK: tên HV + SĐT PH + tên khoá).
  const payCfg = await getPaymentConfig();
  const transferContent = buildTransferContent(
    order.student?.name ?? order.customerName,
    order.customerPhone,
    order.items[0]?.itemName,
  );
  const qrUrl = buildVietQrImageUrl(payCfg, order.totalAmount, transferContent);

  const emailTemplates = canManage
    ? await sdb.emailTemplate.findMany({
        where: {
          isActive: true,
          trigger: { in: ["ORDER_CONFIRMATION", "PAYMENT_RECEIPT", "MANUAL"] },
        },
        select: { id: true, name: true, trigger: true },
        orderBy: { name: "asc" },
      })
    : [];

  // G4 (3c) — danh sách phương thức để đổi PTTT (chỉ cần khi có quyền sửa).
  const paymentMethods = canManage
    ? await sdb.paymentMethod.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          canBuyCourse: true,
          canBuyPackage: true,
          canBuyExam: true,
          canBuyProduct: true,
        },
      })
    : [];

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
            {(() => {
              // G5 — badge suy diễn tiến độ trả góp 2 đợt (vd "Đã đóng đợt 1").
              const b = deriveInstallmentBadge(order.installments);
              if (!b) return null;
              return (
                <Badge
                  className={
                    b.color === "emerald"
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                      : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                  }
                >
                  {b.label}
                </Badge>
              );
            })()}
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
        <div className="text-right space-y-2">
          <div className="text-3xl font-bold text-gray-900 tabular-nums">
            {order.totalAmount.toLocaleString("vi-VN")} đ
          </div>
          {canManage && (
            <SendEmailModal
              orderId={order.id}
              defaultEmail={order.customerEmail}
              defaultName={order.customerName}
              templates={emailTemplates}
            />
          )}
        </div>
      </div>

      <OrderDetailClient
        order={
          canViewPii
            ? order
            : {
                ...order,
                customerPhone: order.customerPhone ? maskPhone(order.customerPhone) : order.customerPhone,
                customerEmail: order.customerEmail ? maskEmail(order.customerEmail) : order.customerEmail,
                customerCccd: null,
                customerAddress: null,
              }
        }
        canManage={canManage}
        canApprove={canApprove}
        qrUrl={qrUrl}
        transferContent={transferContent}
        paymentMethods={paymentMethods}
        accounting={{
          confirmed: order.payments
            .filter((p) => p.accountantStatus === "CONFIRMED")
            .reduce((s, p) => s + p.amount, 0),
          pending: order.payments
            .filter((p) => p.accountantStatus === "PENDING")
            .reduce((s, p) => s + p.amount, 0),
        }}
        installments={order.installments.map((i) => ({
          id: i.id,
          soDot: i.soDot,
          amount: i.amount,
          status: i.status,
          dueDate: i.dueDate ? i.dueDate.toISOString() : null,
          paidAt: i.paidAt ? i.paidAt.toISOString() : null,
          reminderDays: i.reminderDays,
        }))}
      />
    </div>
  );
}
