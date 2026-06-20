import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getParentOrders,
  getParentConfirmedPayments,
  getParentTuitionTotal,
} from "@/lib/portal/billing";
import { hotlinesInline } from "@/lib/locations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học phí | Sata Robo", robots: { index: false } };

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Nháp", cls: "bg-neutral-100 text-neutral-600" },
  PENDING_PAYMENT: { label: "Chờ thanh toán", cls: "bg-amber-100 text-amber-700" },
  CONFIRMED: { label: "Đã thanh toán", cls: "bg-emerald-100 text-emerald-700" },
  COMPLETED: { label: "Hoàn tất", cls: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Đã huỷ", cls: "bg-neutral-100 text-neutral-500" },
  REFUNDED: { label: "Đã hoàn tiền", cls: "bg-rose-100 text-rose-700" },
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  VNPAY: "VNPAY",
  TINGEE: "Tingee",
  COD: "COD",
};

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default async function HocPhiPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") redirect("/login");

  const [orders, confirmed, tuitionTotal] = await Promise.all([
    getParentOrders(session.user.id),
    // R7-04 / G.6 — PH chỉ thấy khoản đã KẾ TOÁN XÁC NHẬN (CONFIRMED). PENDING không lộ.
    getParentConfirmedPayments(session.user.id),
    getParentTuitionTotal(session.user.id),
  ]);

  const unpaid = orders
    .filter((o) => o.status === "PENDING_PAYMENT")
    .reduce((s, o) => s + o.totalAmount, 0);

  const paidTotal = confirmed.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const balance = tuitionTotal - paidTotal;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-neutral-900">Học phí & đơn hàng</h1>

      {/* Số dư học phí — Σ học phí − Σ khoản đã xác nhận */}
      {tuitionTotal > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">Tổng học phí</p>
            <p className="mt-1 text-lg font-bold text-neutral-900">{vnd(tuitionTotal)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700">Đã thanh toán</p>
            <p className="mt-1 text-lg font-bold text-emerald-800">{vnd(paidTotal)}</p>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              balance > 0
                ? "border-amber-200 bg-amber-50"
                : "border-neutral-200 bg-white"
            }`}
          >
            <p className={`text-xs ${balance > 0 ? "text-amber-700" : "text-neutral-500"}`}>
              Còn lại
            </p>
            <p
              className={`mt-1 text-lg font-bold ${
                balance > 0 ? "text-amber-800" : "text-neutral-900"
              }`}
            >
              {vnd(Math.max(0, balance))}
            </p>
          </div>
        </div>
      )}

      {unpaid > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Còn <span className="font-bold">{vnd(unpaid)}</span> chờ thanh toán. Vui
          lòng liên hệ trung tâm ({hotlinesInline()}) để được hướng dẫn.
        </div>
      )}

      {/* Khoản đã thanh toán (đã kế toán xác nhận) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-700">Khoản đã thanh toán</h2>
        {confirmed.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
            Chưa có khoản nào được xác nhận.
          </p>
        ) : (
          <ul className="space-y-2">
            {confirmed.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">
                      {p.studentName ?? "—"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {METHOD_LABEL[p.method?.toUpperCase()] ?? p.method} · {fmtDate(p.paidDate)}
                      {p.receiptCode ? ` · Phiếu thu ${p.receiptCode}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-700">{vnd(Number(p.amount))}</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Đã xác nhận
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Đơn hàng */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-700">Đơn hàng</h2>
        {orders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
            Chưa có đơn hàng/học phí nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => {
              const st = STATUS[o.status] ?? STATUS.DRAFT;
              return (
                <li
                  key={o.id}
                  className="rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900">{o.code}</p>
                      <p className="text-xs text-neutral-500">
                        {o.studentName ? `${o.studentName} · ` : ""}
                        {new Date(o.createdAt).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-neutral-900">{vnd(o.totalAmount)}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </div>
                  </div>
                  {o.items.length > 0 && (
                    <p className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
                      {o.items.join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
