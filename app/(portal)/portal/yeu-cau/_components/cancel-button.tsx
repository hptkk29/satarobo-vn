"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelParentRequest } from "../actions";

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelParentRequest(id);
          if (res.ok) {
            toast.success("Đã huỷ yêu cầu");
            router.refresh();
          } else toast.error(res.error ?? "Lỗi");
        })
      }
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-60"
    >
      Huỷ
    </button>
  );
}
