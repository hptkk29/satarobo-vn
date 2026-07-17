"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { VoucherType, VoucherDiscountKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toggleVoucherActiveAction } from "../_actions";
import { VOUCHER_TYPE_LABEL } from "@/lib/validators/voucher";
import { formatDateVN } from "@/lib/format/date";

type VoucherRow = {
  id: string;
  code: string;
  name: string;
  type: VoucherType;
  discountKind: VoucherDiscountKind;
  discountPercent: number | null;
  discountAmount: number | null;
  maxDiscount: number | null;
  quantity: number | null;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
};

function discountDisplay(v: VoucherRow): string {
  if (v.discountKind === "PERCENT") {
    const max = v.maxDiscount
      ? `, max ${v.maxDiscount.toLocaleString("vi-VN")}đ`
      : "";
    return `${v.discountPercent}%${max}`;
  }
  return `${v.discountAmount?.toLocaleString("vi-VN") ?? "—"}đ`;
}

function ValidityBadge({ v }: { v: VoucherRow }) {
  const now = new Date();
  if (v.validUntil < now) {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
        Hết hạn
      </Badge>
    );
  }
  if (v.validFrom > now) {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
        Chưa bắt đầu
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
      Trong hạn
    </Badge>
  );
}

export function VouchersTable({
  vouchers,
  canManage,
}: {
  vouchers: VoucherRow[];
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<VoucherRow | null>(null);

  function onConfirm() {
    if (!confirmTarget) return;
    const id = confirmTarget.id;
    const wasActive = confirmTarget.isActive;
    startTransition(async () => {
      const r = await toggleVoucherActiveAction(id);
      if (r.ok) {
        toast.success(wasActive ? "Đã vô hiệu hoá" : "Đã kích hoạt");
        setConfirmTarget(null);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Loại đơn</TableHead>
              <TableHead>Giảm</TableHead>
              <TableHead className="text-right">Đã dùng</TableHead>
              <TableHead>Hiệu lực</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vouchers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-gray-500"
                >
                  Chưa có voucher nào
                </TableCell>
              </TableRow>
            ) : (
              vouchers.map((v) => (
                <TableRow key={v.id} className="hover:bg-gray-50/60">
                  <TableCell className="font-mono text-sm">{v.code}</TableCell>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {VOUCHER_TYPE_LABEL[v.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {discountDisplay(v)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    <Link
                      href={`/vouchers/${v.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {v.usedCount}
                      {v.quantity != null ? ` / ${v.quantity}` : " / ∞"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    <ValidityBadge v={v} />
                    <div className="mt-1 text-gray-500">
                      {formatDateVN(v.validFrom)} →{" "}
                      {formatDateVN(v.validUntil)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {v.isActive ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        Hoạt động
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">
                        Tắt
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/vouchers/${v.id}/edit`}>
                          <Button variant="outline" size="sm">
                            <Pencil className="h-3.5 w-3.5" />
                            Sửa
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setConfirmTarget(v)}
                        >
                          {v.isActive ? "Tắt" : "Bật"}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!confirmTarget}
        onOpenChange={(o) => !isPending && !o && setConfirmTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.isActive
                ? "Vô hiệu hoá voucher?"
                : "Kích hoạt voucher?"}
            </DialogTitle>
            <DialogDescription>
              <strong>{confirmTarget?.name}</strong> ({confirmTarget?.code}){" "}
              {confirmTarget?.isActive
                ? "sẽ không áp dụng được cho đơn mới."
                : "sẽ áp dụng được trở lại cho đơn mới."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmTarget(null)}
              disabled={isPending}
            >
              Huỷ
            </Button>
            <Button type="button" onClick={onConfirm} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmTarget?.isActive ? "Vô hiệu hoá" : "Kích hoạt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
