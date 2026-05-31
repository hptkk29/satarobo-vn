"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { approveTransferAction, rejectTransferAction } from "../_actions";

export function RequestActions({ id, canApprove }: { id: string; canApprove: boolean }) {
  const [pending, start] = useTransition();
  const [confirmReject, setConfirmReject] = useState(false);

  function approve() {
    start(async () => {
      const res = await approveTransferAction(id);
      if (res.ok) toast.success("Đã duyệt chuyển");
      else toast.error(res.error ?? "Lỗi");
    });
  }

  function reject() {
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    start(async () => {
      const res = await rejectTransferAction(id);
      if (res.ok) toast.success("Đã từ chối");
      else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="flex gap-2">
      {canApprove ? (
        <button
          onClick={approve}
          disabled={pending}
          className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Duyệt
        </button>
      ) : null}
      <button
        onClick={reject}
        disabled={pending}
        className="rounded bg-rose-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {confirmReject ? "Xác nhận?" : "Từ chối"}
      </button>
    </div>
  );
}
