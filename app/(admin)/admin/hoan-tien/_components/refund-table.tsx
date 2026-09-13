"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RefundRow } from "@/lib/finance/refund";
import { approveRefundAction, rejectRefundAction } from "../_actions";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + " đ";
}

const TRIGGER_LABEL: Record<RefundRow["trigger"], string> = {
  WITHDRAW: "Rút học",
  TRANSFER: "Chuyển lớp",
  CLASS_CANCELLED: "Hủy lớp",
  MANUAL: "Thủ công",
};

const STATUS_BADGE: Record<RefundRow["status"], string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft",
  APPROVED: "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft",
  REJECTED: "bg-state-danger-soft text-state-danger-ink hover:bg-state-danger-soft",
  PAID: "bg-state-info-soft text-state-info-ink hover:bg-state-info-soft",
};
const STATUS_LABEL: Record<RefundRow["status"], string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  PAID: "Đã chi",
};

export function RefundTable({
  rows,
  canApprove,
}: {
  rows: RefundRow[];
  canApprove: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  function onApprove(id: string) {
    // 2-click confirm: click 1 = arm, click 2 = thực thi.
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    startTransition(async () => {
      const res = await approveRefundAction(id);
      if (res.ok) toast.success("Đã duyệt hoàn tiền");
      else toast.error(res.error);
      setConfirmId(null);
    });
  }

  function onReject() {
    if (!rejectId) return;
    const id = rejectId;
    startTransition(async () => {
      const res = await rejectRefundAction(id, rejectNote);
      if (res.ok) {
        toast.success("Đã từ chối hoàn tiền");
        setRejectId(null);
        setRejectNote("");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border">
        <PhanTrangBang cuonNgang>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Học viên / Lớp</TableHead>
                <TableHead>Lý do</TableHead>
                <TableHead className="text-right">Đã thu</TableHead>
                <TableHead className="text-right">Buổi (học/tổng)</TableHead>
                <TableHead className="text-right">Đề xuất hoàn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Không có yêu cầu hoàn tiền
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {r.studentName ?? "(Không rõ HV)"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.className ?? r.enrollmentId.slice(0, 8)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{TRIGGER_LABEL[r.trigger]}</Badge>
                    <div className="mt-1 max-w-[16rem] truncate text-xs text-muted-foreground">
                      {r.reason}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{vnd(r.paidConfirmed)}</TableCell>
                  <TableCell className="text-right">
                    {r.sessionsLearned}/{r.sessionsTotal}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {vnd(r.status === "APPROVED" && r.approvedAmount != null
                      ? r.approvedAmount
                      : r.proposedAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canApprove && r.status === "PENDING" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant={confirmId === r.id ? "default" : "outline"}
                          disabled={isPending}
                          onClick={() => onApprove(r.id)}
                        >
                          {confirmId === r.id ? "Xác nhận duyệt" : "Duyệt"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => {
                            setRejectId(r.id);
                            setRejectNote("");
                          }}
                        >
                          Từ chối
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PhanTrangBang>
      </div>

      <Dialog
        open={rejectId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRejectId(null);
            setRejectNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối hoàn tiền</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Nhập lý do từ chối (≥5 ký tự)…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectId(null);
                setRejectNote("");
              }}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={onReject}
              disabled={isPending || rejectNote.trim().length < 5}
            >
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
