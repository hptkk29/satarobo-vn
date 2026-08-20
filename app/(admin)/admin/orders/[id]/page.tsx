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
import {
  getPaymentConfig,
  transferContentForOrder,
  transferPhonePart,
  buildVietQrImageUrl,
  VIETQR_ADDINFO_MAX,
} from "@/lib/payments/vietqr";
import { computeDueNow } from "@/lib/payments/due-now";
import { getOrderPaymentRequests } from "@/lib/payments/payment-request";
import { loadActiveQrSessions } from "../_qr-core";
import { maskPhone, maskEmail } from "@/lib/utils";
import type { OrderStatus } from "@prisma/client";

export const metadata = { title: "Chi tiết đơn hàng | Admin" };
export const dynamic = "force-dynamic";

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  DRAFT: "bg-muted text-foreground hover:bg-muted",
  PENDING_PAYMENT: "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft",
  CONFIRMED: "bg-state-info-soft text-state-info-ink hover:bg-state-info-soft",
  COMPLETED: "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft",
  CANCELLED: "bg-state-danger-soft text-state-danger-ink hover:bg-state-danger-soft",
  REFUNDED: "bg-primary-soft text-primary hover:bg-primary-soft",
};

/**
 * Che phần SĐT trong nội dung CK — CHỈ cho thứ in ra màn hình.
 *
 * VÌ SAO: nội dung CK nay là `HoTenCon_84987654321_TenKhoa`, tức SĐT phụ huynh nằm
 * NGUYÊN trong đó và được in đậm ở 3 chỗ trên trang. Vai có `orders:view` mà không
 * có `orders:view-pii` đọc lại được đủ số ⇒ việc che ô "SĐT" phía trên thành vô
 * nghĩa (và số còn nằm trong RSC payload).
 *
 * Vì sao CHE mà không ẨN HẲN khối: che xong chuỗi vẫn còn tên con + tên khoá, đủ
 * để người không có quyền PII đối chiếu đơn/sao kê bằng mắt, mà không cầm được số
 * để gọi. Ẩn hẳn thì khối "Nội dung CK" trống trơn, không giúp ai thêm điều gì.
 *
 * ⚠️ TUYỆT ĐỐI không dùng cho chuỗi nhúng vào ảnh QR: che ở đó là mã hỏng, tiền
 * không về được.
 *
 * Dùng lại `maskPhone` (hàm che DUY NHẤT của repo) + `transferPhonePart` để biết
 * chính xác đoạn nào là số — không dò regex lần hai. Đoạn SĐT luôn còn nguyên vẹn
 * trong chuỗi vì `buildTransferContent` cắt bớt TÊN CON chứ không cắt phần đuôi,
 * nên phép thay thế này không trượt.
 */
