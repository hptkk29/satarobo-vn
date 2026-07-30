"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestActivationOtp, activateAccount } from "./_actions";

export function ActivateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"email" | "verify" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Đếm ngược cooldown gửi lại.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function sendOtp() {
    startTransition(async () => {
      const res = await requestActivationOtp(email);
      if (res.ok) {
        toast.success("Đã gửi mã kích hoạt tới email (nếu hợp lệ).");
        setStep("verify");
        setCooldown(res.cooldownSec ?? 60);
      } else {
        toast.error(res.error ?? "Lỗi gửi mã");
        if (res.cooldownSec) setCooldown(res.cooldownSec);
      }
    });
  }

  function resend() {
    if (cooldown > 0) return;
    sendOtp();
  }

  function activate() {
    startTransition(async () => {
      const res = await activateAccount({ email, code, password });
      if (res.ok) {
        toast.success("Kích hoạt thành công! Bạn có thể đăng nhập.");
        setStep("done");
      } else toast.error(res.error ?? "Lỗi kích hoạt");
    });
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none";

  if (step === "done") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-600">
          Tài khoản đã được kích hoạt. Đăng nhập bằng email và mật khẩu vừa đặt.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Đến trang đăng nhập
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Email phụ huynh</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={step === "verify" || pending}
          placeholder="email@example.com"
          className={inputCls}
        />
      </label>

      {step === "email" && (
        <>
          <button
            type="button"
            onClick={sendOtp}
            disabled={pending || !email}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {pending ? "Đang gửi…" : "Gửi mã kích hoạt"}
          </button>
          {/* AUTH-SĐT P0 §3.4 — bù cho việc bịt oracle liệt kê tài khoản: hệ thống
              luôn trả cùng một câu nên không còn nói được "tài khoản đã kích hoạt".
              Dòng tĩnh này thay thế thông điệp đó (chốt 29/07). */}
          <p className="text-xs leading-relaxed text-gray-500">
            Vì lý do bảo mật, hệ thống luôn báo đã gửi mã. Nếu tài khoản của quý phụ huynh{" "}
            <strong className="font-medium text-gray-600">đã kích hoạt trước đó</strong>, vui lòng đăng
            nhập bằng mật khẩu đã đặt. Không nhận được mã sau vài phút, xin liên hệ trung tâm.
          </p>
        </>
      )}

      {step === "verify" && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Mã OTP (6 số trong email)</span>
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className={`${inputCls} tracking-[0.4em]`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Đặt mật khẩu (≥ 8 ký tự)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={activate}
            disabled={pending || code.length !== 6 || password.length < 8}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {pending ? "Đang kích hoạt…" : "Kích hoạt & đặt mật khẩu"}
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0 || pending}
            className="w-full text-xs text-gray-500 hover:text-gray-700 disabled:opacity-60"
          >
            {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : "Gửi lại mã"}
          </button>
        </>
      )}
    </div>
  );
}
