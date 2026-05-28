"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { changeEmployeeRoleAction } from "@/app/(admin)/admin/nhan-su/actions";

type Role =
  | "SUPER_ADMIN"
  | "CENTER_MANAGER"
  | "HR"
  | "SALES_CSM"
  | "TEACHER"
  | "MARKETING"
  | "ACCOUNTANT";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "CENTER_MANAGER", label: "Quản lý" },
  { value: "HR", label: "Nhân sự" },
  { value: "SALES_CSM", label: "Tư vấn tuyển sinh" },
  { value: "TEACHER", label: "Giáo viên" },
  { value: "MARKETING", label: "Marketing" },
  { value: "ACCOUNTANT", label: "Kế toán" },
];

const ROLE_LABEL: Record<Role, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label]),
) as Record<Role, string>;

interface Props {
  employeeId: string;
  employeeName: string;
  currentRole: Role;
}

export function ChangeRoleDialog({ employeeId, employeeName, currentRole }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [newRole, setNewRole] = useState<Role>(currentRole);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (pending) return;
    setIsOpen(false);
    setError(null);
    setReason("");
    setNewRole(currentRole);
  };

  const handleSubmit = () => {
    setError(null);

    if (newRole === currentRole) {
      setError("Vai trò không thay đổi");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Lý do phải có ít nhất 5 ký tự");
      return;
    }

    startTransition(async () => {
      const res = await changeEmployeeRoleAction({
        employeeId,
        newRole,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
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
        Đổi vai trò
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-role-title"
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
              id="change-role-title"
              className="flex items-center gap-2 text-lg font-bold text-neutral-900"
            >
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Thay đổi vai trò
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Nhân viên: <strong>{employeeName}</strong>
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              Hành động ghi vào audit log, không xoá được.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Vai trò hiện tại
                </label>
                <div className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium">
                  {ROLE_LABEL[currentRole] ?? currentRole}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Vai trò mới *
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  disabled={pending}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Lý do thay đổi *{" "}
                  <span className="text-xs font-normal text-neutral-500">
                    (tối thiểu 5 ký tự)
                  </span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="VD: Thăng chức lên Quản lý sau 1 năm hiệu suất tốt..."
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
                disabled={pending || newRole === currentRole}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {pending ? "Đang lưu..." : "Xác nhận thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { ROLE_LABEL };
export type { Role };
