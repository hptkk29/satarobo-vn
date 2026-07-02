"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setActiveSite } from "@/app/(portal)/portal/actions";

const COLORS = [
  "oklch(0.748 0.169 56.8)",
  "oklch(0.62 0.18 250)",
  "oklch(0.62 0.17 150)",
  "oklch(0.6 0.2 300)",
  "oklch(0.62 0.2 20)",
];
function ini(name: string): string {
  const w = name.trim().split(/\s+/);
  return (w.slice(-2).map((x) => x[0]).join("") || w[0]?.[0] || "?").toUpperCase();
}
function short(name: string): string {
  return name.trim().split(/\s+/).slice(-2).join(" ");
}

export function ChildSwitcher({ kids, activeId }: { kids: { id: string; name: string }[]; activeId: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (kids.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-muted-foreground">Đang xem con:</span>
      {kids.map((k, i) => {
        const active = k.id === activeId;
        return (
          <button
            key={k.id}
            disabled={pending}
            onClick={() => start(async () => { await setActiveSite(k.id); router.refresh(); })}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-60",
              active ? "bg-accent text-white" : "border border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
              {ini(k.name)}
            </span>
            {short(k.name)}
          </button>
        );
      })}
    </div>
  );
}
