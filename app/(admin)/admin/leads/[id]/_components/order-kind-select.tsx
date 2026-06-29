"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, BookOpen } from "lucide-react";
import { updateLeadOrderKind } from "../../actions";

type OrderKind = "COURSE" | "PRODUCT";

const OPTIONS: { value: OrderKind; label: string }[] = [
  { value: "COURSE", label: "Khoá học" },
  { value: "PRODUCT", label: "Sản phẩm" },
];

// LD1 — chọn loại đơn dự kiến (Khoá học / Sản phẩm). Lưu Lead.orderKind, dùng để
// gợi ý nguồn item khi tạo đơn.
export function OrderKindSelect({
  leadId,
  current,
  readOnly = false,
}: {
  leadId: string;
  current: OrderKind | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<OrderKind | "">(current ?? "");

  function handleChange(next: string) {
    if (next !== "COURSE" && next !== "PRODUCT") return;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const res = await updateLeadOrderKind(leadId, next);
      if (res.ok) {
        toast.success("Đã lưu loại đơn");
        router.refresh();
        return;
      }
      setValue(prev);
      toast.error(res.error ?? "Lưu loại đơn thất bại");
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        {value === "PRODUCT" ? (
          <Package className="h-4 w-4 text-orange-500" />
        ) : (
          <BookOpen className="h-4 w-4 text-orange-500" />
        )}
        <h2 className="text-sm font-semibold text-gray-700">Loại đơn dự kiến</h2>
      </div>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending || readOnly}
        className="w-full max-w-xs rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50 sm:w-auto"
      >
        <option value="">— chọn loại đơn —</option>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
