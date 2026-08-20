"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ChevronDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Prisma, OrderStatus, InstallmentApprovalStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  changeOrderStatusAction,
  updateOrderNoteAction,
  updateOrderPaymentMethodAction,
} from "../_actions";
// ⚠️ CHỈ có hàm "xin duyệt lại". Hai hàm DUYỆT LẺ (approve/rejectInstallmentPlan)
// đã bị xoá 20/08 — import chúng từ đây là dựng lại endpoint duyệt nửa đơn mà
// `lib/orders/approval.ts` cấm. Đường duyệt duy nhất: `OrderApprovalButtons`.
import { requestInstallmentApprovalAction } from "./_installment-request-actions";
import { OrderApprovalButtons } from "../duyet/_components/order-approval-buttons";
import { OrderInstallmentPlan, OrderQrSection } from "./order-payment-section";
import { formatVndPlain } from "@/lib/format/money";
import {
  PaymentRequestsSection,
  type PaymentRequestRow,
} from "./payment-requests-section";
import type { QrSessionView } from "../_qr-core";
import { ORDER_STATUS_LABEL } from "@/lib/orders/status";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

// G4 — phương thức thanh toán có thể sửa (chỉ khi đơn chưa xác nhận); cần khả năng theo loại đơn.
type PaymentMethodOption = {
  id: string;
  name: string;
  canBuyCourse: boolean;
  canBuyPackage: boolean;
  canBuyExam: boolean;
  canBuyProduct: boolean;
};

type InstallmentView = {
  id: string;
  soDot: number;
  amount: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  reminderDays: number | null;
};

type OrderWithIncludes = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: { select: { id: true; sku: true } };
      };
    };
    paymentMethod: true;
    student: { select: { id: true; name: true } };
    lead: { select: { id: true; parentName: true } };
    center: { select: { id: true; name: true } };
    history: true;
  };
}>;

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

// OD1b — duyệt kế hoạch trả góp 2 đợt (C4).
const APPROVAL_LABEL: Record<InstallmentApprovalStatus, string> = {
  PENDING_APPROVAL: "Chờ quản lý cơ sở duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
};
const APPROVAL_BADGE_CLASS: Record<InstallmentApprovalStatus, string> = {
  PENDING_APPROVAL: "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft",
  APPROVED: "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft",
  REJECTED: "bg-state-danger-soft text-state-danger-ink hover:bg-state-danger-soft",
};

/**
 * Ngày (không giờ) theo múi giờ Việt Nam, khai TƯỜNG MINH.
 *
 * Khối này render cả ở server lẫn client: server Vercel chạy UTC còn trình duyệt của
 * người dùng ở +07, để mặc định thì hạn đóng đợt 2 lệch một ngày giữa hai lần vẽ.
 */
function formatVnDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function OrderDetailClient({
  order,
  canManage,
  canApprove,
  canApproveDiscount = false,
  qrUrl,
  transferContent,
  dueNow,
  installments,
  paymentRequests,
  qrSessions,
  installmentPlanApproved,
  paymentMethods,
  accounting,
}: {
  order: OrderWithIncludes;
  canManage: boolean;
  // OD1b — quyền duyệt kế hoạch trả góp (installments:approve) tách khỏi orders:manage.
  canApprove: boolean;
  // BGĐ 31/07 — quyền duyệt giảm giá nhập tay (discounts:approve).
  canApproveDiscount?: boolean;
  // G4 — QR + kế hoạch 2 đợt render trong cùng component để kiểm soát thứ tự section.
  qrUrl: string | null;
  transferContent: string;
  /** Số tiền QR đang thu (đợt 1 nếu chọn 2 đợt) + nhãn. */
  dueNow: { amount: number; label: string };
  installments: InstallmentView[];
  /** 03/08 — sổ phiếu thu theo đợt (nguồn của bảng "Phiếu thu & QR theo đợt"). */
  paymentRequests: PaymentRequestRow[];
  /** Phiên QR ACTIVE còn hạn của từng phiếu (key = paymentRequestId). */
  qrSessions: Record<string, QrSessionView>;
  installmentPlanApproved: boolean;
  paymentMethods: PaymentMethodOption[];
  // (b) PA-A — tổng theo sổ kế toán (Payment) của đơn: CONFIRMED vs PENDING (chờ ✓).
  accounting: { confirmed: number; pending: number };
}) {
  const router = useRouter();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | "">("");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState(order.internalNote ?? "");
  const [isPending, startTransition] = useTransition();
  const approvalStatus = order.installmentApprovalStatus;
  const discountStatus = order.discountApprovalStatus;

  // Chốt 20/08/2026 — MỘT khối duyệt, MỘT nút cho cả giảm giá lẫn kế hoạch thanh toán.
  // Người duyệt nhìn một tờ đơn và trả lời một câu; tách đôi chỉ đẻ ra đơn duyệt nửa vời.
  const choDuyetGiamGia = discountStatus === "PENDING_APPROVAL";
  const choDuyetKeHoach = approvalStatus === "PENDING_APPROVAL";
  const dangChoDuyet = choDuyetGiamGia || choDuyetKeHoach;
  // Thiếu quyền cho MỘT phần đang chờ là không được bấm: server cũng từ chối cả lệnh,
  // nên hiện nút ở đây chỉ để người ta bấm rồi nhận lỗi.
  const duyetDuocCaDon =
    (!choDuyetGiamGia || canApproveDiscount) && (!choDuyetKeHoach || canApprove);
  // G4 — lịch sử trạng thái dạng dropdown (mặc định đóng).
  const [historyOpen, setHistoryOpen] = useState(false);
  // G4 — sửa phương thức thanh toán (chỉ khi đơn chưa xác nhận).
  const [pmEditing, setPmEditing] = useState(false);
  const [pmValue, setPmValue] = useState(order.paymentMethodId ?? "");

  const nextOptions = NEXT_STATUSES[order.status];
  // G4 — chỉ cho sửa phương thức khi đơn còn DRAFT/PENDING_PAYMENT (khớp guard server).
  const canEditPaymentMethod =
    canManage && (order.status === "DRAFT" || order.status === "PENDING_PAYMENT");
  const pmAllowedForType = (pm: PaymentMethodOption): boolean => {
    switch (order.type) {
      case "COURSE":
        return pm.canBuyCourse;
      case "PACKAGE":
        return pm.canBuyPackage;
      case "EXAM":
        return pm.canBuyExam;
      case "PRODUCT":
        return pm.canBuyProduct;
      default:
        return false;
    }
  };

  // FIX-H9 — updatedAt client đã thấy; gửi kèm mọi lần ghi để phát hiện sửa đồng thời.
  const seenUpdatedAt = new Date(order.updatedAt).toISOString();

  function handleStale() {
    toast.error("Người khác vừa sửa đơn này. Đang tải lại…");
    setStatusModalOpen(false);
    setTimeout(() => window.location.reload(), 800);
  }

  function handleStatusChange() {
    if (!newStatus) return;
    startTransition(async () => {
      const result = await changeOrderStatusAction(
        order.id,
        { toStatus: newStatus, reason },
        seenUpdatedAt,
      );
      if (result.ok) {
        toast.success("Đã đổi trạng thái");
        setStatusModalOpen(false);
        window.location.reload();
      } else if (result.error === "STALE_WRITE") {
        handleStale();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSaveNote() {
    startTransition(async () => {
      const result = await updateOrderNoteAction(
        order.id,
        internalNote,
        seenUpdatedAt,
      );
      if (result.ok) {
        toast.success("Đã lưu ghi chú");
        window.location.reload();
      } else if (result.error === "STALE_WRITE") {
        handleStale();
      } else toast.error(result.error);
    });
  }

  // G4 — đổi phương thức thanh toán (huỷ → giữ phương thức cũ).
  function handleSavePaymentMethod() {
    if (!pmValue) {
      toast.error("Chọn phương thức thanh toán");
      return;
    }
    startTransition(async () => {
      const result = await updateOrderPaymentMethodAction(
        order.id,
        pmValue,
        seenUpdatedAt,
      );
      if (result.ok) {
        toast.success("Đã đổi phương thức thanh toán");
        setPmEditing(false);
        window.location.reload();
      } else if (result.error === "STALE_WRITE") {
        handleStale();
      } else toast.error(result.error);
    });
  }

  // OD1b — sale xin duyệt lại sau khi kế hoạch bị bác (KHÔNG phải đường duyệt).
  function handleRequestApproval() {
    startTransition(async () => {
      const res = await requestInstallmentApprovalAction(order.id);
      if (res.ok) {
        toast.success("Đã gửi yêu cầu duyệt kế hoạch trả góp");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="space-y-6">
      {/* Customer info */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Thông tin khách hàng
        </h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Tên: </span>
            <span className="font-medium text-foreground">
              {order.customerName}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">SĐT: </span>
            <span className="text-foreground">{order.customerPhone}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span className="text-foreground">{order.customerEmail ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Địa chỉ: </span>
            <span className="text-foreground">
              {[order.customerAddress, order.customerWard, order.customerCity]
                .filter(Boolean)
                .join(", ") || "—"}
            </span>
          </div>
          {order.student && (
            <div>
              <span className="text-muted-foreground">Học sinh: </span>
              <span className="text-foreground">{order.student.name}</span>
            </div>
          )}
          {order.lead && (
            <div>
              <span className="text-muted-foreground">Lead: </span>
              <span className="text-foreground">{order.lead.parentName}</span>
            </div>
          )}
          {order.center && (
            <div>
              <span className="text-muted-foreground">Trung tâm: </span>
              <span className="text-foreground">{order.center.name}</span>
            </div>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Sản phẩm ({order.items.length})
        </h2>
        <PhanTrangBang>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="p-2 text-left">Tên</th>
                <th className="p-2 text-right">SL</th>
                <th className="p-2 text-right">Đơn giá</th>
                <th className="p-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id} className="border-b border-border">
                  <td className="p-2">
                    <div className="font-medium text-foreground">{it.itemName}</div>
                    {it.product && (
                      <Link
                        href={`/products/${it.product.id}`}
                        className="font-mono text-xs text-state-info-ink hover:underline"
                      >
                        → {it.product.sku}
                      </Link>
                    )}
                    {it.itemDescription && (
                      <div className="text-xs text-muted-foreground">
                        {it.itemDescription}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="p-2 text-right tabular-nums">
                    {it.unitPrice.toLocaleString("vi-VN")}
                  </td>
                  <td className="p-2 text-right font-medium tabular-nums">
                    {it.totalPrice.toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td colSpan={3} className="p-2 text-right text-muted-foreground">
                  Tạm tính:
                </td>
                <td className="p-2 text-right tabular-nums">
                  {order.subtotal.toLocaleString("vi-VN")}
                </td>
              </tr>
              {order.discountAmount > 0 && (
                <tr>
                  <td colSpan={3} className="p-2 text-right text-muted-foreground">
                    Giảm giá
                    {/* Đơn CŨ tạo bằng mã khuyến mãi (hệ đã gỡ 03/08) vẫn hiện mã đã
                        dùng để đối soát lịch sử — không còn link tới màn voucher. */}
                    {order.voucherCode ? <> — mã {order.voucherCode}</> : null}
                    :
                  </td>
                  <td className="p-2 text-right text-state-danger-ink tabular-nums">
                    -{order.discountAmount.toLocaleString("vi-VN")}
                  </td>
                </tr>
              )}
              {order.shippingFee > 0 && (
                <tr>
                  <td colSpan={3} className="p-2 text-right text-muted-foreground">
                    Phí vận chuyển:
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {order.shippingFee.toLocaleString("vi-VN")}
                  </td>
                </tr>
              )}
              <tr className="font-bold">
                <td colSpan={3} className="p-2 text-right">
                  Tổng:
                </td>
                <td className="p-2 text-right tabular-nums">
                  {order.totalAmount.toLocaleString("vi-VN")} đ
                </td>
              </tr>
            </tfoot>
          </table>
        </PhanTrangBang>
      </section>

      {/* Payment method (G4 — có nút "Sửa" khi đơn chưa xác nhận thanh toán) */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Phương thức thanh toán
          </h2>
          {canEditPaymentMethod && !pmEditing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPmValue(order.paymentMethodId ?? "");
                setPmEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Thay đổi phương thức
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Phương thức: </span>
            {pmEditing ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Select value={pmValue} onValueChange={(v) => setPmValue(v ?? "")}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Chọn phương thức" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.filter(pmAllowedForType).map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>
                        {pm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={handleSavePaymentMethod}
                  disabled={isPending || !pmValue}
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Lưu
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPmEditing(false)}
                  disabled={isPending}
                >
                  Huỷ
                </Button>
              </div>
            ) : (
              <span className="text-foreground">
                {order.paymentMethod?.name ?? "—"}
              </span>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Mã GD ngân hàng: </span>
            <span className="text-foreground">{order.bankReference ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Gateway txn ID: </span>
            <span className="text-foreground">{order.gatewayTxnId ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Thanh toán lúc: </span>
            <span className="text-foreground">
              {order.paidAt ? formatDateTime(order.paidAt) : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* Chốt 20/08/2026 — MỘT khối duyệt gộp: giảm giá + kế hoạch thanh toán,
          một nút "Duyệt đơn" cho cả hai. Khối chỉ hiện phần đơn THẬT SỰ có. */}
      {(discountStatus || approvalStatus) && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {dangChoDuyet ? "Chờ quản lý cơ sở duyệt" : "Duyệt đơn"}
            </h2>
            {/* Người duyệt thường có nhiều đơn chờ cùng lúc — cho họ đường sang hàng
                chờ thay vì bắt quay ra danh sách rồi tự lọc từng đơn. */}
            {(canApprove || canApproveDiscount) && (
              <Link
                href="/orders/duyet"
                className="text-xs font-medium text-primary hover:underline"
              >
                Xem tất cả đơn chờ duyệt →
              </Link>
            )}
          </div>
          <div className="space-y-4 text-sm">
            {discountStatus && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Giảm giá:</span>
                  <Badge className={APPROVAL_BADGE_CLASS[discountStatus]}>
                    {APPROVAL_LABEL[discountStatus]}
                  </Badge>
                  <span className="text-foreground">
                    {order.discountPercent != null
                      ? `theo % (${order.discountPercent}%) — ${formatVndPlain(order.discountAmount)}`
                      : `theo số tiền — ${formatVndPlain(order.discountAmount)}`}
                  </span>
                </div>
                {order.discountReason && (
                  <div className="rounded-lg bg-muted p-3 text-foreground">
                    <span className="font-semibold">Giải trình: </span>
                    {order.discountReason}
                  </div>
                )}
                {discountStatus === "APPROVED" && order.discountApprovedAt && (
                  <p className="text-xs text-muted-foreground">
                    Duyệt lúc {formatDateTime(order.discountApprovedAt)}
                  </p>
                )}
                {discountStatus === "REJECTED" && order.discountRejectReason && (
                  <div className="rounded-lg bg-state-danger-soft p-3 text-state-danger-ink">
                    Lý do từ chối: {order.discountRejectReason}
                  </div>
                )}
              </div>
            )}

            {approvalStatus && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Kế hoạch thanh toán 2 đợt:</span>
                  <Badge className={APPROVAL_BADGE_CLASS[approvalStatus]}>
                    {APPROVAL_LABEL[approvalStatus]}
                  </Badge>
                </div>
                {installments.length > 0 && (
                  <ul className="space-y-1">
                    {installments.map((i) => (
                      <li
                        key={i.id}
                        className="flex items-baseline justify-between gap-3 text-foreground"
                      >
                        <span>
                          Đợt {i.soDot}
                          {i.dueDate && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              hạn {formatVnDate(i.dueDate)}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatVndPlain(i.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {approvalStatus === "APPROVED" && order.installmentApprovedAt && (
                  <p className="text-xs text-muted-foreground">
                    Duyệt lúc {formatDateTime(order.installmentApprovedAt)}
                  </p>
                )}
                {approvalStatus === "REJECTED" && order.installmentRejectReason && (
                  <div className="rounded-lg bg-state-danger-soft p-3 text-state-danger-ink">
                    Lý do từ chối: {order.installmentRejectReason}
                  </div>
                )}
              </div>
            )}

            {dangChoDuyet &&
              (duyetDuocCaDon ? (
                <OrderApprovalButtons orderId={order.id} />
              ) : (
                <p className="text-xs text-state-warning-ink">
                  Đang chờ Quản lý cơ sở duyệt — đơn chưa thể xác nhận.
                </p>
              ))}

            {/* Bị bác thì sale sửa lại rồi xin duyệt lần nữa — nút này KHÔNG duyệt. */}
            {canApprove && approvalStatus === "REJECTED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRequestApproval}
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Yêu cầu duyệt lại
              </Button>
            )}
          </div>
        </section>
      )}

      {/* G4 (3b) — Kế hoạch thanh toán 2 đợt: NGAY SAU phương thức thanh toán */}
      <OrderInstallmentPlan
        orderId={order.id}
        totalAmount={order.totalAmount}
        canManage={canManage}
        installments={installments}
        accounting={accounting}
      />

      {/* Notes */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Ghi chú
        </h2>
        <div className="space-y-3">
          {order.customerNote && (
            <div className="text-sm">
              <div className="mb-1 text-muted-foreground">Ghi chú khách hàng:</div>
              <div className="rounded-lg bg-state-warning-soft p-3 text-foreground">
                {order.customerNote}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Ghi chú nội bộ:</div>
            <Textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={3}
              disabled={!canManage}
            />
            {canManage && (
              <Button
                size="sm"
                onClick={handleSaveNote}
                disabled={isPending}
                variant="outline"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Lưu ghi chú
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Status history */}
      <section className="rounded-xl border border-border bg-card p-5">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={historyOpen}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Lịch sử trạng thái ({order.history.length})
          </h2>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${historyOpen ? "rotate-180" : ""}`}
          />
        </button>
        {historyOpen &&
          (order.history.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Chưa có thay đổi trạng thái</p>
          ) : (
            <div className="mt-3 space-y-2">
            {order.history.map((h) => (
              <div
                key={h.id}
                className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm"
              >
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-state-info" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline">
                      {ORDER_STATUS_LABEL[h.fromStatus]}
                    </Badge>
                    <span className="mx-1 text-muted-foreground">→</span>
                    <Badge>{ORDER_STATUS_LABEL[h.toStatus]}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {h.changedByName} · {formatDateTime(h.createdAt)}
                  </div>
                  {h.reason && (
                    <div className="mt-1 text-sm italic text-foreground">
                      &ldquo;{h.reason}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          ))}
      </section>

      {/* 03/08 — QR xuất THEO TỪNG PHIẾU THU (đợt), thay cho 1 nút QR mức đơn.
          Đơn cũ chưa có phiếu thu nào → giữ nguyên khối QR mức đơn để không mất
          khả năng thu tiền. */}
      {paymentRequests.length > 0 ? (
        <PaymentRequestsSection
          requests={paymentRequests}
          initialSessions={qrSessions}
          canManage={canManage}
          installmentPlanApproved={installmentPlanApproved}
        />
      ) : (
        <OrderQrSection qrUrl={qrUrl} transferContent={transferContent} dueNow={dueNow} />
      )}

      {/* G4 (3f) — nút "Đổi trạng thái" ở DƯỚI CÙNG, ngay sau "Thanh toán & QR". */}
      {canManage && nextOptions.length > 0 && (
        <div>
          <Button onClick={() => setStatusModalOpen(true)}>Đổi trạng thái</Button>
        </div>
      )}

      {/* Status change modal */}
      <Dialog
        open={statusModalOpen}
        onOpenChange={(o) => !isPending && setStatusModalOpen(o)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi trạng thái đơn hàng</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm">
              Hiện tại:{" "}
              <Badge variant="outline">
                {ORDER_STATUS_LABEL[order.status]}
              </Badge>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Chuyển sang:</label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as OrderStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái mới" />
                </SelectTrigger>
                <SelectContent>
                  {nextOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lý do (tuỳ chọn):</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatusModalOpen(false)}
              disabled={isPending}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={handleStatusChange}
              disabled={!newStatus || isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
