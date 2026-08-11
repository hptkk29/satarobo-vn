"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Loader2,
  Plus,
  Check,
  X,
  Pencil,
  Printer,
  Eye,
  EyeOff,
  ShieldAlert,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  recordPaymentAction,
  confirmPaymentAction,
  rejectPaymentAction,
  adjustPaymentAction,
  revealPaymentsPii,
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
  COLLECT_CONFIRMED: "bg-state-info-soft text-state-info-ink hover:bg-state-info-soft",
};

const ACC_LABEL: Record<string, string> = {
  PENDING: "Chờ kế toán",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Từ chối",
  REFUNDED: "Đã hoàn",
  ADJUSTED: "Điều chỉnh",
};
const ACC_BADGE: Record<string, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft",
  CONFIRMED: "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft",
  REJECTED: "bg-state-danger-soft text-state-danger-ink hover:bg-state-danger-soft",
  REFUNDED: "bg-primary-soft text-primary hover:bg-primary-soft",
  ADJUSTED: "bg-primary-soft text-primary hover:bg-primary-soft",
};

const METHOD_OPTIONS = [
  { value: "CASH", label: "Tiền mặt" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản" },
  { value: "VNPAY", label: "VNPAY" },
  { value: "TINGEE", label: "Tingee" },
  { value: "COD", label: "COD" },
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((m) => [m.value, m.label]),
);

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + " đ";
}
function fmtDate(d: string | Date): string {
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
  canViewPii,
}: {
  initialRows: PaymentRow[];
  orders: OrderOption[];
  canConfirm: boolean;
  canRecord: boolean;
  canViewPii: boolean;
}) {
  const [rows, setRows] = useState<PaymentRow[]>(initialRows);
  const [showForm, setShowForm] = useState(false);
  // #15 — break-glass: mặc định che CCCD PH + địa chỉ; kế toán mở xem đầy đủ có kiểm soát.
  const revealed = rows.length > 0 ? !rows[0]!.piiMasked : false;

  // Xác nhận/từ chối/điều chỉnh khoản thu chỉ hiện toast; dữ liệu mới về qua
  // revalidatePath("/payments") của action (_actions.ts:384) → prop đổi, nhưng useState
  // giữ nguyên giá trị mount đầu ⇒ trạng thái khoản thu đứng im tới khi F5. Đồng bộ lại.
  // Kèm hệ quả có chủ đích: dữ liệu mới là bản ĐÃ CHE PII → break-glass đóng lại, muốn
  // xem tiếp phải mở lại (và được audit lại) — an toàn hơn là giữ PII mở vô thời hạn.
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Số cột (đồng bộ colSpan hàng rỗng): đơn hàng, tên bé, lớp, số tiền, PT, ngày,
  // người thu, nguồn HV, tên PH, CCCD PH, địa chỉ, Sale, Kế toán, Phiếu thu (+ thao tác).
  const colCount = 14 + (canConfirm ? 1 : 0);

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

      {canViewPii && (
        <div className="flex items-center justify-between rounded-lg border border-state-warning-soft bg-state-warning-soft/60 px-4 py-2.5">
          <p className="text-xs text-state-warning-ink">
            CCCD phụ huynh &amp; địa chỉ được che mặc định (thông tin nhạy cảm).
            {revealed
              ? " Đang xem đầy đủ — hành động đã được ghi log."
              : " Mở xem đầy đủ cần lý do và sẽ được ghi log."}
          </p>
          <PiiRevealControl
            revealed={revealed}
            onRevealed={(unmaskedRows) => setRows(unmaskedRows)}
            onHide={() => setRows(initialRows)}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Đơn hàng</TableHead>
              <TableHead>Tên bé</TableHead>
              <TableHead>Lớp</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>Hình thức</TableHead>
              <TableHead>Ngày thu</TableHead>
              <TableHead>Người thu</TableHead>
              <TableHead>Nguồn HV</TableHead>
              <TableHead>Tên PH</TableHead>
              <TableHead>CCCD PH</TableHead>
              <TableHead>Địa chỉ</TableHead>
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
                  colSpan={colCount}
                  className="py-8 text-center text-sm text-neutral-500"
                >
                  Chưa có khoản thanh toán nào
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <div>{p.orderCode ?? "—"}</div>
                  <div className="text-xs text-neutral-500">
                    {p.customerName ?? ""}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{p.studentName ?? "—"}</TableCell>
                <TableCell className="text-xs">{p.className ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">
                  {vnd(p.amount)}
                </TableCell>
                <TableCell className="text-xs">{METHOD_LABEL[p.method] ?? p.method}</TableCell>
                <TableCell className="text-xs">{fmtDate(p.paidDate)}</TableCell>
                <TableCell className="text-xs">{p.collectedByName ?? "—"}</TableCell>
                <TableCell className="text-xs">{p.leadSource ?? "—"}</TableCell>
                <TableCell className="text-sm">{p.parentName ?? "—"}</TableCell>
                <TableCell
                  className={
                    "font-mono text-xs " +
                    (p.piiMasked ? "text-neutral-400" : "text-neutral-800")
                  }
                >
                  {p.parentNationalId ?? "—"}
                </TableCell>
                <TableCell
                  className={
                    "max-w-[180px] truncate text-xs " +
                    (p.piiMasked ? "text-neutral-400" : "text-neutral-800")
                  }
                  title={p.address ?? undefined}
                >
                  {p.address ?? "—"}
                </TableCell>
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
                  {p.hasActiveReceipt ? (
                    <a
                      href={`/payments/${p.id}/phieu-thu`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      title="In phiếu thu (PDF)"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      {p.receiptCode}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                {canConfirm && (
                  <TableCell className="text-right">
                    {p.accountantStatus === "PENDING" ? (
                      p.enrollmentId ? (
                        <RowActions paymentId={p.id} updatedAt={p.updatedAt} />
                      ) : (
                        // Đơn chưa convert → chưa gắn ghi danh → confirm sẽ lỗi. Chờ convert.
                        <span
                          className="text-xs text-neutral-400"
                          title="Khoản chưa gắn ghi danh — xác nhận được sau khi convert lead thành học viên"
                        >
                          Chờ convert
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── #15 — BREAK-GLASS "Xem đầy đủ" CCCD PH + địa chỉ (reason ≥10 + audit) ────────
const MIN_PII_REASON = 10;

function PiiRevealControl({
  revealed,
  onRevealed,
  onHide,
}: {
  revealed: boolean;
  onRevealed: (rows: PaymentRow[]) => void;
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (revealed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onHide}
        className="border-state-warning text-state-warning-ink hover:bg-state-warning-soft"
      >
        <EyeOff className="h-4 w-4" />
        Ẩn lại
      </Button>
    );
  }

  function submit() {
    if (reason.trim().length < MIN_PII_REASON) {
      toast.error(`Vui lòng nhập lý do tối thiểu ${MIN_PII_REASON} ký tự`);
      return;
    }
    start(async () => {
      // 1 đường DUY NHẤT: reveal vừa audit vừa trả rows raw (server đã reason≥10 + log).
      const res = await revealPaymentsPii({}, reason.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Đã mở xem đầy đủ. Hành động này đã được ghi log.");
      setOpen(false);
      setReason("");
      onRevealed(res.rows);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-state-warning text-state-warning-ink hover:bg-state-warning-soft"
      >
        <Eye className="h-4 w-4" />
        Xem đầy đủ
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-state-warning-ink" />
              Xem đầy đủ CCCD phụ huynh &amp; địa chỉ
            </DialogTitle>
            <DialogDescription>
              CCCD phụ huynh và địa chỉ đang được che mặc định. Mở xem đầy đủ là
              hành động có kiểm soát — bắt buộc nhập lý do và sẽ được ghi log riêng
              (ai, lúc nào, lý do gì).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="pii-reason" className="text-xs">
              Lý do (tối thiểu {MIN_PII_REASON} ký tự)
            </Label>
            <Textarea
              id="pii-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: đối soát hóa đơn/công nợ tháng 07 cho phụ huynh..."
              rows={3}
              disabled={pending}
            />
            <p className="text-xs text-neutral-400">
              {reason.trim().length}/{MIN_PII_REASON}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || reason.trim().length < MIN_PII_REASON}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Xác nhận xem đầy đủ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
