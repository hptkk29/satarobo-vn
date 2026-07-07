"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditLogDetailModal } from "./audit-log-detail-modal";
import type { UnifiedAuditRow } from "../_actions";

interface Props {
  items: UnifiedAuditRow[];
  isPending: boolean;
  hasMore: boolean;
  revealed: boolean;
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
  EXPORT: "bg-purple-100 text-purple-700",
  PASSWORD_RESET: "bg-orange-100 text-orange-700",
  ROLE_CHANGE: "bg-purple-100 text-purple-700",
  "audit.pii-unmasked": "bg-amber-100 text-amber-800",
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
  }).format(new Date(date));
}

export function AuditLogTable({
  items,
  isPending,
  hasMore,
  revealed,
  onLoadMore,
}: Props) {
  const [selected, setSelected] = useState<UnifiedAuditRow | null>(null);

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
                  Module / Đối tượng
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
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">
                        {row.module}
                        <span className="text-gray-400"> · </span>
                        <span className="text-gray-600">{row.entityType}</span>
                      </div>
                      <div className="max-w-[220px] truncate text-xs text-gray-500">
                        {row.entityId}
                      </div>
                      {row.changedFields.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {row.changedFields.slice(0, 4).map((f) => (
                            <span
                              key={f}
                              className="inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600"
                            >
                              {f}
                            </span>
                          ))}
                          {row.changedFields.length > 4 && (
                            <span className="text-[10px] text-gray-400">
                              +{row.changedFields.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.actorName}
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
        row={selected}
        revealed={revealed}
      />
    </>
  );
}
