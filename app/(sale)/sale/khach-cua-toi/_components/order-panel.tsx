"use client";

// Đơn hàng của một khách + ghi nhận tiền đã thu.
//
// RANH GIỚI (viết ra để đừng ai nới dần): ở đây chỉ GHI NHẬN — "tôi đã cầm tiền".
// XÁC NHẬN (`payments:manage`, Kế toán/Super Admin) là việc khác: "sổ sách công
// nhận khoản này". Gộp hai nút là bỏ mất lớp đối soát. Cũng không có huỷ đơn,
// không hoàn tiền.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordPaymentAction } from "@/app/(admin)/admin/payments/_actions";
// `lib/orders/sale-orders.ts` là module SERVER-ONLY (nó đọc DB) — import
// từ component client là vỡ bundle. Định dạng tiền lấy ở nguồn chung.
import { formatVndPlain } from "@/lib/format/money";
import { Badge } from "@/components/ui/badge";
import { formatDateVN } from "@/lib/format/date";

export type OrderView = {
  id: string;
  code: string;
  status: string;
  totalAmount: number;
  daGhiNhan: number;
  createdAt: string;
  items: { id: string; itemName: string; quantity: number; unitPrice: number }[];
};

const TRANG_THAI_VI: Record<string, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  CONFIRMED: "Đã xác nhận",
  CANCELLED: "Đã huỷ",
  REFUNDED: "Đã hoàn tiền",
};

/** Ngày hôm nay theo giờ Việt Nam, dạng `YYYY-MM-DD` cho ô chọn ngày. */
function homNay(): string {
  const d = new Date();
  const vn = new Date(d.getTime() + (7 * 60 + d.getTimezoneOffset()) * 60_000);
  return vn.toISOString().slice(0, 10);
}

export function SaleOrderPanel({
  leadId,
  orders,
  tongDon,
  tongDaGhiNhan,
  conThieu,
  phuongThuc,
  choGhiDanh,
}: {
  leadId: string;
  orders: OrderView[];
  tongDon: number;
  tongDaGhiNhan: number;
  conThieu: number;
  phuongThuc: { id: string; name: string }[];
  /** Người xem có đủ quyền ghi danh không (`students:create` VÀ `enrollments:create`). */
  choGhiDanh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dangGhi, setDangGhi] = useState<string | null>(null);
  const [soTien, setSoTien] = useState(0);
  const [pt, setPt] = useState("");
  const [ngay, setNgay] = useState(homNay());
  const [ghiChu, setGhiChu] = useState("");

  function moForm(o: OrderView) {
    setDangGhi(o.id);
    // Gợi ý đúng phần còn thiếu của ĐƠN ĐÓ — con số hay gõ nhất, và gõ tay là
    // chỗ sinh sai lệch giữa tiền thật và sổ.
    setSoTien(Math.max(0, o.totalAmount - o.daGhiNhan));
    setPt(phuongThuc[0]?.name ?? "");
    setNgay(homNay());
    setGhiChu("");
  }

  function ghiNhan(orderId: string) {
    if (soTien <= 0 || !pt) return;
    start(async () => {
      const r = await recordPaymentAction({
        orderId,
        amount: soTien,
        method: pt,
        paidDate: ngay,
        note: ghiChu.trim() || null,
      });
      if (r.ok) {
        toast.success("Đã ghi nhận — kế toán sẽ đối soát và xác nhận");
        setDangGhi(null);
        router.refresh();
      } else {
        toast.error(r.error ?? "Không ghi nhận được");
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Đơn hàng &amp; thanh toán</h2>
        <Link
          href={`/sale/chot-don/${leadId}`}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Tạo đơn
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có đơn nào. Tạo đơn là bước bắt buộc trước khi ghi nhận tiền và chuyển
          khách thành học viên.
        </p>
      ) : (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-2 rounded-lg border border-border p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Tổng đơn</dt>
              <dd className="tabular-nums text-foreground">{formatVndPlain(tongDon)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Đã ghi nhận</dt>
              <dd className="tabular-nums text-foreground">{formatVndPlain(tongDaGhiNhan)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Còn thiếu</dt>
              <dd
                className={
                  conThieu > 0
                    ? "tabular-nums font-semibold text-amber-600 dark:text-amber-500"
                    : "tabular-nums text-foreground"
                }
              >
                {formatVndPlain(conThieu)}
              </dd>
            </div>
          </dl>

          <ul className="space-y-3">
            {orders.map((o) => {
              const thieu = Math.max(0, o.totalAmount - o.daGhiNhan);
              return (
                <li key={o.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-medium text-foreground">{o.code}</span>{" "}
                      <Badge variant="outline">{TRANG_THAI_VI[o.status] ?? o.status}</Badge>
                      <div className="text-xs text-muted-foreground">
                        {formatDateVN(new Date(o.createdAt))}
                        {o.items.length > 0 ? ` · ${o.items.map((i) => i.itemName).join(", ")}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="tabular-nums text-foreground">{formatVndPlain(o.totalAmount)}</div>
                      {thieu > 0 ? (
                        <div className="text-xs tabular-nums text-amber-600 dark:text-amber-500">
                          còn {formatVndPlain(thieu)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">đã đủ</div>
                      )}
                    </div>
                  </div>

                  {dangGhi === o.id ? (
                    <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-4">
                      <input
                        type="number"
                        min={1}
                        step={1000}
                        value={soTien}
                        onChange={(e) => setSoTien(Math.max(0, Number(e.target.value) || 0))}
                        className="h-9 rounded-lg border border-border bg-background px-3 text-sm tabular-nums"
                        placeholder="Số tiền"
                      />
                      <select
                        value={pt}
                        onChange={(e) => setPt(e.target.value)}
                        className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                      >
                        {phuongThuc.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={ngay}
                        onChange={(e) => setNgay(e.target.value)}
                        className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                      />
                      <input
                        value={ghiChu}
                        onChange={(e) => setGhiChu(e.target.value)}
                        placeholder="Ghi chú"
                        className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                      />
                      <div className="flex gap-2 sm:col-span-4">
                        <button
                          type="button"
                          onClick={() => ghiNhan(o.id)}
                          disabled={pending || soTien <= 0 || !pt}
                          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {pending ? "Đang ghi…" : "Ghi nhận"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDangGhi(null)}
                          disabled={pending}
                          className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                        >
                          Thôi
                        </button>
                      </div>
                    </div>
                  ) : thieu > 0 ? (
                    <button
                      type="button"
                      onClick={() => moForm(o)}
                      className="mt-2 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      Ghi nhận thanh toán
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Bước kế tiếp chỉ hiện khi ĐÃ có tiền: hệ thống chặn chốt khi chưa
              ghi nhận khoản nào, nên vẽ nút ra sớm là mời người dùng đi vào một
              cánh cửa đóng. */}
          {choGhiDanh && tongDaGhiNhan > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <span className="text-sm text-muted-foreground">
                Khách đã đóng tiền — chốt được rồi.
              </span>
              <Link
                href={`/sale/ghi-danh/${leadId}`}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Ghi danh vào lớp →
              </Link>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            Ghi nhận nghĩa là bạn đã cầm tiền. Kế toán đối soát rồi mới{" "}
            <strong>xác nhận</strong> — hai bước tách nhau có chủ đích.
          </p>
        </>
      )}
    </section>
  );
}
