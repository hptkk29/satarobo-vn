"use client";

// Bảng giao dịch tiền về. Chỉ ĐỌC — xác nhận tay (khi máy không tự khớp được)
// làm ở trang đơn, nơi có đủ ngữ cảnh giảm giá/đợt thu, không làm tắt ở đây.

import Link from "next/link";
import { useMemo, useState } from "react";

type Item = {
  id: string;
  at: string;
  action: string;
  status: string;
  error: string | null;
  amount: number;
  gateway: string | null;
  referenceCode: string | null;
  content: string | null;
  orderCode: string | null;
  order: { id: string; status: string; totalAmount: number; customerName: string } | null;
};

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  SUCCESS: { label: "Đã tự xác nhận", cls: "bg-green-100 text-green-800" },
  SKIPPED: { label: "Bỏ qua", cls: "bg-gray-100 text-gray-600" },
  FAILED: { label: "Cần xử lý", cls: "bg-amber-100 text-amber-800" },
  PENDING: { label: "Đang xử lý", cls: "bg-blue-100 text-blue-700" },
};

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

export function SepayLogClient({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) =>
        (i.orderCode ?? "").toLowerCase().includes(s) ||
        (i.content ?? "").toLowerCase().includes(s) ||
        (i.referenceCode ?? "").toLowerCase().includes(s) ||
        (i.order?.customerName ?? "").toLowerCase().includes(s) ||
        String(i.amount).includes(s),
    );
  }, [items, q]);

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm theo mã đơn / nội dung CK / mã tham chiếu / số tiền / tên khách…"
        className="w-full max-w-md rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="w-36 px-3 py-2">Thời gian</th>
              <th className="w-32 px-3 py-2 text-right">Số tiền</th>
              <th className="px-3 py-2">Nội dung CK</th>
              <th className="w-40 px-3 py-2">Đơn khớp</th>
              <th className="w-36 px-3 py-2">Kết quả</th>
              <th className="px-3 py-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  {items.length === 0
                    ? "Chưa có giao dịch nào — chưa bật webhook SePay hoặc chưa có tiền về."
                    : "Không có giao dịch khớp bộ lọc."}
                </td>
              </tr>
            )}
            {rows.map((i) => {
              const ui = STATUS_UI[i.status] ?? { label: i.status, cls: "bg-gray-100 text-gray-600" };
              return (
                <tr key={i.id} className={i.status === "FAILED" ? "bg-amber-50/40" : undefined}>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">
                    {i.at.slice(0, 16).replace("T", " ")}
                    {i.gateway && <div className="text-gray-400">{i.gateway}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-semibold tabular-nums">
                    {i.amount > 0 ? `${fmt(i.amount)}đ` : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="max-w-[320px] truncate font-mono text-xs text-gray-700" title={i.content ?? ""}>
                      {i.content ?? "—"}
                    </div>
                    {i.referenceCode && (
                      <div className="text-xs text-gray-400">ref {i.referenceCode}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {i.order ? (
                      <>
                        <Link href={`/orders/${i.order.id}`} className="font-medium text-blue-600 hover:underline">
                          {i.orderCode}
                        </Link>
                        <div className="text-xs text-gray-500">{i.order.customerName}</div>
                        <div className="text-xs text-gray-400">
                          Tổng {fmt(i.order.totalAmount)}đ · {i.order.status}
                        </div>
                      </>
                    ) : i.orderCode ? (
                      <span className="text-xs text-gray-500">
                        {i.orderCode}
                        <br />
                        <span className="text-amber-700">(không tìm thấy đơn)</span>
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">Nội dung CK không có mã đơn</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>
                      {ui.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">
                    {i.error ?? (i.status === "SUCCESS" ? "Đơn đã xác nhận + cấp TK phụ huynh" : "—")}
                    {i.status === "FAILED" && i.order && (
                      <div className="mt-1">
                        <Link href={`/orders/${i.order.id}`} className="font-semibold text-orange-700 hover:underline">
                          Mở đơn để xử lý →
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
