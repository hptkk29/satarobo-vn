"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Unlock } from "lucide-react";
import type { UnifiedAuditRow } from "../_actions";

interface Props {
  open: boolean;
  onClose: () => void;
  row: UnifiedAuditRow | null;
  revealed: boolean;
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

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(date));
}

export function AuditLogDetailModal({ open, onClose, row, revealed }: Props) {
  if (!row) return null;

  const actionCls = ACTION_COLORS[row.action] ?? "bg-gray-100 text-gray-700";
  const hasOld = row.oldValues && Object.keys(row.oldValues).length > 0;
  const hasNew = row.newValues && Object.keys(row.newValues).length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết audit log</DialogTitle>
          <DialogDescription>
            {formatDateTime(row.createdAt)} ·{" "}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${actionCls}`}
            >
              {row.action}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* PII state banner */}
          <div
            className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs ${
              revealed
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-gray-200 bg-gray-50 text-gray-500"
            }`}
          >
            {revealed ? (
              <>
                <Unlock className="h-3.5 w-3.5 shrink-0" />
                Đang xem đầy đủ — SĐT/email KHÔNG che (đã ghi log break-glass).
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5 shrink-0" />
                SĐT/email được che (dạng 09***67 / a***@x.com). Dùng &quot;Xem đầy
                đủ&quot; để mở có kiểm soát.
              </>
            )}
          </div>

          {/* Actor */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Thực hiện bởi
            </h4>
            <p className="mt-1 text-sm text-gray-900">{row.actorName}</p>
          </div>

          {/* Module / entity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Module
              </h4>
              <p className="mt-1 text-sm text-gray-900">{row.module}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Đối tượng
              </h4>
              <p className="mt-1 text-sm text-gray-900">
                {row.entityType}
                <span className="block break-all text-xs text-gray-500">
                  {row.entityId}
                </span>
              </p>
            </div>
          </div>

          {/* Reason */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Lý do
            </h4>
            <p className="mt-1 text-sm italic text-gray-700">
              {row.reason ?? "—"}
            </p>
          </div>

          {/* Changed fields */}
          {row.changedFields.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Trường thay đổi
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.changedFields.map((f) => (
                  <span
                    key={f}
                    className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Old values */}
          {hasOld && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Giá trị cũ
              </h4>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs text-gray-800">
                {JSON.stringify(row.oldValues, null, 2)}
              </pre>
            </div>
          )}

          {/* New values */}
          {hasNew && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Giá trị mới
              </h4>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-green-50 p-3 text-xs text-gray-800">
                {JSON.stringify(row.newValues, null, 2)}
              </pre>
            </div>
          )}

          {/* Metadata */}
          {(row.ip || row.userAgent) && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Metadata
              </h4>
              <div className="mt-1 space-y-0.5 text-xs italic text-gray-500">
                {row.ip && <div>IP: {row.ip}</div>}
                {row.userAgent && (
                  <div className="break-all">UA: {row.userAgent}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
