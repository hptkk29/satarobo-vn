import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskPhone } from "@/lib/utils";
import { PageHelp } from "@/components/admin/ui/page-help";
import { OrderApprovalCard } from "./_components/order-approval-card";

export const metadata = { title: "Duyệt đơn hàng | Admin" };
export const dynamic = "force-dynamic";

export default async function DuyetDonHangPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Cổng trang: vào được nếu có ÍT NHẤT MỘT trong hai quyền duyệt. Gọi KHÔNG kèm
  // target (chưa có đơn nào ⇒ chưa có centerId) — an toàn vì cả hai action đều seed
  // GLOBAL ở mọi vai giữ chúng; nếu seed non-GLOBAL thì lời gọi trần sẽ trả false
  // trên prod và khoá nhầm cửa chính của quản lý cơ sở. Cách ly cơ sở do scopedDb lo.
  const canApproveDiscount = await checkPermission("discounts:approve");
  const canApproveInstallment = await checkPermission("installments:approve");
  if (!canApproveDiscount && !canApproveInstallment) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const canViewPii = await checkPermission("orders:view-pii");

  // Order ∈ SCOPED_MODELS: quản lý cơ sở 1 không thấy đơn cơ sở 2.
  // Xếp đơn CŨ NHẤT lên trước — đơn chờ lâu là đơn đang chặn sale chốt học phí.
  const orders = await scopedDb(actor).order.findMany({
    where: {
      deletedAt: null,
      OR: [
        { discountApprovalStatus: "PENDING_APPROVAL" },
        { installmentApprovalStatus: "PENDING_APPROVAL" },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      code: true,
      createdAt: true,
      customerName: true,
      customerPhone: true,
      subtotal: true,
      discountAmount: true,
      discountPercent: true,
      discountReason: true,
      shippingFee: true,
      totalAmount: true,
      customerNote: true,
      internalNote: true,
      discountApprovalStatus: true,
      installmentApprovalStatus: true,
      center: { select: { name: true } },
      paymentMethod: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: { id: true, itemName: true, quantity: true, totalPrice: true },
      },
      installments: {
        orderBy: { soDot: "asc" },
        select: {
          id: true,
          soDot: true,
          amount: true,
          status: true,
          dueDate: true,
          paidAt: true,
        },
      },
    },
  });

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Duyệt đơn hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn đang chờ quản lý cơ sở duyệt ({orders.length})
          </p>
        </div>
      </div>

      <PageHelp>
        <p>
          Một đơn vào đây khi nhân viên bán hàng nhập giảm giá bằng tay, hoặc lập kế
          hoạch cho phụ huynh đóng làm 2 đợt — hai việc đó vượt quyền của người bán
          nên cần bạn ký.
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Một nút duyệt cho cả đơn.</strong> Bấm
          &ldquo;Duyệt đơn&rdquo; là đồng ý CẢ khoản giảm giá LẪN kế hoạch thanh toán
          của đơn đó. Không còn duyệt lẻ từng phần, nên không còn cảnh đơn duyệt được
          một nửa rồi nằm chờ.
        </p>
        <p className="mt-2">
          Duyệt xong, kế hoạch bị KHOÁ: số tiền và số đợt không sửa được nữa vì phiếu
          thu cùng mã QR gửi cho khách đã bám theo nó. Cần đổi thì bấm &ldquo;Từ
          chối&rdquo; kèm lý do, nhân viên lập lại rồi xin duyệt lần nữa.
        </p>
      </PageHelp>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Không có đơn nào đang chờ duyệt.
        </p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <OrderApprovalCard
              key={o.id}
              order={{
                id: o.id,
                code: o.code,
                createdAt: o.createdAt,
                customerName: o.customerName,
                // Che số điện thoại y như trang chi tiết đơn: người duyệt cần biết
                // đơn của ai, không nhất thiết phải cầm được số để gọi.
                customerPhone: canViewPii ? o.customerPhone : maskPhone(o.customerPhone),
                centerName: o.center?.name ?? null,
                paymentMethodName: o.paymentMethod?.name ?? null,
                subtotal: o.subtotal,
                discountAmount: o.discountAmount,
                discountPercent: o.discountPercent,
                discountReason: o.discountReason,
                shippingFee: o.shippingFee,
                totalAmount: o.totalAmount,
                customerNote: o.customerNote,
                internalNote: o.internalNote,
                discountApprovalStatus: o.discountApprovalStatus,
                installmentApprovalStatus: o.installmentApprovalStatus,
                items: o.items,
                installments: o.installments,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
