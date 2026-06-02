"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { createParentAccount, resendParentActivationOtp } from "../_actions";

type Props = {
  studentId: string;
  linked: boolean;
  parentEmail: string | null;
  parentName: string | null;
  defaultEmail: string | null;
  pendingActivation?: boolean;
};

export function ParentAccountSection({
  studentId,
  linked,
  parentEmail,
  parentName,
  defaultEmail,
  pendingActivation,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [name, setName] = useState(parentName ?? "");

  function submit() {
    if (!email) {
      toast.error("Nhập email đăng nhập của phụ huynh");
      return;
    }
    startTransition(async () => {
      const res = await createParentAccount({ studentId, email, name: name || undefined });
      if (res.ok) {
        toast.success(
          `Đã cấp tài khoản phụ huynh · liên kết ${res.linkedCount} con` +
            (res.pendingActivation ? " · đã gửi email kích hoạt" : ""),
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi cấp tài khoản");
      }
    });
  }

  function resend() {
    startTransition(async () => {
      const res = await resendParentActivationOtp(studentId);
      if (res.ok) toast.success("Đã gửi lại mã kích hoạt qua email phụ huynh");
      else toast.error(res.error ?? "Lỗi gửi lại mã");
    });
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-neutral-900">
        <KeyRound className="h-5 w-5 text-[#7C3AED]" />
        Tài khoản phụ huynh (Portal)
      </h2>

      {linked ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            pendingActivation
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              Đã liên kết tài khoản phụ huynh
              {parentEmail && <span className="font-semibold"> ({parentEmail})</span>}.{" "}
              {pendingActivation ? (
                <>Tài khoản <b>đang chờ kích hoạt</b> — phụ huynh cần mở email + nhập mã để đặt mật khẩu.</>
              ) : (
                <>
                  Phụ huynh đăng nhập tại{" "}
                  <span className="font-mono">hocvien.satarobo.vn</span> để xem &quot;site con&quot;.
                </>
              )}
            </div>
          </div>
          {pendingActivation && (
            <button
              type="button"
              onClick={resend}
              disabled={pending}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {pending ? "Đang gửi…" : "Gửi lại mã kích hoạt"}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="mb-3 text-sm text-neutral-500">
            Tạo tài khoản đăng nhập portal cho phụ huynh. Hệ thống gửi email mã kích
            hoạt để phụ huynh tự đặt mật khẩu (không đặt mật khẩu tạm). Các con cùng số
            điện thoại phụ huynh sẽ được liên kết tự động.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                Email đăng nhập (nhận mã kích hoạt)
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
