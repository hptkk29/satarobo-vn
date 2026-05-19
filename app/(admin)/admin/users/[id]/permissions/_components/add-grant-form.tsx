"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Ban, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ALL_ACTIONS } from "@/lib/auth/permissions";
import { getActionMeta, groupActionsByCategory } from "@/lib/auth/action-labels";
import { addGrantAction } from "../_actions";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

export function AddGrantForm({
  userId,
  existingActions,
  disabled,
  disabledReason,
}: {
  userId: string;
  existingActions: string[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Actions còn lại (chưa được override) — group theo category
  const availableActions = useMemo(() => {
    const existingSet = new Set(existingActions);
    const available = ALL_ACTIONS.filter((a) => !existingSet.has(a));
    return groupActionsByCategory(available);
  }, [existingActions]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addGrantAction(userId, fd);
      if (res.ok) {
        toast.success("Đã thêm quyền override");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } else {
        setError(res.error ?? "Lỗi thêm grant");
        toast.error(res.error ?? "Lỗi thêm grant");
      }
    });
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-6 text-center">
        <p className="text-sm text-gray-600">
          {disabledReason ?? "Không thể thêm grant cho user này."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="action">Quyền cần override *</Label>
        <select
          id="action"
          name="action"
          required
          className={selectClass}
          defaultValue=""
        >
          <option value="" disabled>
            — Chọn quyền —
          </option>
          {Array.from(availableActions.entries()).map(([category, actions]) => (
            <optgroup key={category} label={category}>
              {actions.map((a) => {
                const meta = getActionMeta(a);
                return (
                  <option key={a} value={a}>
                    {meta.label}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Loại override *</Label>
        <div className="flex gap-2">
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-sm transition-colors has-checked:border-green-500 has-checked:bg-green-50">
            <input
              type="radio"
              name="grant"
              value="ALLOW"
              required
              className="peer sr-only"
            />
            <Check className="h-4 w-4 text-green-600" />
            <span className="font-semibold text-green-700">ALLOW</span>
            <span className="text-xs text-gray-500">(cấp quyền)</span>
          </label>
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-sm transition-colors has-checked:border-red-500 has-checked:bg-red-50">
            <input
              type="radio"
              name="grant"
              value="DENY"
              required
              className="peer sr-only"
            />
            <Ban className="h-4 w-4 text-red-600" />
            <span className="font-semibold text-red-700">DENY</span>
            <span className="text-xs text-gray-500">(thu hồi)</span>
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reason">Lý do (tuỳ chọn)</Label>
        <Textarea
          id="reason"
          name="reason"
          maxLength={500}
          rows={3}
          placeholder="Ví dụ: Cấp tạm thời cho dự án X · Thu hồi sau audit Q4..."
        />
        <p className="text-xs text-gray-500">Lưu lại để audit trail.</p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {pending ? "Đang thêm..." : "Thêm quyền override"}
      </Button>
    </form>
  );
}
