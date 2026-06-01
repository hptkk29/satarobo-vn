"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Scope = "upcoming" | "past" | "all";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "upcoming", label: "Sắp tới" },
  { key: "past", label: "Đã diễn ra" },
  { key: "all", label: "Tất cả" },
];

/**
 * P1 #5 — Bộ lọc buổi học ÁP DỤNG TỨC THÌ (onChange → điều hướng ngay), bỏ nút
 * "Lọc". Giữ scope + lớp trên query string để server đọc.
 */
export function SessionFilters({
  scope,
  classId,
  classes,
}: {
  scope: Scope;
  classId: string;
  classes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: { scope?: Scope; classId?: string }) {
    const params = new URLSearchParams();
    const s = next.scope ?? scope;
    const c = next.classId ?? classId;
    if (s !== "upcoming") params.set("scope", s);
    if (c) params.set("classId", c);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/sessions?${qs}` : "/sessions");
    });
  }

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => apply({ scope: s.key })}
            disabled={pending}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              scope === s.key
                ? "bg-orange-500 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <select
        value={classId}
        onChange={(e) => apply({ classId: e.target.value })}
        disabled={pending}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
      >
        <option value="">Tất cả lớp</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-neutral-400">Đang lọc…</span>}
    </div>
  );
}
