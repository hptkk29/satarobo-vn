"use client";

import { logoutToGate } from "@/lib/auth/logout-client";
import { ChevronDown, LogOut } from "lucide-react";
import { useSetActiveSite } from "@/components/portal/use-set-active-site";

type Child = { id: string; name: string; studentCode: string | null };

export function SiteSwitcher({
  kids,
  activeId,
}: {
  kids: Child[];
  activeId: string | null;
}) {
  const { pending, switchTo } = useSetActiveSite();

  function onChange(id: string) {
    if (id === activeId) return;
    switchTo(id);
  }

  return (
    <div className="flex items-center gap-2">
      {kids.length > 1 ? (
        <div className="relative">
          <select
            value={activeId ?? ""}
            disabled={pending}
            onChange={(e) => onChange(e.target.value)}
            className="appearance-none rounded-lg border border-neutral-300 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-neutral-800 focus:border-orange-400 focus:outline-none"
          >
            {kids.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.studentCode ? ` (${c.studentCode})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        </div>
      ) : kids.length === 1 ? (
        <span className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700">
          {kids[0].name}
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => logoutToGate()}
        className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
        aria-label="Đăng xuất"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Đăng xuất</span>
      </button>
    </div>
  );
}
