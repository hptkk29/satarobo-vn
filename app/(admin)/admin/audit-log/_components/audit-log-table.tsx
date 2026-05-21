"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditLogDetailModal } from "./audit-log-detail-modal";
import type { AuditTab, AnyAuditRow } from "../_actions";

interface Props {
  tab: AuditTab;
  items: AnyAuditRow[];
  isPending: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  ADD: "bg-green-100 text-green-700",
  ENABLE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  STATUS_CHANGE: "bg-blue-100 text-blue-700",
  ASSIGN: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  REMOVE: "bg-red-100 text-red-700",
  DISABLE: "bg-red-100 text-red-700",
  PASSWORD_RESET: "bg-orange-100 text-orange-700",
  ROLE_CHANGE: "bg-purple-100 text-purple-700",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {action}
    </span>
  );
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// ─── Target column rendering per tab ────────────────────────────────
function renderTarget(tab: AuditTab, row: AnyAuditRow): React.ReactNode {
  switch (tab) {
    case "user": {
      const r = row as Extract<AnyAuditRow, { userId: string; user?: unknown }>;
      const u = (r as { user?: { email: string; name: string | null } }).user;
      return (
        <div className="text-sm">
          <div className="font-medium text-gray-900">
            {u?.email ?? "—"}
          </div>
          {u?.name && (
            <div className="text-xs text-gray-500">{u.name}</div>
          )}
        </div>
      );
    }
    case "grant": {
      const r = row as Extract<
        AnyAuditRow,
        { actionKey: string; oldGrant: string | null; newGrant: string | null }
      >;
      const u = (r as { user?: { email: string; name: string | null } }).user;
      return (
        <div className="text-sm">
          <div className="font-medium text-gray-900">
            {u?.email ?? "—"}
          </div>
          <code className="text-xs text-orange-600">{r.actionKey}</code>
          <div className="text-xs text-gray-500">
            {r.oldGrant ?? "∅"} → {r.newGrant ?? "∅"}
          </div>
        </div>
      );
    }
    case "lead": {
      const l = (row as { lead?: { parentName: string; phone: string } }).lead;
      return (
        <div className="text-sm">
          <div className="font-medium text-gray-900">
            {l?.parentName ?? "—"}
          </div>
          {l?.phone && (
            <div className="text-xs text-gray-500">{l.phone}</div>
          )}
        </div>
      );
    }
    case "class": {
      const c = (
        row as { class?: { name: string; classCode: string | null } }
      ).class;
      return (
        <div className="text-sm">
          <div className="font-medium text-gray-900">{c?.name ?? "—"}</div>
          {c?.classCode && (
            <div className="text-xs text-gray-500">{c.classCode}</div>
          )}
        </div>
      );
    }
    case "student": {
      const s = (row as { student?: { name: string } }).student;
      return (
        <div className="text-sm font-medium text-gray-900">
          {s?.name ?? "—"}
        </div>
      );
    }
  }
}

const TARGET_LABEL: Record<AuditTab, string> = {
  user: "Email",
  grant: "User / Quyền",
  lead: "Lead",
  class: "Lớp",
  student: "Học viên",
};

export function AuditLogTable({
  tab,
  items,
  isPending,
  hasMore,
  onLoadMore,
}: Props) {
  const [selected, setSelected] = useState<AnyAuditRow | null>(null);

  if (!isPending && items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
        <p className="text-sm text-gray-500">Không có dữ liệu</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Thời gian
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {TARGET_LABEL[tab]}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Thực hiện bởi
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-700">
                    {formatTime(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={row.action} />
                  </td>
                  <td className="px-4 py-3">{renderTarget(tab, row)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.changedByName}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Xem
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(hasMore || isPending) && (
          <div className="flex justify-center border-t border-gray-100 p-3">
            {isPending ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải...
              </div>
            ) : hasMore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={isPending}
              >
                Tải thêm
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <AuditLogDetailModal
        open={!!selected}
        onClose={() => setSelected(null)}
        tab={tab}
        row={selected}
      />
    </>
  );
}
