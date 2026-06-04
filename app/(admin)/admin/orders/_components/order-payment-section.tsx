"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { QrCode, BadgeCheck } from "lucide-react";
import { recordOrderInstallmentsAction, markOrderInstallmentPaidAction } from "../_actions";

type Installment = {
  id: string;
  soDot: number;
  amount: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
};

function vnd(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

// Commit 4 — QR thanh toán + kế hoạch 2 đợt (gate orders:manage qua action).
export function OrderPaymentSection({
  orderId,
  totalAmount,
  canManage,
  qrUrl,
  transferContent,
  installments,
}: {
  orderId: string;
  totalAmount: number;
  canManage: boolean;
  qrUrl: string | null;
  transferContent: string;
  installments: Installment[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dot1, setDot1] = useState(installments.find((i) => i.soDot === 1)?.amount ?? totalAmount);
  const [dot2, setDot2] = useState(installments.find((i) => i.soDot === 2)?.amount ?? 0);
  const [dot2Due, setDot2Due] = useState(
    installments.find((i) => i.soDot === 2)?.dueDate?.slice(0, 10) ?? "",
  );

  function save() {
    if (dot1 + dot2 !== totalAmount) {
      toast.error(`Tổng 2 đợt phải bằng ${vnd(totalAmount)}`);
      return;
    }
    if (dot2 > 0 && !dot2Due) {
      toast.error("Chọn ngày hẹn đóng đợt 2");
      return;
    }
    start(async () => {
      const res = await recordOrderInstallmentsAction({
        orderId,
        dot1Amount: dot1,
        dot2Amount: dot2,
        dot2DueDate: dot2 > 0 ? dot2Due : null,
      });
      if (res.ok) {
        toast.success("Đã lưu kế hoạch thanh toán");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function markPaid(id: string) {
    start(async () => {
      const res = await markOrderInstallmentPaidAction(id, orderId);
      if (res.ok) {
        toast.success("Đã ghi nhận đóng đợt 2");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
        <QrCode className="h-4 w-4 text-[#7C3AED]" /> Thanh toán & QR
      </h2>

      <div className="grid gap-5 md:grid-cols-2">
        {/* QR */}
        <div>
          {qrUrl ? (
            <div className="flex flex-col items-center gap-2">
              {/* Ảnh QR public từ img.vietqr.io — không cần API key. */}
              <img src={qrUrl} alt="VietQR thanh toán" className="h-56 w-56 rounded-lg border border-neutral-200 object-contain" />
              <p className="text-center text-xs text-neutral-500">
                Nội dung CK: <span className="font-mono font-semibold text-neutral-700">{transferContent}</span>
              </p>
            </div>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center">
              <QrCode className="h-8 w-8 text-neutral-300" />
              <p className="text-sm text-neutral-500">Chưa cấu hình tài khoản nhận tiền.</p>
              <a href="/tich-hop" className="text-xs font-semibold text-purple-700 underline">
                Cấu hình VietQR trong Tích hợp →
              </a>
            </div>
          )}
        </div>

        {/* Kế hoạch 2 đợt */}
        <div>
          <div className="mb-3 space-y-2">
            {installments.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                <span>
                  <b>Đợt {i.soDot}</b> · {vnd(i.amount)}
                  {i.soDot === 2 && i.dueDate ? ` · hẹn ${new Date(i.dueDate).toLocaleDateString("vi-VN")}` : ""}
                </span>
                {i.status === "PAID" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <BadgeCheck className="h-4 w-4" /> Đã đóng
                  </span>
                ) : canManage ? (
                  <button onClick={() => markPaid(i.id)} disabled={pending} className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50">
                    Đánh dấu đã đóng
                  </button>
                ) : (
                  <span className="text-xs text-amber-600">Chờ đóng</span>
                )}
              </div>
            ))}
            {installments.length === 0 && <p className="text-sm text-neutral-400">Chưa thiết lập kế hoạch.</p>}
          </div>

          {canManage && (
            <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
              <p className="text-xs font-semibold text-neutral-500">Thiết lập tối đa 2 đợt (tổng = {vnd(totalAmount)})</p>
              <label className="block text-sm">
                <span className="text-xs text-neutral-500">Đợt 1 — đã thu (đ)</span>
                <input type="number" min={0} value={dot1} onChange={(e) => setDot1(Number(e.target.value) || 0)} className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-xs text-neutral-500">Đợt 2 — còn lại (đ)</span>
                  <input type="number" min={0} value={dot2} onChange={(e) => setDot2(Number(e.target.value) || 0)} className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-neutral-500">Hẹn đóng đợt 2</span>
                  <input type="date" value={dot2Due} onChange={(e) => setDot2Due(e.target.value)} disabled={dot2 <= 0} className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50" />
                </label>
              </div>
              <button onClick={save} disabled={pending} className="w-full rounded-md bg-purple-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {pending ? "Đang lưu…" : "Lưu kế hoạch thanh toán"}
              </button>
              <p className="text-[11px] text-neutral-400">Nhắc công nợ đợt 2 tự động từ ≤14 ngày trước hạn (email).</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
