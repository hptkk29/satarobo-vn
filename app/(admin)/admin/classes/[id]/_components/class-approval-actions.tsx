"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, CheckCircle2, RotateCcw } from "lucide-react";
import { submitClassForApproval, approveClass, rejectClass } from "../../_actions";

type Status = "PLANNED" | "RECRUITING" | "PENDING_APPROVAL" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export function ClassApprovalActions({
  classId,
  status,
  canSubmit,
  canApprove,
  approvedByName,
}: {
  classId: string;
  status: Status;
  canSubmit: boolean;
  canApprove: boolean;
  approvedByName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function run(
    fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>,
    okMsg: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        // 08/08 — duyệt lớp mà KHÔNG sinh được buổi (chưa khai lịch, khoá chưa cấu hình
        // số buổi…) trước đây bị nuốt vào console: lớp ACTIVE mà 0 buổi, không ai biết.
        if (res.warning) toast.warning(res.warning, { duration: 10000 });
        setRejecting(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
        Phê duyệt lớp
      </h2>

      {(status === "PLANNED" || status === "RECRUITING") && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">
            Lớp đang chuẩn bị. Gán đủ học sinh phù hợp giờ rồi gửi quản lý duyệt.
          </span>
          {canSubmit && (
            <button
              type="button"
              onClick={() => run(() => submitClassForApproval(classId), "Đã gửi duyệt")}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Gửi duyệt
            </button>
          )}
        </div>
      )}

      {status === "PENDING_APPROVAL" && (
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
            Đang chờ quản lý duyệt
          </span>
          {canApprove ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => run(() => approveClass(classId), "Đã duyệt — lớp chính thức hoạt động")}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Duyệt → ACTIVE
              </button>
              <button
                type="button"
                onClick={() => setRejecting((v) => !v)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" /> Trả lại
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Chờ quản lý cơ sở / SUPER_ADMIN duyệt.</p>
          )}
          {rejecting && canApprove && (
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Lý do trả lại (≥5 ký tự)…"
                className="min-w-[16rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-rose-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => run(() => rejectClass(classId, reason), "Đã trả lại lớp")}
                disabled={pending || reason.trim().length < 5}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Xác nhận trả lại
              </button>
            </div>
          )}
        </div>
      )}

      {status === "ACTIVE" && (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Lớp đã duyệt, đang hoạt động
          {approvedByName ? ` (bởi ${approvedByName})` : ""}.
        </span>
      )}

      {(status === "COMPLETED" || status === "CANCELLED") && (
        <span className="text-sm text-gray-500">Lớp đã {status === "COMPLETED" ? "hoàn thành" : "huỷ"}.</span>
      )}
    </section>
  );
}
