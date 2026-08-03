"use client";

// Bảng GIAO DỊCH TIỀN VỀ (BankTransaction) — sổ gốc của mọi phân bổ.
// Chỉ ĐỌC: xử lý tay (khớp lại, hoàn tiền) làm ở trang đơn nơi có đủ ngữ cảnh
// giảm giá/đợt thu. Cột "Rót vào phiếu" cho thấy tiền đã đi đâu — đây là thứ
// IntegrationLog cũ không trả lời được (log chỉ nói webhook chạy xong hay hỏng).

import Link from "next/link";
import { useMemo, useState } from "react";

export type AllocationView = {
  paymentRequestId: string;
  amount: number;
  installmentNo: number;
  amountDue: number;
  requestStatus: string;
  orderId: string | null;
  orderCode: string | null;
  customerName: string | null;
};

export type BankTxnItem = {
  id: string;
  at: string;
  provider: string;
  providerTxnId: string;
  amount: number;
  content: string | null;
  referenceCode: string | null;
  accountNumber: string | null;
  status: string;
  unmatchedNote: string | null;
  allocations: AllocationView[];
};

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  MATCHED: { label: "Đã khớp", cls: "bg-green-100 text-green-800" },
  UNMATCHED: { label: "Cần xử lý", cls: "bg-amber-100 text-amber-800" },
  IGNORED: { label: "Bỏ qua", cls: "bg-gray-100 text-gray-600" },
};

const REQUEST_STATUS_UI: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "chưa thu", cls: "text-gray-500" },
  PARTIAL: { label: "thu một phần", cls: "text-amber-700" },
  PAID: { label: "đã đủ", cls: "text-green-700" },
  VOID: { label: "đã huỷ", cls: "text-gray-400 line-through" },
};

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

function requestLabel(a: AllocationView): string {
  return a.installmentNo === 0 ? "Toàn đơn" : `Đợt ${a.installmentNo}`;
}

export function BankTxnClient({ items }: { items: BankTxnItem[] }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) =>
        (i.content ?? "").toLowerCase().includes(s) ||
        (i.referenceCode ?? "").toLowerCase().includes(s) ||
        i.provider.toLowerCase().includes(s) ||
        i.providerTxnId.toLowerCase().includes(s) ||
        String(i.amount).includes(s) ||
        i.allocations.some(
          (a) =>
            (a.orderCode ?? "").toLowerCase().includes(s) ||
            (a.customerName ?? "").toLowerCase().includes(s),
        ),
    );
  }, [items, q]);

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm theo mã đơn / nội dung CK / mã tham chiếu / số tiền / tên khách / cổng…"
        className="w-full max-w-md rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="w-36 px-3 py-2">Thời gian</th>
              <th className="w-32 px-3 py-2 text-right">Số tiền</th>
              <th className="px-3 py-2">Nội dung CK</th>
              <th className="w-32 px-3 py-2">Cổng</th>
              <th className="w-32 px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Rót vào phiếu thu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  {items.length === 0
                    ? "Chưa có giao dịch nào — chưa bật webhook cổng thanh toán hoặc chưa có tiền về."
                    : "Không có giao dịch khớp bộ lọc."}
                </td>
              </tr>
            )}
            {rows.map((i) => {
              const ui = STATUS_UI[i.status] ?? { label: i.status, cls: "bg-gray-100 text-gray-600" };
              const allocated = i.allocations.reduce((s, a) => s + a.amount, 0);
              const leftover = i.amount - allocated;
              return (
                <tr key={i.id} className={i.status === "UNMATCHED" ? "bg-amber-50/40" : undefined}>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">
                    {i.at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-semibold tabular-nums">
                    {fmt(i.amount)}đ
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="max-w-[300px] truncate font-mono text-xs text-gray-700" title={i.content ?? ""}>
                      {i.content ?? "—"}
                    </div>
                    {i.referenceCode && <div className="text-xs text-gray-400">ref {i.referenceCode}</div>}
                    {i.accountNumber && <div className="text-xs text-gray-400">TK {i.accountNumber}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">
                    <div className="font-medium">{i.provider}</div>
                    <div className="max-w-[120px] truncate text-gray-400" title={i.providerTxnId}>
                      {i.providerTxnId}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>
                      {ui.label}
                    </span>
                    {i.unmatchedNote && (
                      <div className="mt-1 max-w-[160px] text-xs text-amber-700">{i.unmatchedNote}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {i.allocations.length === 0 ? (
                      <span className="text-xs text-amber-700">
                        Chưa rót vào phiếu nào — mở đơn để xử lý tay
                      </span>
                    ) : (
                      <ul className="space-y-1">
                        {i.allocations.map((a) => {
                          const rs = REQUEST_STATUS_UI[a.requestStatus] ?? {
                            label: a.requestStatus,
                            cls: "text-gray-500",
                          };
                          return (
                            <li key={a.paymentRequestId} className="text-xs">
                              {a.orderId ? (
                                <Link
                                  href={`/orders/${a.orderId}`}
                                  className="font-medium text-blue-600 hover:underline"
                                >
                                  {a.orderCode ?? "(đơn)"}
                                </Link>
                              ) : (
                                <span className="font-medium text-gray-700">{a.orderCode ?? "(đơn)"}</span>
                              )}
                              <span className="text-gray-600">
                                {" "}
                                · {requestLabel(a)} · <b className="tabular-nums">{fmt(a.amount)}đ</b>
                                {" / "}
                                <span className="tabular-nums">{fmt(a.amountDue)}đ</span>{" "}
                                <span className={rs.cls}>({rs.label})</span>
                              </span>
                              {a.customerName && (
                                <span className="text-gray-400"> · {a.customerName}</span>
                              )}
                            </li>
                          );
                        })}
                        {leftover > 0 && (
                          <li className="text-xs text-amber-700">
                            Dư {fmt(leftover)}đ chưa rót — xem mục Tiền thừa bên dưới.
                          </li>
                        )}
                      </ul>
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
