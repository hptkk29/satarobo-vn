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
import {
  requestInstallmentApprovalAction,
  approveInstallmentPlanAction,
  rejectInstallmentPlanAction,
} from "./_installment-approval-actions";
import {
  approveOrderDiscountAction,
  rejectOrderDiscountAction,
} from "./_discount-approval-actions";
import { OrderInstallmentPlan, OrderQrSection } from "./order-payment-section";
import { ORDER_STATUS_LABEL } from "@/lib/orders/status";

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
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  APPROVED: "bg-green-100 text-green-800 hover:bg-green-100",
  REJECTED: "bg-red-100 text-red-800 hover:bg-red-100",
};

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
  // OD1b — duyệt kế hoạch trả góp 2 đợt.
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const approvalStatus = order.installmentApprovalStatus;
  // BGĐ 31/07 — duyệt giảm giá nhập tay (giải trình + QLCS duyệt).
  const discountStatus = order.discountApprovalStatus;
  const [discountRejectOpen, setDiscountRejectOpen] = useState(false);
  const [discountRejectReason, setDiscountRejectReason] = useState("");

  function handleApproveDiscount() {
    startTransition(async () => {
      const res = await approveOrderDiscountAction(order.id);
      if (res.ok) {
        toast.success("Đã duyệt giảm giá");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function handleRejectDiscount() {
    if (!discountRejectReason.trim()) {
      toast.error("Nhập lý do từ chối");
      return;
    }
    startTransition(async () => {
      const res = await rejectOrderDiscountAction(order.id, discountRejectReason);
      if (res.ok) {
        toast.success("Đã từ chối giảm giá");
        setDiscountRejectOpen(false);
        setDiscountRejectReason("");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }
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

  // OD1b — duyệt / từ chối / yêu cầu duyệt kế hoạch trả góp 2 đợt.
  function handleApprove() {
    startTransition(async () => {
      const res = await approveInstallmentPlanAction(order.id);
      if (res.ok) {
        toast.success("Đã duyệt kế hoạch trả góp 2 đợt");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }
    startTransition(async () => {
      const res = await rejectInstallmentPlanAction(order.id, rejectReason.trim());
      if (res.ok) {
        toast.success("Đã từ chối kế hoạch trả góp 2 đợt");
        setRejectModalOpen(false);
        setRejectReason("");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

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
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Thông tin khách hàng
        </h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-500">Tên: </span>
            <span className="font-medium text-gray-900">
              {order.customerName}
            </span>
          </div>
          <div>
            <span className="text-gray-500">SĐT: </span>
            <span className="text-gray-900">{order.customerPhone}</span>
          </div>
          <div>
            <span className="text-gray-500">Email: </span>
            <span className="text-gray-900">{order.customerEmail ?? "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Địa chỉ: </span>
            <span className="text-gray-900">
              {[order.customerAddress, order.customerWard, order.customerCity]
                .filter(Boolean)
                .join(", ") || "—"}
            </span>
          </div>
          {order.student && (
            <div>
              <span className="text-gray-500">Học sinh: </span>
              <span className="text-gray-900">{order.student.name}</span>
            </div>
          )}
          {order.lead && (
            <div>
              <span className="text-gray-500">Lead: </span>
              <span className="text-gray-900">{order.lead.parentName}</span>
            </div>
          )}
          {order.center && (
            <div>
              <span className="text-gray-500">Trung tâm: </span>
              <span className="text-gray-900">{order.center.name}</span>
            </div>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Sản phẩm ({order.items.length})
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="p-2 text-left">Tên</th>
              <th className="p-2 text-right">SL</th>
              <th className="p-2 text-right">Đơn giá</th>
              <th className="p-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-b border-gray-100">
                <td className="p-2">
                  <div className="font-medium text-gray-900">{it.itemName}</div>
                  {it.product && (
                    <Link
                      href={`/products/${it.product.id}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      → {it.product.sku}
                    </Link>
                  )}
                  {it.itemDescription && (
                    <div className="text-xs text-gray-500">
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
              <td colSpan={3} className="p-2 text-right text-gray-600">
                Tạm tính:
              </td>
              <td className="p-2 text-right tabular-nums">
                {order.subtotal.toLocaleString("vi-VN")}
              </td>
            </tr>
            {order.discountAmount > 0 && (
              <tr>
                <td colSpan={3} className="p-2 text-right text-gray-600">
                  Giảm giá
                  {/* Đơn CŨ tạo bằng mã khuyến mãi (hệ đã gỡ 03/08) vẫn hiện mã đã
                      dùng để đối soát lịch sử — không còn link tới màn voucher. */}
                  {order.voucherCode ? <> — mã {order.voucherCode}</> : null}
                  :
                </td>
                <td className="p-2 text-right text-red-600 tabular-nums">
                  -{order.discountAmount.toLocaleString("vi-VN")}
                </td>
              </tr>
            )}
            {order.shippingFee > 0 && (
              <tr>
                <td colSpan={3} className="p-2 text-right text-gray-600">
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
      </section>

      {/* Payment method (G4 — có nút "Sửa" khi đơn chưa xác nhận thanh toán) */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
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
            <span className="text-gray-500">Phương thức: </span>
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
              <span className="text-gray-900">
                {order.paymentMethod?.name ?? "—"}
              </span>
            )}
          </div>
          <div>
            <span className="text-gray-500">Mã GD ngân hàng: </span>
            <span className="text-gray-900">{order.bankReference ?? "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Gateway txn ID: </span>
            <span className="text-gray-900">{order.gatewayTxnId ?? "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Thanh toán lúc: </span>
            <span className="text-gray-900">
              {order.paidAt ? formatDateTime(order.paidAt) : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* BGĐ 31/07 — Duyệt giảm giá (chỉ hiện khi đơn có giảm giá nhập tay) */}
      {discountStatus && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
            Duyệt giảm giá
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-500">Trạng thái:</span>
              <Badge className={APPROVAL_BADGE_CLASS[discountStatus]}>
                {APPROVAL_LABEL[discountStatus]}
              </Badge>
              <span className="text-gray-500">
                Giảm {order.discountAmount.toLocaleString("vi-VN")} đ
                {order.discountPercent ? ` (${order.discountPercent}%)` : ""}
              </span>
            </div>
            {order.discountReason && (
              <div className="rounded-lg bg-gray-50 p-3 text-gray-700">
                <span className="font-semibold">Giải trình: </span>
                {order.discountReason}
              </div>
            )}
            {discountStatus === "APPROVED" && order.discountApprovedAt && (
              <p className="text-xs text-gray-500">
                Duyệt lúc {formatDateTime(order.discountApprovedAt)}
              </p>
            )}
            {discountStatus === "REJECTED" && order.discountRejectReason && (
              <div className="rounded-lg bg-red-50 p-3 text-red-700">
                Lý do từ chối: {order.discountRejectReason}
              </div>
            )}
            {canApproveDiscount && discountStatus === "PENDING_APPROVAL" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleApproveDiscount} disabled={isPending}>
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Duyệt giảm giá
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDiscountRejectOpen(true)}
                  disabled={isPending}
                >
                  Từ chối
                </Button>
              </div>
            )}
            {discountStatus === "PENDING_APPROVAL" && !canApproveDiscount && (
              <p className="text-xs text-amber-700">
                Đang chờ Quản lý cơ sở duyệt — đơn chưa thể xác nhận.
              </p>
            )}
          </div>

          {discountRejectOpen && (
            <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <label className="text-sm font-medium" htmlFor="discount-reject">
                Lý do từ chối (bắt buộc):
              </label>
              <Textarea
                id="discount-reject"
                value={discountRejectReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDiscountRejectReason(e.target.value)
                }
                rows={2}
                placeholder="VD: vượt khung ưu đãi cho phép"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleRejectDiscount} disabled={isPending}>
                  Xác nhận từ chối
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDiscountRejectOpen(false)}
                  disabled={isPending}
                >
                  Huỷ
                </Button>
              </div>
            </div>
          )}
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

      {/* OD1b — Duyệt kế hoạch trả góp 2 đợt (chỉ hiện khi có kế hoạch cần duyệt) */}
      {approvalStatus && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
            Duyệt kế hoạch trả góp 2 đợt
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-500">Trạng thái:</span>
              <Badge className={APPROVAL_BADGE_CLASS[approvalStatus]}>
                {APPROVAL_LABEL[approvalStatus]}
              </Badge>
            </div>
            {approvalStatus === "APPROVED" && order.installmentApprovedAt && (
              <p className="text-xs text-gray-500">
                Duyệt lúc {formatDateTime(order.installmentApprovedAt)}
              </p>
            )}
            {approvalStatus === "REJECTED" && order.installmentRejectReason && (
              <div className="rounded-lg bg-red-50 p-3 text-red-700">
                Lý do từ chối: {order.installmentRejectReason}
              </div>
            )}
            {canApprove && (
              <div className="flex flex-wrap gap-2">
                {approvalStatus === "PENDING_APPROVAL" && (
                  <>
                    <Button
                      size="sm"
                      onClick={handleApprove}
                      disabled={isPending}
                    >
                      {isPending && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Duyệt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRejectModalOpen(true)}
                      disabled={isPending}
                    >
                      Từ chối
                    </Button>
                  </>
                )}
                {approvalStatus === "REJECTED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRequestApproval}
                    disabled={isPending}
                  >
                    {isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Yêu cầu duyệt lại
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Notes */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Ghi chú
        </h2>
        <div className="space-y-3">
          {order.customerNote && (
            <div className="text-sm">
              <div className="mb-1 text-gray-500">Ghi chú khách hàng:</div>
              <div className="rounded-lg bg-yellow-50 p-3 text-gray-900">
                {order.customerNote}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Ghi chú nội bộ:</div>
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
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={historyOpen}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
            Lịch sử trạng thái ({order.history.length})
          </h2>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${historyOpen ? "rotate-180" : ""}`}
          />
        </button>
        {historyOpen &&
          (order.history.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Chưa có thay đổi trạng thái</p>
          ) : (
            <div className="mt-3 space-y-2">
            {order.history.map((h) => (
              <div
                key={h.id}
                className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm"
              >
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline">
                      {ORDER_STATUS_LABEL[h.fromStatus]}
                    </Badge>
                    <span className="mx-1 text-gray-400">→</span>
                    <Badge>{ORDER_STATUS_LABEL[h.toStatus]}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {h.changedByName} · {formatDateTime(h.createdAt)}
                  </div>
                  {h.reason && (
                    <div className="mt-1 text-sm italic text-gray-700">
                      &ldquo;{h.reason}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          ))}
      </section>

      {/* G4 — "Thanh toán & QR" gần cuối trang (chỉ còn QR sau khi tách kế hoạch 2 đợt). */}
      <OrderQrSection qrUrl={qrUrl} transferContent={transferContent} dueNow={dueNow} />

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

      {/* OD1b — Reject installment plan modal (reason bắt buộc) */}
      <Dialog
        open={rejectModalOpen}
        onOpenChange={(o) => !isPending && setRejectModalOpen(o)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Từ chối kế hoạch trả góp 2 đợt</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label className="text-sm font-medium">Lý do từ chối (bắt buộc):</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectModalOpen(false)}
              disabled={isPending}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={handleReject}
              disabled={isPending || !rejectReason.trim()}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
