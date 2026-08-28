"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideCostEntryAction } from "../_actions";

/**
 * Nút duyệt / huỷ một khoản chi.
 *
 * `selfCreated` chỉ để **ẩn nút** cho người vừa nhập, khỏi bấm rồi nhận lỗi. Chốt chặn
 * thật nằm ở Server Action (QĐ-B5: người nhập không tự duyệt) — đừng bỏ nó ở server vì
 * thấy UI đã ẩn.
 */
export function CostDecideButtons({ id, selfCreated }: { id: string; selfCreated: boolean }) {
  const [pending, startTransition] = useTransition();

  if (selfCreated) {
    return (
      <span className="text-xs text-muted-foreground">
        Bạn nhập khoản này — nhờ người khác duyệt
      </span>
    );
  }

  function decide(decision: "APPROVED" | "VOID") {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("decision", decision);
    startTransition(async () => {
      const res = await decideCostEntryAction(fd);
      if (res.ok) toast.success(decision === "APPROVED" ? "Đã duyệt" : "Đã huỷ khoản chi");
      else toast.error(res.error ?? "Có lỗi xảy ra");
    });
  }

  return (
    <span className="flex gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => decide("APPROVED")}>
        Duyệt
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => decide("VOID")}
      >
        Huỷ
      </Button>
    </span>
  );
}
