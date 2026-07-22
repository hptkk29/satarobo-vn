"use client";

import { useState } from "react";
import type { StudentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReserveModal } from "./reserve-modal";
import { ResumeReserveModal } from "./resume-reserve-modal";
import { WithdrawModal } from "./withdraw-modal";
import { ReactivateModal } from "./reactivate-modal";
import { formatDateVN } from "@/lib/format/date";

const STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Đang học",
  PAUSED: "Bảo lưu",
  GRADUATED: "Hoàn thành",
  INACTIVE: "Nghỉ học",
};

type ActiveReserve = {
  id: string;
  startedAt: Date;
  reason: string;
  expectedEndAt: Date | null;
};

type EnrollmentSummary = {
  id: string;
  status: string;
  class: { name: string };
};

type ModalKind = "reserve" | "resume" | "withdraw" | "reactivate" | null;

export function LifecycleActions({
  studentId,
  studentName,
  studentStatus,
  activeReserve,
  enrollments,
}: {
  studentId: string;
  studentName: string;
  studentStatus: StudentStatus;
  activeReserve: ActiveReserve | null;
  enrollments: EnrollmentSummary[];
}) {
  const [open, setOpen] = useState<ModalKind>(null);

  const studyingEnrollments = enrollments.filter(
    (e) => e.status === "STUDYING",
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Lifecycle học viên
        </h3>
        <Badge variant="outline">{STATUS_LABEL[studentStatus]}</Badge>
      </div>

      {activeReserve && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
          <div className="font-medium text-yellow-900">🟡 Đang bảo lưu</div>
          <div className="mt-1 text-xs text-yellow-800">
            Từ {formatDateVN(activeReserve.startedAt)}
            {activeReserve.expectedEndAt &&
              ` → dự kiến trở lại ${formatDateVN(activeReserve.expectedEndAt)}`}
          </div>
          <div className="mt-1 text-xs italic text-yellow-900">
            Lý do: {activeReserve.reason}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {studentStatus === "ACTIVE" &&
          studyingEnrollments.length > 0 &&
          !activeReserve && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen("reserve")}
            >
              🟡 Bảo lưu
            </Button>
          )}
        {activeReserve && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen("resume")}
          >
            ✅ Kết thúc bảo lưu
          </Button>
        )}
        {studentStatus !== "INACTIVE" && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => setOpen("withdraw")}
          >
            ❌ Nghỉ học hẳn
          </Button>
        )}
        {studentStatus === "INACTIVE" && (
          <Button
            variant="outline"
            size="sm"
            className="border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => setOpen("reactivate")}
          >
            🔄 Kích hoạt lại
          </Button>
        )}
      </div>

      {open === "reserve" && (
        <ReserveModal
          studentId={studentId}
          studentName={studentName}
          enrollments={studyingEnrollments}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "resume" && activeReserve && (
        <ResumeReserveModal
          reserveId={activeReserve.id}
          studentName={studentName}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "withdraw" && (
        <WithdrawModal
          studentId={studentId}
          studentName={studentName}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "reactivate" && (
        <ReactivateModal
          studentId={studentId}
          studentName={studentName}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
