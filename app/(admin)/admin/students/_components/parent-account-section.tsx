"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createParentAccount } from "../_actions";

type Props = {
  studentId: string;
  linked: boolean;
  parentEmail: string | null;
  parentName: string | null;
  defaultEmail: string | null;
};

export function ParentAccountSection({
  studentId,
  linked,
  parentEmail,
  parentName,
  defaultEmail,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(parentName ?? "");

  function submit() {
    if (!email || password.length < 8) {
      toast.error("Nhập email + mật khẩu tối thiểu 8 ký tự");
      return;
    }
    startTransition(async () => {
      const res = await createParentAccount({ studentId, email, password, name: name || undefined });
      if (res.ok) {
        toast.success(`Đã cấp tài khoản phụ huynh · liên kết ${res.linkedCount} con`);
        setPassword("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi cấp tài khoản");
      }
    });
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-neutral-900">
        <KeyRound className="h-5 w-5 text-[#7C3AED]" />
        Tài khoản phụ huynh (Portal)
      </h2>

      {linked ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            Đã liên kết tài khoản phụ huynh
            {parentEmail && (
              <span className="font-semibold"> ({parentEmail})</span>
            )}
            . Phụ huynh đăng nhập tại{" "}
            <span className="font-mono">hocvien.satarobo.vn</span> để xem &quot;site
            con&quot;.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="mb-3 text-sm text-neutral-500">
            Tạo tài khoản đăng nhập portal cho phụ huynh. Các con cùng số điện
            thoại phụ huynh sẽ được liên kết tự động.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                Email đăng nhập
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="phuhuynh@email.com"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                Tên phụ huynh
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="Tên hiển thị"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                Mật khẩu tạm (tối thiểu 8 ký tự)
              </span>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Phụ huynh đổi sau khi đăng nhập"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="mt-4 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
          >
            {pending ? "Đang tạo…" : "Cấp tài khoản phụ huynh"}
          </button>
        </div>
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400";
