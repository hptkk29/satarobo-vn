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
import { Lock } from "lucide-react";
import type { AuditTab, AnyAuditRow } from "../_actions";

interface Props {
  open: boolean;
  onClose: () => void;
  tab: AuditTab;
  row: AnyAuditRow | null;
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

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

type RowWithCommon = AnyAuditRow & {
  oldValues?: unknown;
  newValues?: unknown;
  changedFields?: string[];
  reason: string | null;
  metadata?: unknown;
};

export function AuditLogDetailModal({ open, onClose, tab, row }: Props) {
  if (!row) return null;

  const r = row as RowWithCommon;
  const actionCls = ACTION_COLORS[r.action] ?? "bg-gray-100 text-gray-700";
  const isPasswordReset = r.action === "PASSWORD_RESET";

  const metadata = (r.metadata as {
    ip?: string;
    userAgent?: string;
  } | null) ?? null;

  const oldValues = r.oldValues as Record<string, unknown> | null | undefined;
  const newValues = r.newValues as Record<string, unknown> | null | undefined;

  // Per-tab extras
  const grantRow = tab === "grant" ? (r as unknown as {
    actionKey: string;
    oldGrant: string | null;
    newGrant: string | null;
  }) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết audit log</DialogTitle>
          <DialogDescription>
            {formatDateTime(r.createdAt)} ·{" "}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${actionCls}`}
            >
              {r.action}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Actor */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Thực hiện bởi
            </h4>
            <p className="mt-1 text-sm text-gray-900">{r.changedByName}</p>
          </div>

          {/* Reason */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Lý do
            </h4>
            <p className="mt-1 text-sm italic text-gray-700">
              {r.reason ?? "—"}
            </p>
          </div>

          {/* Grant-specific */}
          {grantRow && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Quyền (action key)
              </h4>
              <p className="mt-1">
                <code className="rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
                  {grantRow.actionKey}
                </code>
              </p>
              <p className="mt-2 text-sm text-gray-700">
                <span className="text-gray-500">Loại: </span>
                <strong>{grantRow.oldGrant ?? "∅"}</strong> →{" "}
                <strong>{grantRow.newGrant ?? "∅"}</strong>
              </p>
            </div>
          )}

          {/* Password reset notice */}
          {isPasswordReset && (
            <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
              Thông tin mật khẩu không được lưu lại vì lý do bảo mật.
            </div>
          )}

          {/* Changed fields */}
          {r.changedFields && r.changedFields.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Trường thay đổi
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.changedFields.map((f) => (
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
          {!isPasswordReset && oldValues && Object.keys(oldValues).length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Giá trị cũ
              </h4>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs text-gray-800">
                {JSON.stringify(oldValues, null, 2)}
              </pre>
            </div>
          )}

          {/* New values */}
          {!isPasswordReset && newValues && Object.keys(newValues).length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Giá trị mới
              </h4>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-green-50 p-3 text-xs text-gray-800">
                {JSON.stringify(newValues, null, 2)}
              </pre>
            </div>
          )}

          {/* Metadata */}
          {metadata && (metadata.ip || metadata.userAgent) && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Metadata
              </h4>
              <div className="mt-1 space-y-0.5 text-xs italic text-gray-500">
                {metadata.ip && <div>IP: {metadata.ip}</div>}
                {metadata.userAgent && (
                  <div className="break-all">UA: {metadata.userAgent}</div>
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
