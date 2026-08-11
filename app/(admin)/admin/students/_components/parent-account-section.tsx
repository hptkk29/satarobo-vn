"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  createParentAccount,
  resendParentActivationOtp,
  issueOfflineActivationCode,
} from "../_actions";

type Props = {
  studentId: string;
  linked: boolean;
  parentEmail: string | null;
  parentName: string | null;
  defaultEmail: string | null;
  /** AUTH-SĐT P5 — SĐT phụ huynh trên hồ sơ HV, dùng làm tài khoản đăng nhập. */
  defaultPhone: string | null;
  pendingActivation?: boolean;
};

export function ParentAccountSection({
  studentId,
  linked,
  parentEmail,
  parentName,
  defaultEmail,
  defaultPhone,
  pendingActivation,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [name, setName] = useState(parentName ?? "");

  function submit() {
    if (!phone.trim()) {
      toast.error("Nhập số điện thoại đăng nhập của phụ huynh");
      return;
    }
    startTransition(async () => {
      const res = await createParentAccount({
        studentId,
        phone: phone.trim(),
        email: email.trim() || undefined,
        name: name || undefined,
      });
      if (res.ok) {
        toast.success(
          `Đã cấp tài khoản phụ huynh · liên kết ${res.linkedCount} con` +
            (res.pendingActivation ? " · đã gửi mã kích hoạt qua Zalo" : ""),
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi cấp tài khoản");
      }
    });
  }

  // AUTH-SĐT P6-C — break-glass khi ZNS chết: mã hiện TRÊN MÀN HÌNH để nhân viên
  // đọc cho phụ huynh. Bắt buộc lý do; mã chỉ nằm trong state, không lưu ở đâu.
  const [offlineReason, setOfflineReason] = useState("");
  const [offlineCode, setOfflineCode] = useState<string | null>(null);
  const [offlineOpen, setOfflineOpen] = useState(false);

  function issueOffline() {
    startTransition(async () => {
      const res = await issueOfflineActivationCode({ studentId, reason: offlineReason });
      if (res.ok && res.code) {
        setOfflineCode(res.code);
        setOfflineReason("");
        toast.success("Đã cấp mã tay — đọc cho phụ huynh, mã chỉ hiện một lần.");
      } else toast.error(res.error ?? "Không cấp được mã");
    });
  }

  function resend() {
    startTransition(async () => {
      const res = await resendParentActivationOtp(studentId);
      if (res.ok) {
        // warning = OTP đã tạo nhưng email chưa gửi được (vd dev thiếu API key).
        if (res.warning) toast.warning(res.warning);
        else toast.success("Đã gửi lại mã kích hoạt cho phụ huynh (Zalo hoặc email)");
      } else toast.error(res.error ?? "Lỗi gửi lại mã");
    });
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
        <KeyRound className="h-5 w-5 text-primary" />
        Tài khoản phụ huynh (Portal)
      </h2>

      {linked ? (
        <div
          className={`rounded-xl border p-4 text-sm ${ pendingActivation ? "border-state-warning-soft bg-state-warning-soft text-state-warning-ink" : "border-state-success-soft bg-state-success-soft text-state-success-ink" }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              Đã liên kết tài khoản phụ huynh
              {parentEmail && <span className="font-semibold"> ({parentEmail})</span>}.{" "}
              {pendingActivation ? (
                <>
                  Tài khoản <b>đang chờ kích hoạt</b> — phụ huynh nhập mã nhận qua Zalo (hoặc
                  email) để đặt mật khẩu.
                </>
              ) : (
                <>
                  Phụ huynh đăng nhập tại{" "}
                  <span className="font-mono">hocvien.satarobo.vn</span> để xem &quot;site con&quot;.
                </>
              )}
            </div>
          </div>
          {pendingActivation && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resend}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-state-warning bg-card px-3 py-1.5 text-xs font-semibold text-state-warning-ink hover:bg-state-warning-soft disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {pending ? "Đang gửi…" : "Gửi lại mã kích hoạt"}
                </button>
                <button
                  type="button"
                  onClick={() => setOfflineOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-state-warning bg-card px-3 py-1.5 text-xs font-semibold text-state-warning-ink hover:bg-state-warning-soft"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Cấp mã tại quầy
                </button>
              </div>

              {offlineOpen && (
                <div className="rounded-lg border border-state-warning bg-card p-3">
                  <p className="mb-2 text-xs leading-relaxed text-state-warning-ink">
                    Dùng khi <b>Zalo không gửi được</b> và phụ huynh đang ở quầy. Mã hiện{" "}
                    <b>một lần trên màn hình</b> để đọc trực tiếp — hệ thống không gửi đi đâu và
                    không lưu lại mã. Thao tác này <b>được ghi nhật ký kèm lý do</b>.
                  </p>
                  <textarea
                    value={offlineReason}
                    onChange={(e) => setOfflineReason(e.target.value)}
                    rows={2}
                    placeholder="Lý do cấp mã tay (bắt buộc, ≥ 10 ký tự) — vd: phụ huynh không dùng Zalo, đang ở quầy CS1"
                    className="w-full rounded-lg border border-border px-3 py-1.5 text-xs focus:border-state-warning focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={issueOffline}
                    disabled={pending || offlineReason.trim().length < 10}
                    className="mt-2 rounded-lg bg-state-warning-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-state-warning-ink-hover disabled:opacity-50"
                  >
                    {pending ? "Đang cấp…" : "Cấp mã"}
                  </button>

                  {offlineCode && (
                    <div className="mt-3 rounded-lg bg-state-warning-soft p-3 text-center">
                      <div className="text-xs font-medium text-state-warning-ink">
                        Đọc mã này cho phụ huynh (hết hạn theo cấu hình OTP):
                      </div>
                      <div className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-state-warning-ink">
                        {offlineCode}
                      </div>
                      <button
                        type="button"
                        onClick={() => setOfflineCode(null)}
                        className="mt-2 text-xs font-semibold text-state-warning-ink underline"
                      >
                        Ẩn mã
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Tạo tài khoản đăng nhập portal cho phụ huynh. Tài khoản là{" "}
            <b>số điện thoại</b>; hệ thống gửi mã kích hoạt qua <b>Zalo</b> để phụ huynh tự đặt
            mật khẩu (không đặt mật khẩu tạm). Các con cùng số điện thoại phụ huynh sẽ được
            liên kết tự động.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Số điện thoại đăng nhập (nhận mã kích hoạt) *
              </span>
              <input
                type="text"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
                placeholder="0905123456"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Email <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="Kênh dự phòng khi Zalo không tới"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
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
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? "Đang tạo…" : "Cấp tài khoản phụ huynh"}
          </button>
        </div>
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
