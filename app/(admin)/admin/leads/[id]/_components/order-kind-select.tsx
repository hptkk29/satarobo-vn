"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, BookOpen } from "lucide-react";
import { updateLeadOrderKind } from "../../actions";

type OrderKind = "COURSE" | "PRODUCT";

export type ExpectedCourseOption = { id: string; name: string; code?: string | null };
export type ExpectedProductOption = { id: string; sku: string; name: string };

const OPTIONS: { value: OrderKind; label: string }[] = [
  { value: "COURSE", label: "Khoá học" },
  { value: "PRODUCT", label: "Sản phẩm" },
];

// LD1/G2 — chọn loại đơn dự kiến (Khoá học / Sản phẩm) + item cụ thể theo loại.
// Lưu Lead.orderKind + expectedCourseId/expectedProductId, dùng để gợi ý khi tạo đơn.
export function OrderKindSelect({
  leadId,
  current,
  currentCourseId,
  currentProductId,
  courses,
  products,
  readOnly = false,
}: {
  leadId: string;
  current: OrderKind | null;
  currentCourseId: string | null;
  currentProductId: string | null;
  courses: ExpectedCourseOption[];
  products: ExpectedProductOption[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<OrderKind | "">(current ?? "");
  const [itemId, setItemId] = useState<string>(
    (current === "COURSE"
      ? currentCourseId
      : current === "PRODUCT"
        ? currentProductId
        : "") ?? "",
  );

  function persist(nextKind: OrderKind, nextItemId: string | null) {
    startTransition(async () => {
      const res = await updateLeadOrderKind(leadId, nextKind, nextItemId);
      if (res.ok) {
        toast.success("Đã lưu loại đơn dự kiến");
        router.refresh();
        return;
      }
      toast.error(res.error ?? "Lưu loại đơn thất bại");
    });
  }

  function handleKindChange(next: string) {
    if (next !== "COURSE" && next !== "PRODUCT") return;
    if (next === kind) return;
    setKind(next);
    setItemId(""); // đổi loại đơn → reset item đã chọn
    persist(next, null);
  }

  function handleItemChange(next: string) {
    if (kind !== "COURSE" && kind !== "PRODUCT") return;
    setItemId(next);
    persist(kind, next || null);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        {kind === "PRODUCT" ? (
          <Package className="h-4 w-4 text-primary" />
        ) : (
          <BookOpen className="h-4 w-4 text-primary" />
        )}
        <h2 className="text-sm font-semibold text-gray-700">Loại đơn dự kiến</h2>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={kind}
          onChange={(e) => handleKindChange(e.target.value)}
          disabled={pending || readOnly}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50 sm:w-44"
        >
          <option value="">— chọn loại đơn —</option>
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {kind === "COURSE" && (
          <select
            value={itemId}
            onChange={(e) => handleItemChange(e.target.value)}
            disabled={pending || readOnly}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50 sm:flex-1"
          >
            <option value="">— chọn khoá học —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.name} (${c.code})` : c.name}
              </option>
            ))}
          </select>
        )}

        {kind === "PRODUCT" && (
          <select
            value={itemId}
            onChange={(e) => handleItemChange(e.target.value)}
            disabled={pending || readOnly}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50 sm:flex-1"
          >
            <option value="">— chọn sản phẩm —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
