"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setVietQrConfig } from "../_actions";

// Commit 4 — cấu hình tài khoản nhận tiền cho VietQR động.
export function VietQrConfig({
  canEdit,
  current,
}: {
  canEdit: boolean;
  current: { bankBin: string; accountNumber: string; accountName: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [bankBin, setBankBin] = useState(current?.bankBin ?? "");
  const [accountNumber, setAccountNumber] = useState(current?.accountNumber ?? "");
  const [accountName, setAccountName] = useState(current?.accountName ?? "");

  function save() {
    start(async () => {
      const res = await setVietQrConfig({ bankBin, accountNumber, accountName });
      if (res.ok) {
        toast.success("Đã lưu tài khoản nhận tiền");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-neutral-800">Tài khoản nhận tiền (VietQR)</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            current ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-500"
          }`}
        >
          {current ? "Đã cấu hình" : "Chưa cấu hình"}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        QR thanh toán động dựng từ tài khoản này (ảnh public img.vietqr.io — không cần API key). Mã ngân
        hàng (BIN) 6 số theo chuẩn VietQR, vd Vietinbank 970415, Vietcombank 970436, MB 970422.
      </p>

      {canEdit ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input value={bankBin} onChange={(e) => setBankBin(e.target.value)} placeholder="Mã NH (BIN) — 970415" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Số tài khoản" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Chủ tài khoản" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <div className="sm:col-span-3">
            <button onClick={save} disabled={pending} className="rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Đang lưu…" : "Lưu tài khoản nhận tiền"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-600">
          {current ? `${current.accountName} · ${current.accountNumber} (BIN ${current.bankBin})` : "Chưa cấu hình — cần quyền cài đặt để thiết lập."}
        </p>
      )}
    </section>
  );
}
