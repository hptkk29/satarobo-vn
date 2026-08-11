"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { enrollLeadChildAction } from "../../../trial-classes/_actions";

type TrialSession = {
  id: string;
  date: string; // ISO
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  seq: number;
};
type Child = {
  id: string;
  fullName: string;
  // LD3(a) — lớp trải nghiệm ĐANG học (ACTIVE) của con, null nếu chưa xếp.
  // session: buổi đã chọn (scheduledSessionId), null nếu chưa chọn buổi.
  currentTrial: {
    className: string;
    session?: { seq: number; date: string; startTime: string; endTime: string } | null;
  } | null;
};
type TrialClass = {
  id: string;
  name: string;
  code: string;
  capacity: number;
  used: number;
  // LD3(b) — các buổi (SCHEDULED) để chọn ngày/giờ khi xếp.
  sessions: TrialSession[];
};

function fmtSession(s: {
  seq: number;
  date: string;
  startTime: string;
  endTime: string;
}): string {
  const d = new Date(s.date).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `Buổi ${s.seq} · ${d} ${s.startTime}–${s.endTime}`;
}

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
  // LD3(b) — chọn buổi (ngày/giờ) theo từng con
  const [pickedSession, setPickedSession] = useState<Record<string, string>>({});

  function enroll(childId: string, allowOverride: boolean) {
    const trialClassId = picked[childId];
    if (!trialClassId) {
      toast.error("Chọn lớp trải nghiệm trước");
      return;
    }
    const sessionId = pickedSession[childId] || undefined;
    startTransition(async () => {
      const res = await enrollLeadChildAction({
        trialClassId,
        leadChildId: childId,
        allowOverride,
        sessionId,
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
        <FlaskConical className="h-4 w-4 text-primary" />
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
        <ul className="space-y-3">
          {children.map((c) => {
            const classSessions =
              openClasses.find((cl) => cl.id === picked[c.id])?.sessions ?? [];
            return (
              <li
                key={c.id}
                className="rounded-lg bg-gray-50 px-3 py-2"
              >
                {/* LD3(a) — banner lớp hiện tại của con */}
                <div className="mb-2 text-xs">
                  {c.currentTrial ? (
                    <span className="font-medium text-state-info-ink">
                      {c.fullName} đang học thử lớp {c.currentTrial.className}
                      {c.currentTrial.session && (
                        <span className="font-normal text-gray-500">
                          {" "}
                          · buổi đã chọn: {fmtSession(c.currentTrial.session)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-400">
                      {c.fullName}: Chưa xếp lớp
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[7rem] flex-1 text-sm font-medium text-gray-800">
                    {c.fullName}
                  </span>
                  <select
                    value={picked[c.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPicked((p) => ({ ...p, [c.id]: v }));
                      // đổi lớp → reset buổi đã chọn
                      setPickedSession((p) => ({ ...p, [c.id]: "" }));
                    }}
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
                  {/* LD3(b) — chọn buổi (ngày/giờ); tuỳ chọn */}
                  <select
                    value={pickedSession[c.id] ?? ""}
                    onChange={(e) =>
                      setPickedSession((p) => ({ ...p, [c.id]: e.target.value }))
                    }
                    disabled={pending || !picked[c.id] || classSessions.length === 0}
                    className="min-w-[12rem] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="">
                      {picked[c.id] && classSessions.length === 0
                        ? "— lớp chưa có buổi (thêm buổi trước) —"
                        : "— chọn buổi (mặc định: buổi gần nhất) —"}
                    </option>
                    {classSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {fmtSession(s)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => enroll(c.id, false)}
                    disabled={pending}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    Xếp vào lớp
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
