"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  Voucher,
  VoucherType,
  VoucherDiscountKind,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createVoucherAction, updateVoucherAction } from "../_actions";
import {
  VOUCHER_TYPE_LABEL,
  VOUCHER_DISCOUNT_KIND_LABEL,
} from "@/lib/validators/voucher";

function toInputDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function VoucherForm({ voucher }: { voucher?: Voucher }) {
  const router = useRouter();
  const isEdit = !!voucher;
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const today = new Date();
  const oneMonthLater = new Date();
  oneMonthLater.setMonth(today.getMonth() + 1);

  const [data, setData] = useState({
    code: voucher?.code ?? "",
    name: voucher?.name ?? "",
    description: voucher?.description ?? "",
    type: (voucher?.type ?? "COURSE") as VoucherType,
    discountKind: (voucher?.discountKind ?? "PERCENT") as VoucherDiscountKind,
    discountPercent: voucher?.discountPercent ?? 10,
    discountAmount: voucher?.discountAmount ?? 50000,
    maxDiscount: voucher?.maxDiscount ?? 100000,
    minOrderValue: voucher?.minOrderValue ?? 0,
    quantity: voucher?.quantity ?? 100,
    quantityUnlimited: voucher?.quantity == null,
    usageLimitPerUser: voucher?.usageLimitPerUser ?? 1,
    validFrom: toInputDateTime(voucher?.validFrom ?? today),
    validUntil: toInputDateTime(voucher?.validUntil ?? oneMonthLater),
    isActive: voucher?.isActive ?? true,
  });

  function update<K extends keyof typeof data>(
    key: K,
    value: (typeof data)[K],
  ) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const input = {
      code: data.code.toUpperCase().trim(),
      name: data.name.trim(),
      description: data.description.trim() || null,
      type: data.type,
      discountKind: data.discountKind,
      discountPercent:
        data.discountKind === "PERCENT" ? Number(data.discountPercent) : null,
      discountAmount:
        data.discountKind === "FIXED" ? Number(data.discountAmount) : null,
      maxDiscount:
        data.discountKind === "PERCENT" && data.maxDiscount
          ? Number(data.maxDiscount)
          : null,
      minOrderValue: Number(data.minOrderValue),
      quantity: data.quantityUnlimited ? null : Number(data.quantity),
      usageLimitPerUser: Number(data.usageLimitPerUser),
      validFrom: new Date(data.validFrom),
      validUntil: new Date(data.validUntil),
      isActive: data.isActive,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateVoucherAction(voucher!.id, input)
        : await createVoucherAction(input);

      if (result.ok) {
        toast.success(isEdit ? "Đã cập nhật" : "Đã tạo voucher");
        router.push("/vouchers");
        router.refresh();
      } else {
        if ("issues" in result && result.issues) {
          const fieldErrors: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.issues.fieldErrors)) {
            if (Array.isArray(v) && typeof v[0] === "string") {
              fieldErrors[k] = v[0];
            }
          }
          setErrors(fieldErrors);
        }
        toast.error(result.error || "Lỗi xảy ra");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      {/* Basic info */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Thông tin chung
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Mã voucher *</Label>
            <Input
              value={data.code}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              placeholder="VD: OPENING2026"
              disabled={isEdit}
              required
            />
            {errors.code && (
              <p className="text-xs text-red-600">{errors.code}</p>
            )}
            {isEdit && (
              <p className="text-xs text-gray-500">
                Mã không thể đổi sau khi tạo
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Tên hiển thị *</Label>
            <Input
              value={data.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="VD: Giảm 20% khai trương"
              required
            />
            {errors.name && (
              <p className="text-xs text-red-600">{errors.name}</p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Mô tả</Label>
          <Textarea
            value={data.description ?? ""}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
          />
        </div>
      </section>

      {/* Type + Discount kind */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Loại + Cách giảm
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Loại đơn áp dụng *</Label>
            <Select
              value={data.type}
              onValueChange={(v) => update("type", v as VoucherType)}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VOUCHER_TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-gray-500">Không thể đổi sau khi tạo</p>
            )}
            {(data.type === "KIT_ROBOT" || data.type === "SENSOR") && (
              <p className="text-xs text-orange-600">
                ⚠️ Loại này chưa apply được — đợi Sprint 5.10 (Product model)
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Cách giảm giá *</Label>
            <Select
              value={data.discountKind}
              onValueChange={(v) =>
                update("discountKind", v as VoucherDiscountKind)
              }
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VOUCHER_DISCOUNT_KIND_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-gray-500">Không thể đổi sau khi tạo</p>
            )}
          </div>
        </div>
      </section>

      {/* Discount values (conditional) */}
      <section className="space-y-4 rounded-xl border-l-4 border-blue-300 border-y border-r border-gray-200 bg-blue-50/20 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-700">
          Giá trị giảm
        </h2>
        {data.discountKind === "PERCENT" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>% giảm giá *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={data.discountPercent}
                onChange={(e) =>
                  update("discountPercent", Number(e.target.value) || 0)
                }
              />
              {errors.discountPercent && (
                <p className="text-xs text-red-600">{errors.discountPercent}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Giảm tối đa (VND)</Label>
              <Input
                type="number"
                min={0}
                value={data.maxDiscount}
                onChange={(e) =>
                  update("maxDiscount", Number(e.target.value) || 0)
                }
                placeholder="Để 0 = không giới hạn"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Tiền giảm (VND) *</Label>
            <Input
              type="number"
              min={1}
              value={data.discountAmount}
              onChange={(e) =>
                update("discountAmount", Number(e.target.value) || 0)
              }
            />
            {errors.discountAmount && (
              <p className="text-xs text-red-600">{errors.discountAmount}</p>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Giá trị đơn hàng tối thiểu (VND)</Label>
          <Input
            type="number"
            min={0}
            value={data.minOrderValue}
            onChange={(e) =>
              update("minOrderValue", Number(e.target.value) || 0)
            }
            placeholder="0 = không yêu cầu"
          />
        </div>
      </section>

      {/* Usage limits */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Giới hạn sử dụng
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Tổng số lần dùng được</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={data.quantityUnlimited}
                onCheckedChange={(v) => update("quantityUnlimited", v)}
              />
              <span className="text-sm">
                {data.quantityUnlimited ? "Không giới hạn" : "Giới hạn"}
              </span>
            </div>
            {!data.quantityUnlimited && (
              <Input
                type="number"
                min={1}
                value={data.quantity}
                onChange={(e) =>
                  update("quantity", Number(e.target.value) || 1)
                }
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Mỗi SĐT dùng tối đa</Label>
            <Input
              type="number"
              min={1}
              value={data.usageLimitPerUser}
              onChange={(e) =>
                update("usageLimitPerUser", Number(e.target.value) || 1)
              }
            />
            <p className="text-xs text-gray-500">
              Mặc định 1 = first-time only
            </p>
          </div>
        </div>
      </section>

      {/* Validity */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Thời gian hiệu lực
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bắt đầu *</Label>
            <Input
              type="datetime-local"
              value={data.validFrom}
              onChange={(e) => update("validFrom", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kết thúc *</Label>
            <Input
              type="datetime-local"
              value={data.validUntil}
              onChange={(e) => update("validUntil", e.target.value)}
              required
            />
            {errors.validUntil && (
              <p className="text-xs text-red-600">{errors.validUntil}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={data.isActive}
            onCheckedChange={(v) => update("isActive", v)}
          />
          <Label className="cursor-pointer">Kích hoạt ngay</Label>
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo voucher"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Huỷ
        </Button>
      </div>
    </form>
  );
}
