"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { enrollLeadChildAction } from "../../../trial-classes/_actions";

type Child = { id: string; fullName: string };
type TrialClass = {
  id: string;
  name: string;
  code: string;
  capacity: number;
  used: number;
};

export function TrialEnrollWidget({
  children,
  openClasses,
  canOverride,
}: {
  children: Child[];
  openClasses: TrialClass[];
  canOverride: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // chọn lớp theo từng con
  const [picked, setPicked] = useState<Record<string, string>>({});

  function enroll(childId: string, allowOverride: boolean) {
    const trialClassId = picked[childId];
    if (!trialClassId) {
      toast.error("Chọn lớp trải nghiệm trước");
      return;
    }
    startTransition(async () => {
      const res = await enrollLeadChildAction({
        trialClassId,
        leadChildId: childId,
        allowOverride,
      });
      if (res.ok) {
        toast.success("Đã xếp con vào lớp trải nghiệm");
        router.refresh();
        return;
      }
      if (res.overCapacity && canOverride) {
        // QL được mời xác nhận vượt sĩ số.
        if (window.confirm(`${res.error}. Bạn có quyền vượt sĩ số — vẫn xếp?`)) {
          enroll(childId, true);
        }
        return;
      }
      toast.error(res.error ?? "Xếp chỗ thất bại");
    });
  }

  if (children.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-orange-500" />
        <h2 className="text-sm font-semibold text-gray-700">
          Xếp con vào lớp trải nghiệm
        </h2>
      </div>

      {openClasses.length === 0 ? (
        <p className="text-sm text-gray-400">
          Chưa có lớp trải nghiệm đang mở (cùng cơ sở). Tạo lớp ở mục &quot;Lớp trải
          nghiệm&quot;.
        </p>
      ) : (
        <ul className="space-y-2">
          {children.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
            >
              <span className="min-w-[7rem] flex-1 text-sm font-medium text-gray-800">
                {c.fullName}
              </span>
              <select
                value={picked[c.id] ?? ""}
                onChange={(e) =>
                  setPicked((p) => ({ ...p, [c.id]: e.target.value }))
                }
                disabled={pending}
                className="min-w-[12rem] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50"
              >
                <option value="">— chọn lớp —</option>
                {openClasses.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name} ({cl.used}/{cl.capacity})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => enroll(c.id, false)}
                disabled={pending}
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Xếp vào lớp
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
