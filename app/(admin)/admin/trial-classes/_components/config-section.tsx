"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { saveTrialConfigAction } from "../_actions";

type Config = { id: string; name: string; sessionCount: number } | null;

export function TrialConfigSection({
  canConfig,
  config,
}: {
  canConfig: boolean;
  config: Config;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(config?.name ?? "Trải nghiệm RoboSim");
  const [sessionCount, setSessionCount] = useState(
    config?.sessionCount?.toString() ?? "4",
  );

  // Người không có quyền cấu hình vẫn xem được cấu hình hiện tại (read-only).
  function onSave() {
    startTransition(async () => {
      const res = await saveTrialConfigAction({ name, sessionCount });
      if (res.ok) {
        toast.success("Đã lưu cấu hình số buổi");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lưu thất bại");
      }
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700">
          Cấu hình số buổi (mặc định)
        </h2>
      </div>

      {!canConfig ? (
        <p className="text-sm text-gray-600">
          {config
            ? `Cấu hình hiện tại: ${config.name} — ${config.sessionCount} buổi.`
            : "Chưa có cấu hình số buổi."}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Tên cấu hình</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-56 rounded-lg border border-gray-300 px-2 py-2 text-sm disabled:opacity-50"
              placeholder="VD: Trải nghiệm RoboSim"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Số buổi</span>
            <input
              type="number"
              min={1}
              max={60}
              value={sessionCount}
              onChange={(e) => setSessionCount(e.target.value)}
              disabled={pending}
              className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      )}
    </div>
  );
}
