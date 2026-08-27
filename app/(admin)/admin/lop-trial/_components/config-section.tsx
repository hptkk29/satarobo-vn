"use client";

// app/(admin)/admin/lop-trial/_components/config-section.tsx — GĐ2.
//
// Ô cấu hình số buổi mặc định của chương trình trải nghiệm.

import type { JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { saveTrialConfigLopTrialAction } from "../_actions";
import type { ProgramConfig } from "../_lib/types";

export function ConfigSection({
  config,
  canEdit,
}: {
  config: ProgramConfig;
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(config?.name ?? "Trải nghiệm RoboSim");
  const [sessionCount, setSessionCount] = useState(
    config?.sessionCount?.toString() ?? "4",
  );

  function onSave() {
    startTransition(async () => {
      const res = await saveTrialConfigLopTrialAction({ name, sessionCount });
      if (res.ok) {
        toast.success("Đã lưu cấu hình");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          Cấu hình số buổi (mặc định)
        </h2>
      </div>

      {/* Dòng chỉ-đọc hiện cho MỌI người, kể cả người có quyền sửa: nó là mốc đối
          chiếu với giá trị đang gõ trong ô bên dưới (ô đã sửa nhưng chưa Lưu). */}
      <p className="text-sm text-muted-foreground">
        {config
          ? `Cấu hình hiện tại: ${config.name} — ${config.sessionCount} buổi.`
          : "Chưa có cấu hình số buổi."}
      </p>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Tên cấu hình</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-56 max-w-full rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground disabled:opacity-50"
              placeholder="VD: Trải nghiệm RoboSim"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Số buổi</span>
            <input
              type="number"
              min={1}
              max={60}
              value={sessionCount}
              onChange={(e) => setSessionCount(e.target.value)}
              disabled={pending}
              className="w-24 rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      )}
    </div>
  );
}
