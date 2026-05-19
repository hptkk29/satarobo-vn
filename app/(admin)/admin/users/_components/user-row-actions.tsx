"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Pencil, KeyRound, Loader2, Shield } from "lucide-react";
import { toggleUserActiveAction } from "../_actions";

export function UserStatusToggle({
  userId,
  isActive,
  disabled,
  disabledReason,
}: {
  userId: string;
  isActive: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={disabled ? disabledReason : undefined}
      onClick={() => {
        startTransition(async () => {
          const res = await toggleUserActiveAction(userId);
          if (res.ok) {
            toast.success(
              isActive ? "Đã disable tài khoản" : "Đã kích hoạt tài khoản",
            );
          } else {
            toast.error(res.error ?? "Lỗi thao tác");
          }
        });
      }}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        isActive
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
      }`}
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            isActive ? "bg-green-600" : "bg-gray-500"
          }`}
        />
      )}
      {isActive ? "Hoạt động" : "Đã disable"}
    </button>
  );
}

export function UserRowActions({ userId }: { userId: string }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/admin/users/${userId}/edit`}
        title="Sửa"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <Pencil className="h-4 w-4" />
      </Link>
      <Link
        href={`/admin/users/${userId}/permissions`}
        title="Phân quyền nâng cao"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-purple-100 hover:text-purple-700"
      >
        <Shield className="h-4 w-4" />
      </Link>
      <Link
        href={`/admin/users/${userId}/reset-password`}
        title="Đổi mật khẩu"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-orange-100 hover:text-orange-700"
      >
        <KeyRound className="h-4 w-4" />
      </Link>
    </div>
  );
}
