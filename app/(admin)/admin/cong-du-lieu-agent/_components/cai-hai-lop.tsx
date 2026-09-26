"use client";

// Cài xác thực 2 lớp (TOTP) cho CHÍNH người đang xem: lấy mã QR → quét bằng ứng dụng xác thực
// → gõ mã 6 số để xác nhận. Đã bật thì không tự cài lại được — mất máy phải nhờ người duyệt
// đặt lại (có lý do + audit), đúng như `batDauCaiHaiLop` từ chối DA_BAT.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { batDauCaiHaiLopAction, xacNhanCaiHaiLopAction } from "../_actions";
import { ngayGio } from "./dinh-dang";

export function CaiHaiLop({
  daBat,
  dangCai,
  khoaDen,
}: {
  daBat: boolean;
  dangCai: boolean;
  /** ISO — tạm khoá do nhập sai nhiều lần; null nếu không khoá. */
  khoaDen: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Bí mật + QR chỉ sống trong state tới khi xác nhận xong — không lưu đâu khác.
  const [cai, setCai] = useState<{ qr: string; biMat: string } | null>(null);
  const [ma, setMa] = useState("");

  if (daBat) {
    return (
      <div className="space-y-2">
        <StatusPill tone="success">Đã bật</StatusPill>
        {khoaDen && (
          <p className="text-sm font-semibold text-state-warning-ink">
            Đang tạm khoá tới {ngayGio(khoaDen)} do nhập sai mã nhiều lần.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Mất hoặc đổi điện thoại? Nhờ một người duyệt khác đặt lại cho bạn — không tự cài đè được.
        </p>
      </div>
    );
  }

  function batDau() {
    startTransition(async () => {
      const kq = await batDauCaiHaiLopAction();
      if (kq.ok) {
        setCai(kq.data);
        setMa("");
      } else {
        toast.error(kq.error);
      }
    });
  }

  function xacNhan() {
    if (!/^\d{6}$/.test(ma)) return;
    startTransition(async () => {
      const kq = await xacNhanCaiHaiLopAction({ ma });
      if (kq.ok) {
        toast.success("Đã bật xác thực 2 lớp");
        setCai(null);
        setMa("");
        router.refresh();
      } else {
        toast.error(kq.error);
        setMa("");
      }
    });
  }

  if (!cai) {
    return (
      <div className="space-y-3">
        <StatusPill tone="warning">Chưa bật</StatusPill>
        <p className="text-sm text-muted-foreground">
          {dangCai
            ? "Bạn đang cài dở. Bấm “Bắt đầu cài” để lấy mã QR mới (mã cũ hết hiệu lực)."
            : "Cần một ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft Authenticator, 1Password…)."}
        </p>
        <Button type="button" onClick={batDau} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Bắt đầu cài
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
        <li>Mở ứng dụng xác thực, chọn thêm tài khoản bằng mã QR và quét mã dưới đây.</li>
        <li>Không quét được thì gõ tay bí mật bên cạnh.</li>
        <li>Nhập mã 6 số ứng dụng hiện ra rồi bấm Xác nhận.</li>
      </ol>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Ảnh là data URL do server dựng — không qua next/image (không có gì để tối ưu). */}
        <img
          src={cai.qr}
          alt="Mã QR để cài xác thực 2 lớp"
          width={220}
          height={220}
          className="h-[220px] w-[220px] shrink-0 rounded-lg border border-border bg-white p-1"
        />
        <div className="min-w-0 space-y-3">
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bí mật (gõ tay)
            </span>
            <code className="block select-all break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm tracking-wider text-foreground">
              {cai.biMat.replace(/(.{4})/g, "$1 ").trim()}
            </code>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              xacNhan();
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-foreground">Mã 6 số</span>
              <Input
                value={ma}
                onChange={(e) => setMa(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={pending}
                className="w-40 font-mono tracking-widest"
              />
            </label>
            <Button type="submit" disabled={pending || !/^\d{6}$/.test(ma)}>
              {pending && <Loader2 className="animate-spin" />}
              Xác nhận
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setCai(null);
                setMa("");
              }}
            >
              Huỷ
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
