import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getParentOrders } from "@/lib/portal/billing";

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

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

export default async function HocPhiPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") redirect("/login");
  const orders = await getParentOrders(session.user.id);

  const unpaid = orders
    .filter((o) => o.status === "PENDING_PAYMENT")
    .reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-neutral-900">Học phí & đơn hàng</h1>

      {unpaid > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Còn <span className="font-bold">{vnd(unpaid)}</span> chờ thanh toán. Vui
          lòng liên hệ trung tâm (0818823720) để được hướng dẫn.
        </div>
      )}

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
    </div>
  );
}
