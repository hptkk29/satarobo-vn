"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRevenueTargetAction } from "../_actions";

type CenterOption = { id: string; name: string };

export function RevenueTargetForm({
  centers,
  canSetGlobal,
  defaultCenterId,
  defaultPeriod,
}: {
  centers: CenterOption[];
  /** HO-level/SUPER_ADMIN mới được đặt mục tiêu toàn hệ thống. */
  canSetGlobal: boolean;
  /** "ALL" = toàn hệ thống, hoặc centerId. */
  defaultCenterId: string;
  defaultPeriod: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await setRevenueTargetAction(formData);
      if (res.ok) {
        toast.success("Đã lưu mục tiêu doanh thu");
      } else {
        setError(res.error ?? "Có lỗi xảy ra");
        toast.error(res.error ?? "Có lỗi xảy ra");
      }
    });
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-neutral-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400";

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end">
      <div className="space-y-1">
        <Label htmlFor="rt-center">Cơ sở</Label>
        <select
          id="rt-center"
          name="centerId"
          defaultValue={defaultCenterId}
          className={selectClass}
        >
          {canSetGlobal ? <option value="ALL">Toàn hệ thống</option> : null}
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="rt-period">Kỳ (YYYY-MM)</Label>
        <Input id="rt-period" name="period" type="month" defaultValue={defaultPeriod} required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="rt-amount">Mục tiêu (VNĐ)</Label>
        <Input
          id="rt-amount"
          name="targetAmount"
          type="number"
          min={0}
          step={1}
          placeholder="0"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="rt-note">Ghi chú</Label>
        <Input id="rt-note" name="note" type="text" placeholder="Tùy chọn" />
      </div>

      <div>
        <Button type="submit" disabled={pending} className="w-full md:w-auto">
          {pending ? "Đang lưu…" : "Lưu mục tiêu"}
        </Button>
      </div>

      {error ? (
        <p className="md:col-span-5 text-sm text-red-600">{error}</p>
      ) : null}
    </form>
  );
}