function maskPhoneInTransferContent(
  content: string,
  rawPhone: string | null | undefined,
): string {
  const phonePart = transferPhonePart(rawPhone);
  if (!phonePart || !content.includes(phonePart)) return content;
  return content.replace(phonePart, maskPhone(phonePart));
}

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
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
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
  // BGĐ 31/07 — duyệt giảm giá nhập tay (Quản lý cơ sở).
  const canApproveDiscount = await checkPermission("discounts:approve", {
    centerId: order.centerId,
  });

  // Commit 4 — thanh toán 2 đợt + QR.
  // BGĐ 31/07 — QR lấy tài khoản NHẬN TIỀN THEO CƠ SỞ của đơn (fallback cấu hình chung).
  //
  // 20/08 — nội dung CK là `HoTenCon_SdtPH_TenKhoa` (không còn mã đơn). Tính MỘT LẦN
  // ở đây rồi truyền xuống cả khối QR mức đơn lẫn bảng phiếu thu theo đợt: ba chỗ in
  // ra phải là cùng một chuỗi, lệch nhau là sale đọc một đằng QR mã một nẻo.
  const payCfg = await getPaymentConfig(order.centerId);
  // Bản ĐẦY ĐỦ — thứ duy nhất được nhúng vào ảnh QR.
  //
  // ⚠️ Trần ký tự lấy TỪ `VIETQR_ADDINFO_MAX` (lib/payments/vietqr.ts), KHÔNG khai
  // lại số 25 ở đây. Chuỗi này và chuỗi mà `_qr-core.ts#addInfoFor` nhúng vào QR
  // theo từng phiếu thu PHẢI là một; hai chỗ giữ hai hằng riêng thì chỉ cần một
  // người sửa lệch là sale đọc một đằng, QR mã một nẻo — mà không có test nào bắt
  // được vì mỗi bên tự nhất quán với chính nó.
  const transferContent = transferContentForOrder(
    {
      studentName: order.student?.name,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      courseName: order.items[0]?.itemName,
    },
    VIETQR_ADDINFO_MAX,
  );
  // QR in SỐ PHẢI THU NGAY, không phải tổng đơn: khách chọn 2 đợt thì quét đóng
  // đợt 1. Dùng chung `computeDueNow` với webhook SePay — hai bên phải cùng một
  // con số, lệch là QR in một đằng máy đối khớp một nẻo (khách trả đúng vẫn bị
  // xếp vào "trả thiếu → xử lý tay").
  const paidSoFar = await sdb.payment.aggregate({
    where: { orderId: order.id, saleStatus: "RECORDED", deletedAt: null },
    _sum: { amount: true },
  });
  const dueNow = computeDueNow({
    totalAmount: order.totalAmount,
    paidAmount: paidSoFar._sum.amount ?? 0,
    installments: order.installments,
    installmentApprovalStatus: order.installmentApprovalStatus,
  });
  // ⚠️ QR nhận bản ĐẦY ĐỦ (`transferContent`), KHÔNG phải bản che: mã phải mang đúng
  // nội dung phụ huynh sẽ chuyển, che ở đây là tiền không về được.
  //
  // ⚠️ VÌ THẾ, thiếu `orders:view-pii` thì KHÔNG dựng URL ảnh QR luôn. URL có dạng
  // `img.vietqr.io/...?addInfo=NguyenVanA_84987654321_Sata4` — nó đi thẳng vào
  // `<img src>` trong DOM và vào RSC payload, tức SĐT ĐẦY ĐỦ vẫn lọt xuống client dù
  // chuỗi in ra màn hình đã che (đo được ở vòng soi 3 — khối comment cũ ở đây khẳng
  // định ngược lại là SAI).
  //
  // Vì sao ẨN QR chứ không proxy ảnh qua route của mình: proxy là hạ tầng mới (route
  // ảnh + gác quyền + chống IDOR theo orderId) cho một vai mà HÔM NAY KHÔNG AI GIỮ —
  // mọi vai có `orders:view` trong seed-roles đều có kèm `orders:view-pii`. Ẩn là
  // hành vi trung thực và đúng bản chất: không được xem SĐT thì cũng không được cầm
  // mã QR, vì mã QR CHÍNH LÀ SĐT đó ở dạng khác.
  const qrUrl = canViewPii ? buildVietQrImageUrl(payCfg, dueNow.amount, transferContent) : null;
  // Bản HIỂN THỊ — mọi chỗ in nội dung CK ra màn hình (khối QR mức đơn, bảng phiếu
  // thu theo đợt, hộp phóng to QR) đều nhận chuỗi này. Che số nhưng GIỮ tên con +
  // tên khoá để người không có quyền PII vẫn đối chiếu đơn/sao kê bằng mắt được.
  const transferContentShown = canViewPii
    ? transferContent
    : maskPhoneInTransferContent(transferContent, order.customerPhone);

  // 03/08 — SỔ PHIẾU THU theo đợt (PaymentRequest) + phiên QR ACTIVE còn hạn của
  // từng phiếu. Đây là nguồn của bảng "Phiếu thu & QR theo đợt"; `OrderQrSection`
  // (QR mức ĐƠN, hành vi cũ) chỉ còn là lối lùi cho đơn CHƯA có phiếu thu nào —
  // đơn cũ tạo trước khi có sổ này. Xoá hẳn sẽ làm những đơn đó mất luôn QR.
  const paymentRequests = await getOrderPaymentRequests(order.id);
  const qrSessions = await loadActiveQrSessions(
    actor,
    paymentRequests.map((r) => ({ id: r.id, matchKey: r.matchKey })),
    // `QrSessionView.transferContent` chỉ để IN RA (ảnh QR đã dựng sẵn từ trước và
    // nằm ở `qrContent`), nên truyền bản che.
    transferContentShown,
    // Cùng một câu trả lời quyền cho cả trang: thiếu `orders:view-pii` → core trả
    // RỖNG, không phiên QR nào xuống client (ảnh QR của từng đợt cũng mang SĐT đầy
    // đủ trong `imageSrc`). Truyền tường minh thay vì để core tự suy, để cờ này và
    // `qrUrl` ở trên chắc chắn đi cùng một nguồn `checkPermission`.
    { canViewPii },
  );

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
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-foreground">
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
                      ? "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft"
                      : "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft"
                  }
                >
                  {b.label}
                </Badge>
              );
            })()}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
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
          <div className="text-3xl font-bold text-foreground tabular-nums">
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
        canApproveDiscount={canApproveDiscount}
        qrUrl={qrUrl}
        dueNow={dueNow}
        transferContent={transferContentShown}
        paymentRequests={paymentRequests.map((r) => ({
          id: r.id,
          installmentNo: r.installmentNo,
          amountDue: r.amountDue,
          allocated: r.allocated,
          dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          status: r.status,
          matchKey: r.matchKey,
        }))}
        qrSessions={qrSessions}
        installmentPlanApproved={order.installmentApprovalStatus === "APPROVED"}
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
