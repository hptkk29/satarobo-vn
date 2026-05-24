"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteHoliday } from "../_actions";

export function DeleteHolidayButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handle() {
    if (!confirm(`Xoá ngày nghỉ "${name}"?`)) return;
    startTransition(async () => {
      const res = await deleteHoliday(id);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.push("/holidays");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl border-2 border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? "Đang xoá..." : "Xoá"}
    </button>
  );
}
