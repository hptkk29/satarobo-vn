"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { Eye, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { queryOrders, type OrderFilters, type OrderRow } from "../_actions";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, deriveInstallmentBadge } from "@/lib/orders/status";
import type { OrderStatus, OrderType } from "@prisma/client";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

const ALL_STATUSES: OrderStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];
const ALL_TYPES: OrderType[] = ["COURSE", "PACKAGE", "EXAM", "PRODUCT", "COMBO"];

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  DRAFT: "bg-muted text-foreground hover:bg-muted",
  PENDING_PAYMENT: "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft",
  CONFIRMED: "bg-state-info-soft text-state-info-ink hover:bg-state-info-soft",
  COMPLETED: "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft",
  CANCELLED: "bg-state-danger-soft text-state-danger-ink hover:bg-state-danger-soft",
  REFUNDED: "bg-primary-soft text-primary hover:bg-primary-soft",
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

export function OrdersListClient() {
  const [filters, setFilters] = useState<OrderFilters>({});
  const [pendingFilters, setPendingFilters] = useState<OrderFilters>({});
  const [items, setItems] = useState<OrderRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(
    (reset: boolean, cursorOverride?: string | null) => {
      const useCursor = reset ? null : (cursorOverride ?? cursor);
      startTransition(async () => {
        try {
          const result = await queryOrders(filters, useCursor);
          setItems((prev) =>
            reset ? result.items : [...prev, ...result.items],
          );
          setCursor(result.nextCursor);
          setHasMore(!!result.nextCursor);
        } catch {
          toast.error("Lỗi tải đơn hàng");
        }
      });
    },
    [filters, cursor],
  );

  useEffect(() => {
    setCursor(null);
    setItems([]);
    setHasMore(false);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function applyFilters() {
    setFilters(pendingFilters);
  }
  function clearFilters() {
    setPendingFilters({});
    setFilters({});
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/50 p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-5">
          <Input
            type="date"
            value={pendingFilters.dateFrom ?? ""}
            onChange={(e) =>
              setPendingFilters({
                ...pendingFilters,
                dateFrom: e.target.value || undefined,
              })
            }
            placeholder="Từ ngày"
          />
          <Input
            type="date"
            value={pendingFilters.dateTo ?? ""}
            onChange={(e) =>
              setPendingFilters({
                ...pendingFilters,
                dateTo: e.target.value || undefined,
              })
            }
            placeholder="Đến ngày"
          />
          <Select
            value={pendingFilters.status ?? "ALL"}
            onValueChange={(v) =>
              setPendingFilters({
                ...pendingFilters,
                status: v === "ALL" ? undefined : (v as OrderStatus),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={pendingFilters.type ?? "ALL"}
            onValueChange={(v) =>
              setPendingFilters({
                ...pendingFilters,
                type: v === "ALL" ? undefined : (v as OrderType),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Loại" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả loại</SelectItem>
              {ALL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ORDER_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Mã đơn / SĐT / Tên KH"
            value={pendingFilters.search ?? ""}
            onChange={(e) =>
              setPendingFilters({
                ...pendingFilters,
                search: e.target.value || undefined,
              })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Xoá
          </Button>
          <Button size="sm" onClick={applyFilters} disabled={isPending}>
            Áp dụng
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <PhanTrangBang>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã đơn</TableHead>
                <TableHead>Khách hàng</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Số tiền (VND)</TableHead>
                <TableHead>Phương thức</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Tạo lúc</TableHead>
                <TableHead className="text-right">Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && !isPending ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Chưa có đơn hàng
                  </TableCell>
                </TableRow>
              ) : (
                items.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/60">
                    <TableCell className="font-mono text-sm">{o.code}</TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {o.customerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.customerPhone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ORDER_TYPE_LABEL[o.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {o.totalAmount.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {o.paymentMethod?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge className={STATUS_BADGE_CLASS[o.status]}>
                          {ORDER_STATUS_LABEL[o.status]}
                        </Badge>
                        {(() => {
                          const b = deriveInstallmentBadge(o.installments);
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
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/orders/${o.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-3.5 w-3.5" />
                          Xem
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </PhanTrangBang>
        {(hasMore || isPending) && (
          <div className="flex justify-center border-t border-border p-3">
            {isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải...
              </div>
            ) : hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => load(false)}
                disabled={isPending}
              >
                Tải thêm
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
