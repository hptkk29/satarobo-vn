"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, X } from "lucide-react";
import { transferEnrollment } from "../_actions";

interface ClassOption {
  id: string;
  classCode: string | null;
  name: string;
  status: string;
  maxStudents: number;
  enrolledCount: number;
  centerName: string | null;
}

interface Props {
  enrollmentId: string;
  currentClassId: string;
  studentName: string;
  targetClasses: ClassOption[];
}

const CLASS_STATUS_LABEL: Record<string, string> = {
  PLANNED: "Đang lên KH",
  RECRUITING: "Tuyển sinh",
  ACTIVE: "Đang dạy",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Huỷ",
};

export function TransferDialog({
  enrollmentId,
  currentClassId,
  studentName,
  targetClasses,
}: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const eligible = useMemo(
    () => targetClasses.filter((c) => c.id !== currentClassId),
    [targetClasses, currentClassId],
  );
  const selectedTarget = useMemo(
    () => eligible.find((c) => c.id === targetId) ?? null,
    [eligible, targetId],
  );
  const targetFull = selectedTarget
    ? selectedTarget.enrolledCount >= selectedTarget.maxStudents
    : false;
  const targetClosed =
    selectedTarget?.status === "CANCELLED" || selectedTarget?.status === "COMPLETED";

  const close = () => {
    if (pending) return;
    setIsOpen(false);
    setError(null);
    setReason("");
    setTargetId("");
  };

  const handleSubmit = () => {
    setError(null);
    if (!targetId) return setError("Chọn lớp đích");
    if (reason.trim().length < 5) return setError("Lý do phải có ít nhất 5 ký tự");

    startTransition(async () => {
      const res = await transferEnrollment({
        enrollmentId,
        targetClassId: targetId,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIsOpen(false);
      if (res.data?.newEnrollmentId) {
        router.push(`/admin/enrollments/${res.data.newEnrollmentId}/edit`);
      }
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border-2 border-purple-300 bg-white px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-50"
      >
        <ArrowRightLeft className="h-4 w-4" />
        Chuyển lớp
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={close}
        >
          <div
            className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Đóng"
              className="absolute right-3 top-3 rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>

            <h2
              id="transfer-title"
              className="flex items-center gap-2 text-lg font-bold text-neutral-900"
            >
              <ArrowRightLeft className="h-5 w-5 text-purple-500" />
              Chuyển lớp cho học viên
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Học viên: <strong>{studentName}</strong>
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              Tạo enrollment mới ở lớp đích; enrollment hiện tại chuyển sang
              TRANSFERRED. Audit log lưu cả 2 bên.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Lớp đích *
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={pending}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="">— Chọn lớp đích —</option>
                  {eligible.map((c) => {
                    const full = c.enrolledCount >= c.maxStudents;
                    const closed =
                      c.status === "CANCELLED" || c.status === "COMPLETED";
                    return (
                      <option
                        key={c.id}
                        value={c.id}
                        disabled={full || closed}
                      >
                        {c.classCode ? `${c.classCode} · ` : ""}
                        {c.name} · {c.centerName ?? "—"} · {c.enrolledCount}/
                        {c.maxStudents}
                        {full ? " (FULL)" : ""}
                        {closed ? ` (${c.status})` : ""}
                      </option>
                    );
                  })}
                </select>
                {selectedTarget && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={
                        "inline-flex rounded-full px-2 py-0.5 font-semibold " +
                        (targetFull
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700")
                      }
                    >
                      Còn{" "}
                      {Math.max(
                        0,
                        selectedTarget.maxStudents - selectedTarget.enrolledCount,
                      )}
                      /{selectedTarget.maxStudents} chỗ
                    </span>
                    <span className="text-neutral-500">
                      {CLASS_STATUS_LABEL[selectedTarget.status] ??
                        selectedTarget.status}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Lý do chuyển *{" "}
                  <span className="text-xs font-normal text-neutral-500">
                    (tối thiểu 5 ký tự)
                  </span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="VD: PH muốn chuyển sang lớp tối thuận tiện đưa đón..."
                  rows={3}
                  disabled={pending}
                  required
                  className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  pending || !targetId || targetFull || targetClosed
                }
                className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-bold text-white hover:bg-purple-600 disabled:opacity-50"
              >
                {pending ? "Đang chuyển..." : "Xác nhận chuyển lớp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
