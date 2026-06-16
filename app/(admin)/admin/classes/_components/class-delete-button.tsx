"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { deleteClass } from "../_actions";

/**
 * Fix #7 — nút xoá lớp (dọn dữ liệu test) trên danh sách Lớp học.
 * Xoá mềm (set deletedAt) qua server action `deleteClass` — list đã lọc
 * `deletedAt: null` nên lớp biến mất khỏi danh sách. 2-click confirm theo
 * pattern bảng admin (click 1 → "Xác nhận?", click 2 trong 4s → xoá).
 */
export function ClassDeleteButton({
  classId,
  name,
}: {
  classId: string;
  name: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteClass(classId);
      if (res?.error) {
        toast.error(res.error);
        setConfirming(false);
      } else {
        toast.success("Đã xoá lớp");
        setConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        confirming
          ? "bg-red-600 text-white hover:bg-red-700"
          : "border border-gray-200 text-red-600 hover:bg-red-50"
      }`}
      aria-label={confirming ? `Xác nhận xoá ${name}` : `Xoá ${name}`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      {confirming ? "Xác nhận?" : "Xoá"}
    </button>
  );
}
