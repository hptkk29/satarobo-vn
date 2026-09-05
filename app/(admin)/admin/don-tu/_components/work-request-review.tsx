"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { decideRequestAction } from "@/lib/cham-cong/request-actions";

// L5 — nút duyệt/từ chối đơn (mọi loại). Duyệt = áp hệ quả trong CÙNG quyết định (T-05):
// đổi ca/nghỉ/chỉnh công ghi trong một transaction; huỷ buổi/dạy thay áp thất bại thì đơn
// trả về Chờ duyệt kèm lý do — không bao giờ có đơn "đã duyệt" mà lịch chưa đổi.
export function WorkRequestReview({ requestId, effectHint }: { requestId: string; effectHint: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  function decide(decision: "APPROVED" | "REJECTED") {
    if (decision === "REJECTED" && !note.trim()) {
      toast.error("Nhập lý do từ chối");
      return;
    }
    start(async () => {
      const res = await decideRequestAction({ id: requestId, decision, note: note.trim() || null });
      if (res.ok) {
        toast.success(decision === "APPROVED" ? (res.note ? `Đã duyệt — ${res.note}` : "Đã duyệt đơn") : "Đã từ chối đơn");
        setRejecting(false);
        setNote("");
        router.refresh();
      } else {
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {effectHint && <p className="text-xs text-state-warning-ink">Duyệt đơn này sẽ: {effectHint}.</p>}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder="Ghi chú duyệt (bắt buộc khi từ chối)"
        className="w-full rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => decide("APPROVED")} disabled={pending} className="rounded-lg bg-state-success-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-state-success-ink-hover disabled:opacity-50">
          {pending ? "Đang xử lý…" : "Duyệt"}
        </button>
        <button type="button" onClick={() => (rejecting ? decide("REJECTED") : setRejecting(true))} disabled={pending} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
          {rejecting ? "Xác nhận từ chối" : "Từ chối"}
        </button>
        {rejecting && (
          <button type="button" onClick={() => setRejecting(false)} disabled={pending} className="text-sm text-muted-foreground hover:text-foreground">Huỷ</button>
        )}
      </div>
    </div>
  );
}
