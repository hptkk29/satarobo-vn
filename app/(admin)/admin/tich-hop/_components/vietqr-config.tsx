"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setVietQrConfig } from "../_actions";

type Cfg = { bankBin: string; accountNumber: string; accountName: string } | null;

export type VietQrCenterRow = {
  /** null = cấu hình CHUNG (fallback khi cơ sở chưa đặt / đơn không gắn cơ sở). */
  centerId: string | null;
  centerName: string;
  current: Cfg;
};

// Commit 4 — cấu hình tài khoản nhận tiền cho VietQR động.
// BGĐ 31/07 — mỗi CƠ SỞ có tài khoản riêng: QR trên đơn tự lấy theo cơ sở của đơn,
// thiếu thì lùi về cấu hình chung.
export function VietQrConfig({
  canEdit,
  rows,
}: {
  canEdit: boolean;
  rows: VietQrCenterRow[];
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-bold text-neutral-800">Tài khoản nhận tiền (VietQR)</h2>
      <p className="mt-1 text-xs text-neutral-500">
        QR thanh toán động dựng từ tài khoản này (ảnh public img.vietqr.io — không cần API key). Mã ngân
        hàng (BIN) 6 số theo chuẩn VietQR, vd Vietinbank 970415, Vietcombank 970436, MB 970422.
        Đơn hàng lấy tài khoản <strong>theo cơ sở của đơn</strong>; cơ sở chưa cấu hình thì dùng
        tài khoản chung.
      </p>

      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <VietQrRow key={row.centerId ?? "__global"} canEdit={canEdit} row={row} />
        ))}
      </div>
    </section>
  );
}

function VietQrRow({ canEdit, row }: { canEdit: boolean; row: VietQrCenterRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [bankBin, setBankBin] = useState(row.current?.bankBin ?? "");
  const [accountNumber, setAccountNumber] = useState(row.current?.accountNumber ?? "");
  const [accountName, setAccountName] = useState(row.current?.accountName ?? "");

  function save() {
    start(async () => {
      const res = await setVietQrConfig({
        bankBin,
        accountNumber,
        accountName,
        centerId: row.centerId,
      });
      if (res.ok) {
        toast.success(`Đã lưu tài khoản nhận tiền — ${row.centerName}`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">{row.centerName}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            row.current ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-500"
          }`}
        >
          {row.current ? "Đã cấu hình" : "Chưa cấu hình"}
        </span>
      </div>

      {canEdit ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input
            value={bankBin}
            onChange={(e) => setBankBin(e.target.value)}
            placeholder="Mã NH (BIN) — 970415"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Số tài khoản"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Chủ tài khoản"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="sm:col-span-3">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Đang lưu…" : "Lưu tài khoản nhận tiền"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          {row.current
            ? `${row.current.accountName} · ${row.current.accountNumber} (BIN ${row.current.bankBin})`
            : "Chưa cấu hình — cần quyền cài đặt để thiết lập."}
        </p>
      )}
    </div>
  );
}
