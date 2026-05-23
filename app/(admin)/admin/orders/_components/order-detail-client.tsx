"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Prisma, OrderStatus } from "@prisma/client";
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
} from "../_actions";
import { ORDER_STATUS_LABEL } from "@/lib/orders/status";

type OrderWithIncludes = Prisma.OrderGetPayload<{
  include: {
    items: true;
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
}: {
  order: OrderWithIncludes;
  canManage: boolean;
}) {
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | "">("");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState(order.internalNote ?? "");
  const [isPending, startTransition] = useTransition();

  const nextOptions = NEXT_STATUSES[order.status];

  function handleStatusChange() {
    if (!newStatus) return;
    startTransition(async () => {
      const result = await changeOrderStatusAction(order.id, {
        toStatus: newStatus,
        reason,
      });
      if (result.ok) {
        toast.success("Đã đổi trạng thái");
        setStatusModalOpen(false);
        window.location.reload();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSaveNote() {
    startTransition(async () => {
      const result = await updateOrderNoteAction(order.id, internalNote);
      if (result.ok) toast.success("Đã lưu ghi chú");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {canManage && nextOptions.length > 0 && (
        <div>
          <Button onClick={() => setStatusModalOpen(true)}>
            Đổi trạng thái
          </Button>
        </div>
      )}

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
                  {order.voucherCode ? ` (${order.voucherCode})` : ""}:
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

      {/* Payment */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Thanh toán
        </h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-500">Phương thức: </span>
            <span className="text-gray-900">
              {order.paymentMethod?.name ?? "—"}
            </span>
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
            <div className="text-sm text-gray-500">Ghi chú nội bộ (admin):</div>
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
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Lịch sử trạng thái ({order.history.length})
        </h2>
        {order.history.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có thay đổi trạng thái</p>
        ) : (
          <div className="space-y-2">
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
        )}
      </section>

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
