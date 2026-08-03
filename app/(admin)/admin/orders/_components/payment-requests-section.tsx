"use client";

// Danh sách PHIẾU THU của đơn + nút "Xuất QR" NGAY TRÊN TỪNG DÒNG (không phải nút
// cấp đơn). Sale nhìn một bảng là biết đợt nào còn thiếu bao nhiêu và quét mã nào.
//
// ⚠️ Đồng hồ đếm ngược ở đây CHỈ LÀ HIỂN THỊ. QR hết hạn VẪN nhận được tiền — định
// danh đối khớp (matchKey) bền theo đời phiếu, không theo phiên QR. Dòng chữ nhắc
// điều đó phải luôn hiện cạnh đồng hồ, nếu không sale sẽ tưởng hết giờ là mất tiền
// và giục phụ huynh chuyển lại → tiền về 2 lần.

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { QrCode, RefreshCw, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { issueQrForRequest, regenerateQr } from "../_qr-actions";
import type { QrIssueResult, QrSessionView } from "../_qr-core";
import { formatDateVN } from "@/lib/format/date";

export type PaymentRequestRow = {
  id: string;
  /** 0 = thu toàn bộ đơn; 1,2,… = số thứ tự đợt. */
  installmentNo: number;
  amountDue: number;
  /** Tổng đã phân bổ về phiếu này (từ PaymentAllocation). */
  allocated: number;
  dueDate: string | null;
  status: "PENDING" | "PARTIAL" | "PAID" | "VOID";
  matchKey: string | null;
};

const STATUS_LABEL: Record<PaymentRequestRow["status"], string> = {
  PENDING: "Chờ thu",
  PARTIAL: "Thu một phần",
  PAID: "Đã đủ",
  VOID: "Đã huỷ",
};

const STATUS_CLASS: Record<PaymentRequestRow["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  PARTIAL: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  PAID: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  VOID: "bg-neutral-200 text-neutral-600 hover:bg-neutral-200",
};

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

function outstanding(r: PaymentRequestRow): number {
  if (r.status === "VOID") return 0;
  return Math.max(0, r.amountDue - r.allocated);
}

function requestLabel(r: PaymentRequestRow, totalDots: number): string {
  if (r.installmentNo === 0) return "Thu toàn bộ đơn";
  return totalDots > 1 ? `Đợt ${r.installmentNo}/${totalDots}` : `Đợt ${r.installmentNo}`;
}

/** Đồng hồ đếm ngược tới `expiresAt` — chỉ hiển thị, không chặn tiền về. */
function Countdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    setLeft(new Date(expiresAt).getTime() - Date.now());
    const t = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) onExpire();
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);

  if (left <= 0) return <span className="font-semibold text-red-600">QR đã hết hạn</span>;
  const total = Math.floor(left / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return (
    <span className="font-mono text-lg font-bold tabular-nums text-neutral-800">
      {mm}:{ss}
    </span>
  );
}

