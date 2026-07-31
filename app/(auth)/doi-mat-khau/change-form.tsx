"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeOwnPasswordAction } from "./_actions";

export function ChangePasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }
    startTransition(async () => {
      const res = await changeOwnPasswordAction({ newPassword, confirmPassword });
      if (res.ok) {
        toast.success("Đã đổi mật khẩu — chào mừng bạn!");
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi đổi mật khẩu");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Mật khẩu mới</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          maxLength={72}
          required
          autoFocus
          placeholder="Tối thiểu 8 ký tự"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Nhập lại mật khẩu mới</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          maxLength={72}
          required
          placeholder="Nhập lại để xác nhận"
          className={inputCls}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {pending ? "Đang lưu…" : "Đổi mật khẩu & tiếp tục"}
      </button>
    </form>
  );
}
