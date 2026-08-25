"use client";

// app/(admin)/admin/lop-trial/_components/roster-list.tsx — GĐ2.
//
// Danh sách học viên của một lớp trải nghiệm. Chép hành vi từ màn `trial-classes` cũ,
// đổi sang action `*LopTrial`, thêm liên kết sang hồ sơ lead.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { X } from "lucide-react";
import { unenrollLeadChildLopTrialAction } from "../_actions";
import type { EnrollmentRow, TrialEnrollmentStatusV2 } from "../_lib/types";

const NHAN: Record<TrialEnrollmentStatusV2, string> = {
  ACTIVE: "Đang học",
  COMPLETED: "Đã xong",
  WITHDRAWN: "Đã gỡ",
};

const MAU: Record<TrialEnrollmentStatusV2, string> = {
  ACTIVE: "bg-state-success-soft text-state-success-ink",
  COMPLETED: "bg-muted text-muted-foreground",
  WITHDRAWN: "bg-state-danger-soft text-state-danger-ink",
};

export function RosterList({
  trialClassId,
  enrollments,
  canManage,
}: {
  trialClassId: string;
  enrollments: EnrollmentRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Gỡ hai nhịp thay cho `window.confirm`: id đang chờ xác nhận, tự huỷ sau 4 giây.
  const [choXacNhan, setChoXacNhan] = useState<string | null>(null);

  useEffect(() => {
    if (!choXacNhan) return;
    const t = window.setTimeout(() => setChoXacNhan(null), 4000);
    // Dọn timer khi đổi dòng hoặc rời màn — thiếu dòng này thì nhịp chờ của dòng CŨ
    // sẽ bắn về sau và xoá mất trạng thái chờ của dòng người dùng vừa bấm.
    return () => window.clearTimeout(t);
  }, [choXacNhan]);

  function go(leadChildId: string) {
    startTransition(async () => {
      const res = await unenrollLeadChildLopTrialAction({ trialClassId, leadChildId });
      if (res.ok) {
        toast.success("Đã gỡ học viên khỏi lớp");
        setChoXacNhan(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (enrollments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Chưa có học viên nào trong lớp.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {enrollments.map((e) => {
        // Ghi danh mồ côi lead (leadChildId null) không gỡ được: action định danh
        // học viên bằng leadChildId chứ không bằng id ghi danh.
        const leadChildId = e.leadChildId;
        const goDuoc = canManage && e.status === "ACTIVE" && leadChildId !== null;
        const dangCho = choXacNhan === e.id;
        return (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-[10rem]">
              <span className="text-sm font-semibold text-foreground">{e.childName}</span>
              <p className="text-xs text-muted-foreground">
                {e.parentName ? (
                  e.leadId ? (
                    <Link
                      href={`/leads/${e.leadId}`}
                      className="text-primary hover:underline"
                    >
                      {e.parentName}
                    </Link>
                  ) : (
                    e.parentName
                  )
                ) : (
                  "—"
                )}
                {e.phone ? ` · ${e.phone}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${MAU[e.status]}`}
              >
                {NHAN[e.status]}
              </span>
              {goDuoc && leadChildId && (
                <button
                  type="button"
                  onClick={() => {
                    if (dangCho) {
                      go(leadChildId);
                    } else {
                      setChoXacNhan(e.id);
                    }
                  }}
                  disabled={pending}
                  title="Gỡ khỏi lớp trải nghiệm"
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
                    dangCho
                      ? "border-state-danger bg-state-danger-soft text-state-danger-ink"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <X className="h-3 w-3" />
                  {dangCho ? "Bấm lần nữa để gỡ" : "Gỡ"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