function QrPanel({
  session,
  label,
  expired,
  pending,
  onRegenerate,
  onExpire,
  canManage,
}: {
  session: QrSessionView;
  label: string;
  expired: boolean;
  pending: boolean;
  onRegenerate: () => void;
  onExpire: () => void;
  canManage: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="shrink-0">
          {session.imageSrc ? (
            // Ảnh QR: URL public img.vietqr.io hoặc data-URL sinh từ chuỗi của cổng.
            <img
              src={session.imageSrc}
              alt={`QR thanh toán ${label}`}
              className={`h-52 w-52 rounded-lg border border-neutral-200 bg-white object-contain ${expired ? "opacity-40" : ""}`}
            />
          ) : (
            <div className="flex h-52 w-52 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white text-xs text-neutral-400">
              Không dựng được ảnh QR
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="text-base font-bold text-neutral-900">
            {label}: {vnd(session.amountShown)}
          </p>
          {session.matchKey && (
            <p className="break-all text-xs text-neutral-600">
              Nội dung CK:{" "}
              <span className="font-mono font-semibold text-neutral-800">
                {session.matchKey}
              </span>
            </p>
          )}
          {session.checkoutUrl && (
            <a
              href={session.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-semibold text-purple-700 underline"
            >
              Mở trang thanh toán của cổng →
            </a>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              Hiệu lực hiển thị
            </span>
            <Countdown expiresAt={session.expiresAt} onExpire={onExpire} />
          </div>

          {/* BẤT BIẾN THIẾT KẾ — đừng gỡ dòng này. */}
          <p className="rounded-md bg-white/80 px-3 py-2 text-xs text-neutral-600">
            QR hết hạn <b>vẫn nhận được tiền</b> — nếu phụ huynh đã chuyển, không cần
            tạo lại. Đồng hồ chỉ để biết mã đã hiển thị bao lâu.
          </p>

          {canManage && (
            <Button size="sm" variant="outline" onClick={onRegenerate} disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Tạo lại QR
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PaymentRequestsSection({
  requests,
  initialSessions,
  canManage,
  installmentPlanApproved,
}: {
  requests: PaymentRequestRow[];
  /** Phiên QR ACTIVE còn hạn của từng phiếu (server đọc sẵn lúc render). */
  initialSessions: Record<string, QrSessionView>;
  canManage: boolean;
  /** Kế hoạch trả góp đã được duyệt chưa — quyết định câu giải thích ở cuối bảng. */
  installmentPlanApproved: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sessions, setSessions] = useState<Record<string, QrSessionView>>(initialSessions);
  const [expired, setExpired] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(
    Object.keys(initialSessions)[0] ?? null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const markExpired = useCallback((id: string) => {
    setExpired((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  const totalDots = requests.filter((r) => r.installmentNo > 0).length;

  function run(id: string, fn: () => Promise<QrIssueResult>) {
    setBusyId(id);
    start(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSessions((prev) => ({ ...prev, [id]: res.session }));
      setExpired((prev) => ({ ...prev, [id]: false }));
      setOpenId(id);
      toast.success(res.reused ? "Đang dùng lại mã QR còn hiệu lực" : "Đã xuất mã QR");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
        <Receipt className="h-4 w-4 text-[#7C3AED]" /> Phiếu thu &amp; QR theo đợt
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
              <th className="p-2">Phiếu thu</th>
              <th className="p-2 text-right">Phải thu</th>
              <th className="p-2 text-right">Đã thu</th>
              <th className="p-2 text-right">Còn thiếu</th>
              <th className="p-2">Hạn</th>
              <th className="p-2">Trạng thái</th>
              <th className="p-2 text-right">QR</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const label = requestLabel(r, totalDots);
              const s = sessions[r.id];
              const isOpen = openId === r.id && !!s;
              const canIssue = canManage && r.status !== "PAID" && r.status !== "VOID";
              return (
                <tr key={r.id} className="border-b border-neutral-100 align-top">
                  <td className="p-2 font-semibold text-neutral-900">{label}</td>
                  <td className="p-2 text-right tabular-nums">{vnd(r.amountDue)}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-700">
                    {vnd(r.allocated)}
                  </td>
                  <td className="p-2 text-right font-semibold tabular-nums text-neutral-900">
                    {vnd(outstanding(r))}
                  </td>
                  <td className="p-2 text-neutral-600">
                    {r.dueDate ? formatDateVN(r.dueDate) : "—"}
                  </td>
                  <td className="p-2">
                    <Badge className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="p-2 text-right">
                    {canIssue ? (
                      <Button
                        size="sm"
                        variant={isOpen ? "outline" : "default"}
                        disabled={pending && busyId === r.id}
                        onClick={() => {
                          if (s && !expired[r.id]) {
                            setOpenId(isOpen ? null : r.id);
                            return;
                          }
                          run(r.id, () => issueQrForRequest({ paymentRequestId: r.id }));
                        }}
                      >
                        {pending && busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <QrCode className="h-3.5 w-3.5" />
                        )}
                        {s && !expired[r.id] ? (isOpen ? "Ẩn QR" : "Xem QR") : "Xuất QR"}
                      </Button>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="p-3 text-sm text-neutral-400">
                  Chưa có phiếu thu nào cho đơn này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Panel QR của phiếu đang mở — nhãn nói RÕ đang thu đợt nào, bao nhiêu. */}
      {(() => {
        if (!openId) return null;
        const r = requests.find((x) => x.id === openId);
        const s = sessions[openId];
        if (!r || !s) return null;
        return (
          <QrPanel
            session={s}
            label={requestLabel(r, totalDots)}
            expired={!!expired[openId]}
            pending={pending && busyId === openId}
            canManage={canManage}
            onExpire={() => markExpired(openId)}
            onRegenerate={() => run(openId, () => regenerateQr({ paymentRequestId: openId }))}
          />
        );
      })()}

      {!installmentPlanApproved && (
        <p className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Đơn này <b>chưa có kế hoạch trả góp được duyệt</b> nên chỉ thu được toàn bộ
          đơn trong một lần. Muốn tách đợt: lập kế hoạch 2 đợt ở mục &ldquo;Kế hoạch
          thanh toán 2 đợt&rdquo; phía trên, gửi Quản lý cơ sở duyệt — duyệt xong bảng
          này sẽ tách thành từng đợt kèm QR riêng.
        </p>
      )}
    </section>
  );
}
