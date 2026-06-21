"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Check, X, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  recordPaymentAction,
  confirmPaymentAction,
  rejectPaymentAction,
  adjustPaymentAction,
  type PaymentRow,
} from "../_actions";

type OrderOption = {
  id: string;
  code: string;
  customerName: string;
  totalAmount: number;
};

const SALE_LABEL: Record<string, string> = {
  RECORDED: "Đã ghi nhận",
  COLLECT_CONFIRMED: "Đã xác nhận thu",
};
const SALE_BADGE: Record<string, string> = {
  RECORDED: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  COLLECT_CONFIRMED: "bg-blue-100 text-blue-800 hover:bg-blue-100",
};

const ACC_LABEL: Record<string, string> = {
  PENDING: "Chờ kế toán",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Từ chối",
  REFUNDED: "Đã hoàn",
  ADJUSTED: "Điều chỉnh",
};
const ACC_BADGE: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  CONFIRMED: "bg-green-100 text-green-800 hover:bg-green-100",
  REJECTED: "bg-red-100 text-red-800 hover:bg-red-100",
  REFUNDED: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  ADJUSTED: "bg-orange-100 text-orange-800 hover:bg-orange-100",
};

const METHOD_OPTIONS = [
  { value: "CASH", label: "Tiền mặt" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản" },
  { value: "VNPAY", label: "VNPAY" },
  { value: "TINGEE", label: "Tingee" },
  { value: "COD", label: "COD" },
];

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + " đ";
}
function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(d));
}

export function PaymentsClient({
  initialRows,
  orders,
  canConfirm,
  canRecord,
}: {
  initialRows: PaymentRow[];
  orders: OrderOption[];
  canConfirm: boolean;
  canRecord: boolean;
}) {
  const [rows] = useState<PaymentRow[]>(initialRows);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      {canRecord && (
        <div>
          <Button
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((s) => !s)}
          >
            <Plus className="h-4 w-4" />
            {showForm ? "Đóng form" : "Ghi nhận khoản"}
          </Button>
          {showForm && (
            <RecordForm
              orders={orders}
              onDone={() => setShowForm(false)}
            />
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Đơn hàng</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>PT</TableHead>
              <TableHead>Ngày thu</TableHead>
              <TableHead>Sale</TableHead>
              <TableHead>Kế toán</TableHead>
              <TableHead>Phiếu thu</TableHead>
              {canConfirm && <TableHead className="text-right">Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canConfirm ? 8 : 7}
                  className="py-8 text-center text-sm text-neutral-500"
                >
                  Chưa có khoản thanh toán nào
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => {
              const receipt = p.receipts.find((r) => r.status === "ACTIVE");
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <div>{p.order?.code ?? "—"}</div>
                    <div className="text-xs text-neutral-500">
                      {p.order?.customerName ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {vnd(p.amount)}
                  </TableCell>
                  <TableCell className="text-xs">{p.method}</TableCell>
                  <TableCell className="text-xs">{fmtDate(p.paidDate)}</TableCell>
                  <TableCell>
                    <Badge className={SALE_BADGE[p.saleStatus] ?? ""}>
                      {SALE_LABEL[p.saleStatus] ?? p.saleStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={ACC_BADGE[p.accountantStatus] ?? ""}>
                      {ACC_LABEL[p.accountantStatus] ?? p.accountantStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {receipt?.code ?? "—"}
                  </TableCell>
                  {canConfirm && (
                    <TableCell className="text-right">
                      {p.accountantStatus === "PENDING" ? (
                        <RowActions
                          paymentId={p.id}
                          updatedAt={new Date(p.updatedAt).toISOString()}
                        />
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── RECORD FORM ─────────────────────────────────────────────────────
function RecordForm({
  orders,
  onDone,
}: {
  orders: OrderOption[];
  onDone: () => void;
}) {
  const [orderId, setOrderId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!orderId) {
      toast.error("Chọn đơn hàng");
      return;
    }
    start(async () => {
      const res = await recordPaymentAction({
        orderId,
        enrollmentId: enrollmentId || null,
        amount: Number(amount),
        method,
        paidDate,
        evidenceUrl: evidenceUrl || null,
        note: note || null,
      });
      if (res.ok) {
        toast.success("Đã ghi nhận khoản thu");
        onDone();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Ghi nhận khoản thu</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Đơn hàng *</Label>
          <Select value={orderId} onValueChange={(v) => setOrderId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn đơn hàng" />
            </SelectTrigger>
            <SelectContent>
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.code} — {o.customerName} ({vnd(o.totalAmount)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Số tiền *</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Phương thức *</Label>
          <Select value={method} onValueChange={(v) => setMethod(v ?? "CASH")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHOD_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ngày thu *</Label>
          <Input
            type="date"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Enrollment ID (tuỳ chọn)</Label>
          <Input
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Link chứng từ (tuỳ chọn)</Label>
          <Input
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Ghi chú</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>
        <div className="sm:col-span-2">
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Ghi nhận
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// FIX-H9 — mã lỗi optimistic lock (đồng bộ với lib/finance/payment.ts STALE_WRITE).
const STALE_WRITE = "STALE_WRITE";

function handleStale(): void {
  toast.error("Người khác vừa sửa khoản này. Đang tải lại…");
  // reload để lấy updatedAt mới nhất; tránh tiếp tục ghi đè trên snapshot cũ.
  setTimeout(() => window.location.reload(), 800);
}

// ─── PER-ROW ACCOUNTANT ACTIONS ──────────────────────────────────────
function RowActions({
  paymentId,
  updatedAt,
}: {
  paymentId: string;
  updatedAt: string;
}) {
  const [mode, setMode] = useState<null | "reject" | "adjust">(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();

  function confirm() {
    // FIX-H8 — key ổn định cho lần bấm này → double-click/retry không sinh phiếu 2 lần.
    const idempotencyKey = crypto.randomUUID();
    start(async () => {
      const res = await confirmPaymentAction(paymentId, idempotencyKey);
      if (res.ok) {
        toast.success(
          res.receiptId ? "Đã xác nhận — đã sinh phiếu thu" : "Đã xác nhận",
        );
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function doReject() {
    start(async () => {
      const res = await rejectPaymentAction(paymentId, reason, updatedAt);
      if (res.ok) {
        toast.success("Đã từ chối khoản");
        setMode(null);
      } else if (res.error === STALE_WRITE) {
        handleStale();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function doAdjust() {
    start(async () => {
      const res = await adjustPaymentAction({
        paymentId,
        amount: Number(amount),
        reason,
        expectedUpdatedAt: updatedAt,
      });
      if (res.ok) {
        toast.success("Đã điều chỉnh khoản");
        setMode(null);
      } else if (res.error === STALE_WRITE) {
        handleStale();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  if (mode === "reject") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Lý do từ chối (≥5 ký tự)"
          className="w-56"
        />
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setMode(null)}>
            Huỷ
          </Button>
          <Button size="sm" variant="destructive" onClick={doReject} disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Từ chối
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "adjust") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Số tiền mới"
          className="w-56"
        />
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Lý do điều chỉnh (≥5 ký tự)"
          className="w-56"
        />
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setMode(null)}>
            Huỷ
          </Button>
          <Button size="sm" onClick={doAdjust} disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Lưu
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" onClick={confirm} disabled={pending} title="Xác nhận">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setMode("adjust")}
        title="Điều chỉnh"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setMode("reject")}
        title="Từ chối"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
