"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateParentName, changeParentPassword } from "../actions";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none";

export function ProfileForm({
  email,
  initialName,
}: {
  email: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savingName, startName] = useTransition();

  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [savingPw, startPw] = useTransition();

  function saveName() {
    startName(async () => {
      const res = await updateParentName(name);
      if (res.ok) {
        toast.success("Đã cập nhật tên");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function savePw() {
    startPw(async () => {
      const res = await changeParentPassword({
        currentPassword: cur,
        newPassword: nw,
        confirmPassword: cf,
      });
      if (res.ok) {
        toast.success("Đã đổi mật khẩu");
        setCur("");
        setNw("");
        setCf("");
      } else toast.error(res.error ?? "Lỗi đổi mật khẩu");
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700">
          Thông tin tài khoản
        </h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Email</span>
          <input value={email} disabled className={`${inputCls} bg-neutral-50`} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">
            Tên hiển thị
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <button
          type="button"
          onClick={saveName}
          disabled={savingName}
          className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          Lưu
        </button>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700">
          Đổi mật khẩu
        </h2>
        <div className="space-y-3">
          <input
            type="password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder="Mật khẩu hiện tại"
            className={inputCls}
          />
          <input
            type="password"
            value={nw}
            onChange={(e) => setNw(e.target.value)}
            placeholder="Mật khẩu mới (≥ 8 ký tự)"
            className={inputCls}
          />
          <input
            type="password"
            value={cf}
            onChange={(e) => setCf(e.target.value)}
            placeholder="Xác nhận mật khẩu mới"
            className={inputCls}
          />
        </div>
        <button
          type="button"
          onClick={savePw}
          disabled={savingPw}
          className="mt-3 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-60"
        >
          Đổi mật khẩu
        </button>
      </section>
    </div>
  );
}
