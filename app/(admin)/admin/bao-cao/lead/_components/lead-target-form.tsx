"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpHint } from "@/components/admin/ui/help-hint";
import { setLeadTargetAction } from "../_target-actions";

type CenterOption = { id: string; name: string };

/**
 * C-01 — form đặt chỉ tiêu lead. Song sinh với `RevenueTargetForm`.
 *
 * ⚠️ Khác biệt DUY NHẤT dễ dùng nhầm: ô số ở đây là **số học sinh**, không phải tiền —
 * nên KHÔNG dùng `MoneyInput` (nó chèn dấu chấm phân cách và người nhập sẽ tưởng đang
 * nhập tiền). Nhãn cũng phải nói "học sinh": người quen đếm "bao nhiêu khách" sẽ nhập số
 * phụ huynh, và chỉ tiêu thành ra thấp giả với nhà nào có hai con.
 */
export function LeadTargetForm({
  centers,
  canSetGlobal,
  defaultCenterId,
  defaultPeriod,
}: {
  centers: CenterOption[];
  canSetGlobal: boolean;
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
      const res = await setLeadTargetAction(formData);
      if (res.ok) {
        toast.success("Đã lưu chỉ tiêu lead");
      } else {
        setError(res.error ?? "Có lỗi xảy ra");
        toast.error(res.error ?? "Có lỗi xảy ra");
      }
    });
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border";

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end">
      <div className="space-y-1">
        <Label htmlFor="lt-center">
          Cơ sở
          <HelpHint>
            Chỉ tiêu này áp cho cơ sở nào. &ldquo;Toàn hệ thống&rdquo; là chỉ tiêu chung của
            cả công ty và chỉ cấp hội sở đặt được. Hai loại này{" "}
            <strong>không bao giờ được cộng lại</strong>: xem toàn hệ thống thì báo cáo chỉ
            lấy dòng chung, xem từng cơ sở thì chỉ lấy dòng của các cơ sở đó.
          </HelpHint>
        </Label>
        <select id="lt-center" name="centerId" defaultValue={defaultCenterId} className={selectClass}>
          {canSetGlobal ? <option value="ALL">Toàn hệ thống</option> : null}
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="lt-period">
          Kỳ (YYYY-MM)
          <HelpHint>
            Chỉ tiêu tính theo THÁNG. Mỗi cơ sở chỉ có một chỉ tiêu cho mỗi tháng — lưu lại
            cho tháng đã có sẽ thay số cũ, không cộng thêm.
          </HelpHint>
        </Label>
        <Input id="lt-period" name="period" type="month" defaultValue={defaultPeriod} required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="lt-count">
          Chỉ tiêu (số HỌC SINH)
          <HelpHint>
            Số <strong>học sinh</strong> cần có trong tháng, <strong>không phải số phụ
            huynh</strong>. Một phụ huynh có hai con đăng ký quan tâm được tính là hai. Đếm
            nhầm sang phụ huynh sẽ làm chỉ tiêu thấp hơn thực tế cần.
          </HelpHint>
        </Label>
        <Input
          id="lt-count"
          name="targetCount"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder="0"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="lt-note">
          Ghi chú
          <HelpHint>
            Ghi lý do đặt mức này để sau nhìn lại còn hiểu vì sao. Chỉ người xem báo cáo đọc được.
          </HelpHint>
        </Label>
        <Input id="lt-note" name="note" type="text" placeholder="Tùy chọn" />
      </div>

      <div>
        <Button type="submit" disabled={pending} className="w-full md:w-auto">
          {pending ? "Đang lưu…" : "Lưu chỉ tiêu"}
        </Button>
      </div>

      {error ? <p className="md:col-span-5 text-sm text-state-danger-ink">{error}</p> : null}
    </form>
  );
}
