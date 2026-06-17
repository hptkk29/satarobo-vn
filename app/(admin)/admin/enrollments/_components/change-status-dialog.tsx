"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { changeEnrollmentStatus } from "../_actions";

type Status =
  | "PENDING"
  | "CONFIRMED"
  | "STUDYING"
  | "PAUSED"
  | "COMPLETED"
  | "WITHDREW";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "PENDING", label: "Chờ xếp lớp" },
  { value: "CONFIRMED", label: "Đã xếp lớp" },
  { value: "STUDYING", label: "Đang học" },
  { value: "PAUSED", label: "Bảo lưu" },
  { value: "COMPLETED", label: "Hoàn thành khoá" },
  { value: "WITHDREW", label: "Rút lớp" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

// FIX-C4 — map mã lỗi nghiệp vụ từ server action sang thông báo VI.
const ERROR_MESSAGE: Record<string, string> = {
  CLASS_FULL: "Lớp đã đầy — không thể chuyển học viên vào trạng thái này.",
};

interface Props {
  enrollmentId: string;
  currentStatus: string;
  studentName: string;
}

export function ChangeStatusDialog({
  enrollmentId,
  currentStatus,
  studentName,
}: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const validCurrent = STATUS_OPTIONS.find((s) => s.value === currentStatus)
    ? (currentStatus as Status)
    : "PENDING";
  const [newStatus, setNewStatus] = useState<Status>(validCurrent);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (pending) return;
    setIsOpen(false);
    setError(null);
    setReason("");
    setNewStatus(validCurrent);
  };

  const handleSubmit = () => {
    setError(null);
    if (newStatus === currentStatus) {
      setError("Trạng thái không thay đổi");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Lý do phải có ít nhất 5 ký tự");
      return;
    }
    startTransition(async () => {
      const res = await changeEnrollmentStatus({
        enrollmentId,
        newStatus,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(ERROR_MESSAGE[res.error] ?? res.error);
        // FIX-C4 — refetch sĩ số mới nhất khi lớp đã đầy (race).
        if (res.error === "CLASS_FULL") router.refresh();
        return;
      }
      setIsOpen(false);
      setReason("");
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50"
      >
        <ShieldAlert className="h-4 w-4" />
        Đổi trạng thái
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-status-title"
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
              id="change-status-title"
              className="flex items-center gap-2 text-lg font-bold text-neutral-900"
            >
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Đổi trạng thái đăng ký
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Học viên: <strong>{studentName}</strong>
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              Mỗi lần đổi sẽ ghi vào audit log, không xoá được.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Trạng thái hiện tại
                </label>
                <div className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium">
                  {STATUS_LABEL[currentStatus] ?? currentStatus}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Trạng thái mới *
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as Status)}
                  disabled={pending}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Lý do *{" "}
                  <span className="text-xs font-normal text-neutral-500">
                    (tối thiểu 5 ký tự)
                  </span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="VD: PH xác nhận xếp lớp ngày 23/05, sẵn sàng khai giảng..."
                  rows={3}
                  disabled={pending}
                  required
                  className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
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
                disabled={pending || newStatus === currentStatus}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {pending ? "Đang lưu..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
