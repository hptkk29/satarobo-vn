"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { previewHandoverAction, runHandoverAction } from "../_actions";

type SaleOpt = { id: string; label: string };

export function HandoverForm({
  sales,
  statuses,
  campaigns,
}: {
  sales: SaleOpt[];
  statuses: string[];
  campaigns: string[];
}) {
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [campaign, setCampaign] = useState("");
  // ⚠️ MẶC ĐỊNH PHẢI LÀ `false`. Lead đã convert LUÔN mang `status = ENROLLED`
  // (lib/crm/convert-lead-v2.ts — bước CLAIM), và ENROLLED nằm trong TERMINAL_STATUSES
  // mà `onlyActive` loại ⇒ để mặc định `true` thì đúng nhóm lead CÓ ghi danh bị loại
  // sạch: `Enrollment.saleId` không đổi, kênh riêng của sale cũ không đóng, job đối
  // soát đêm cũng không dọn (vì `saleId` vẫn khớp sale cũ) — mà màn hình vẫn báo
  // "Đã chuyển N lead". Đây là đường mặc định của người dùng, không phải ca hiếm.
  const [onlyActive, setOnlyActive] = useState(false);
  const [reason, setReason] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [pending, start] = useTransition();

  function toggleStatus(s: string) {
    setCount(null);
    setSelStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function preview() {
    if (!fromUserId) {
      toast.error("Chọn sale bàn giao");
      return;
    }
    start(async () => {
      const res = await previewHandoverAction({ fromUserId, statuses: selStatuses, campaign, onlyActive });
      if (res.ok) setCount(res.count ?? 0);
      else toast.error(res.error ?? "Lỗi");
    });
  }

  function run() {
    if (!fromUserId || !toUserId) {
      toast.error("Chọn sale bàn giao và sale nhận");
      return;
    }
    start(async () => {
      const res = await runHandoverAction({ fromUserId, toUserId, statuses: selStatuses, campaign, onlyActive, reason });
      if (res.ok) {
        // Nói ĐỦ 4 con số: "N lead" một mình không cho biết sale cũ còn nhắn riêng
        // được phụ huynh nữa hay không.
        const parts = [
          `${res.moved} lead`,
          `${res.tasksMoved} task`,
          `${res.enrollmentsMoved ?? 0} ghi danh`,
          `${res.dmArchived ?? 0} kênh chat đóng`,
        ];
        toast.success(`Đã chuyển ${parts.join(", ")}`);
        if (res.enrollmentsUnassigned) {
          toast.warning(
            `${res.enrollmentsUnassigned} ghi danh KHÁC CƠ SỞ với sale nhận đã bị gỡ phân công — vào màn học viên của lớp để gán sale đúng cơ sở.`,
          );
        }
        setCount(null);
        setReason("");
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Sale bàn giao (nguồn)</span>
        <select
          value={fromUserId}
          onChange={(e) => {
            setFromUserId(e.target.value);
            setCount(null);
          }}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        >
          <option value="">— Chọn —</option>
          {sales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Sale nhận (đích)</span>
        <select
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        >
          <option value="">— Chọn —</option>
          {sales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="text-sm sm:col-span-2">
        <span className="mb-1 block text-muted-foreground">Lọc trạng thái (để trống = tất cả)</span>
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`rounded-full border px-2.5 py-1 text-xs ${ selStatuses.includes(s) ? "border-primary-dark bg-primary-soft text-primary" : "border-border text-muted-foreground" }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Chiến dịch (utmCampaign)</span>
        <select
          value={campaign}
          onChange={(e) => {
            setCampaign(e.target.value);
            setCount(null);
          }}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        >
          <option value="">— Mọi chiến dịch —</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div className="text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => {
              setOnlyActive(e.target.checked);
              setCount(null);
            }}
          />
          <span className="text-muted-foreground">Chỉ lead chưa đóng (bỏ ENROLLED/LOST/DUPLICATE)</span>
        </label>
        {onlyActive ? (
          <p className="mt-1 text-xs text-amber-700">
            ⚠️ Bỏ ENROLLED = bỏ luôn khách đã ghi danh: sale phụ trách ghi danh KHÔNG đổi
            và kênh chat riêng của sale cũ KHÔNG đóng. Sale nghỉ việc thì bỏ tick ô này.
          </p>
        ) : null}
      </div>

      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-muted-foreground">Lý do bàn giao</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="VD: Sale Nguyễn Văn A nghỉ việc 06/2026"
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </label>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          onClick={preview}
          disabled={pending}
          className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Xem trước số lead
        </button>
        {count !== null ? <span className="text-sm text-muted-foreground">→ {count} lead khớp điều kiện</span> : null}
        <button
          onClick={run}
          disabled={pending || count === null || count === 0}
          className="ml-auto rounded-md bg-primary-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Thực hiện bàn giao
        </button>
      </div>
    </div>
  );
}
