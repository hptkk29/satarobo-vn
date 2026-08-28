"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { HelpHint } from "@/components/admin/ui/help-hint";
import { createCostEntryAction } from "../_actions";

export function CostEntryForm({
  categories,
  centers,
  allowCompanyLevel,
}: {
  /** ĐÃ lọc bỏ đầu phí `isSystemFed` ở server — không hiện lựa chọn sẽ bị từ chối. */
  categories: { id: string; code: string; label: string }[];
  centers: { id: string; name: string }[];
  allowCompanyLevel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCostEntryAction(formData);
      if (res.ok) {
        toast.success("Đã lưu khoản chi — đang chờ duyệt");
        formRef.current?.reset();
      } else {
        setError(res.error ?? "Có lỗi xảy ra");
        toast.error(res.error ?? "Có lỗi xảy ra");
      }
    });
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border";

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 md:grid-cols-6 md:items-end"
    >
      <div className="space-y-1">
        <Label htmlFor="ce-date">
          Ngày chi
          <HelpHint>
            Ngày <strong>phát sinh</strong> khoản chi, không phải ngày bạn nhập vào hệ thống.
            Báo cáo xếp khoản chi theo ngày này để so đúng kỳ với doanh thu.
          </HelpHint>
        </Label>
        <Input id="ce-date" name="spentDate" type="date" required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="ce-cat">
          Đầu mục
          <HelpHint>
            Đầu mục &ldquo;Chi phí quảng cáo&rdquo; <strong>cố ý không có</strong> trong danh
            sách này: số đó hệ thống tự lấy từ dữ liệu quảng cáo. Nhập tay vào đây sẽ khiến
            lợi nhuận bị trừ hai lần.
          </HelpHint>
        </Label>
        <select id="ce-cat" name="categoryId" className={selectClass} required>
          <option value="">— Chọn —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ce-center">
          Cơ sở
          <HelpHint>
            &ldquo;Cấp công ty&rdquo; dành cho chi phí không thuộc cơ sở nào (thuê văn phòng
            hội sở, lương hội sở). Khoản đó <strong>không được chia về các cơ sở</strong> ở
            phiên bản này — nó hiện thành dòng riêng trên báo cáo.
          </HelpHint>
        </Label>
        <select id="ce-center" name="centerId" className={selectClass} required>
          {allowCompanyLevel ? <option value="COMPANY">Cấp công ty</option> : null}
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ce-amount">
          Số tiền (VNĐ)
          <HelpHint>Số nguyên. Gõ 1200000 sẽ tự hiện thành 1.200.000.</HelpHint>
        </Label>
        <MoneyInput id="ce-amount" name="amount" min={0} placeholder="0" required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="ce-vendor">
          Nhà cung cấp
          <HelpHint>
            Dùng để phân biệt hai khoản cùng ngày, cùng đầu mục, cùng số tiền. Bỏ trống thì
            hai khoản như vậy sẽ bị coi là trùng nhau.
          </HelpHint>
        </Label>
        <Input id="ce-vendor" name="vendor" type="text" placeholder="Tùy chọn" />
      </div>

      <div>
        <Button type="submit" disabled={pending} className="w-full md:w-auto">
          {pending ? "Đang lưu…" : "Lưu (chờ duyệt)"}
        </Button>
      </div>

      <div className="md:col-span-6 space-y-1">
        <Label htmlFor="ce-note">Ghi chú</Label>
        <Input id="ce-note" name="note" type="text" placeholder="Tùy chọn" />
      </div>

      {error ? <p className="md:col-span-6 text-sm text-state-danger-ink">{error}</p> : null}
    </form>
  );
}
