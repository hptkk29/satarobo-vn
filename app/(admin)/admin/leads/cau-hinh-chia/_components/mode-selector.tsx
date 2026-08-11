"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setCenterAssignModeAction } from "../../actions";

const MODES: { value: string; label: string; desc: string }[] = [
  { value: "ROUND_ROBIN", label: "Luân phiên", desc: "Chia đều vòng tròn cho sale active" },
  { value: "CLOSE_RATE", label: "Theo tỷ lệ chốt", desc: "Sale chốt cao (tháng gần nhất) nhận nhiều hơn" },
  { value: "MANUAL", label: "Gán tay", desc: "Quản lý tự gán, không tự động chia" },
];

export function ModeSelector({
  centerId,
  centerName,
  current,
}: {
  centerId: string;
  centerName: string;
  current: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(current);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    setMode(next);
    startTransition(async () => {
      const res = await setCenterAssignModeAction(centerId, next);
      if (res.ok) {
        toast.success(`Đã đặt chế độ cho ${centerName}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
        setMode(current);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 font-bold text-foreground">{centerName}</h3>
      <div className="space-y-2">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${ mode === m.value ? "border-primary bg-primary-soft" : "border-border hover:border-border" }`}
          >
            <input
              type="radio"
              name={`mode-${centerId}`}
              checked={mode === m.value}
              onChange={() => save(m.value)}
              disabled={pending}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
