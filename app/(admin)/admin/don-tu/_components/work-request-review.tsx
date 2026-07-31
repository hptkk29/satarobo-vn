"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewWorkRequest } from "@/app/(teacher)/teacher/don-tu/_actions";

// BGĐ 31/07 — nút duyệt/từ chối đơn GV. Duyệt đơn nghỉ dạy / dạy thay sẽ cập nhật
// luôn buổi học (server trả `note` mô tả việc đã áp lên lịch hay cần làm tay).
export function WorkRequestReview({
  requestId,
  appliesToSchedule,
}: {
  requestId: string;
  /** Loại đơn có tác động lên lịch (CLASS_OFF / SUB_TEACH) — hiện cảnh báo trước khi duyệt. */
  appliesToSchedule: boolean;
}) {
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
      const res = await reviewWorkRequest({ id: requestId, decision, note: note.trim() || null });
      if (res.ok) {
        toast.success(
          decision === "APPROVED"
            ? (res.note ?? "Đã duyệt đơn")
            : "Đã từ chối đơn",
        );
        setRejecting(false);
        setNote("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
      {appliesToSchedule && (
        <p className="text-xs text-amber-700">
          Duyệt đơn này sẽ cập nhật buổi học tương ứng (huỷ buổi hoặc gán GV dạy thay).
        </p>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder="Ghi chú duyệt (bắt buộc khi từ chối)"
        className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-[#7C3AED]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide("APPROVED")}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Đang xử lý…" : "Duyệt"}
        </button>
        <button
          type="button"
          onClick={() => (rejecting ? decide("REJECTED") : setRejecting(true))}
          disabled={pending}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {rejecting ? "Xác nhận từ chối" : "Từ chối"}
        </button>
        {rejecting && (
          <button
            type="button"
            onClick={() => setRejecting(false)}
            disabled={pending}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            Huỷ
          </button>
        )}
      </div>
    </div>
  );
}
