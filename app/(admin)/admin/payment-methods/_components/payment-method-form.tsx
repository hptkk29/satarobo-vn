"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PaymentMethod, PaymentMethodType } from "@prisma/client";
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
import {
  createPaymentMethodAction,
  updatePaymentMethodAction,
} from "../_actions";

const TYPE_OPTIONS: Array<{ value: PaymentMethodType; label: string }> = [
  { value: "CASH", label: "Tiền mặt" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản ngân hàng" },
  { value: "VNPAY", label: "VNPAY" },
  { value: "TINGEE", label: "Tingee" },
  { value: "COD", label: "COD (thu hộ khi giao)" },
  { value: "WALLET", label: "Ví điện tử" },
];

type FlagKey =
  | "canBuyCourse"
  | "canBuyPackage"
  | "canBuyExam"
  | "canBuyProduct"
  | "canDeposit";

const FLAG_DEFINITIONS: Array<{ name: FlagKey; label: string }> = [
  { name: "canBuyCourse", label: "Khoá học offline" },
  { name: "canBuyPackage", label: "Gói khoá học" },
  { name: "canBuyExam", label: "Kỳ thi" },
  { name: "canBuyProduct", label: "Sản phẩm (kit, sensor...)" },
  { name: "canDeposit", label: "Nạp ví (reserved)" },
];

export function PaymentMethodForm({ method }: { method?: PaymentMethod }) {
  const router = useRouter();
  const isEdit = !!method;
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<PaymentMethodType>(
    method?.type ?? "CASH",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showBankFields = type === "BANK_TRANSFER";
  const showGatewayFields = type === "VNPAY" || type === "TINGEE";

  const initialGateway = method?.gatewayConfig
    ? JSON.stringify(method.gatewayConfig, null, 2)
    : "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);

    startTransition(async () => {
      const result = isEdit
        ? await updatePaymentMethodAction(method!.id, formData)
        : await createPaymentMethodAction(formData);

      if (result.ok) {
        toast.success(isEdit ? "Đã cập nhật" : "Đã tạo phương thức");
        router.push("/payment-methods");
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
            <Label htmlFor="code">Mã *</Label>
            <Input
              id="code"
              name="code"
              defaultValue={method?.code ?? ""}
              placeholder="VD: CASH, BANK_TRANSFER"
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
            <Label htmlFor="name">Tên *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={method?.name ?? ""}
              placeholder="VD: Tiền mặt"
              required
            />
            {errors.name && (
              <p className="text-xs text-red-600">{errors.name}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Loại *</Label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as PaymentMethodType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={method?.description ?? ""}
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="image">URL hình ảnh (logo)</Label>
          <Input
            id="image"
            name="image"
            defaultValue={method?.image ?? ""}
            placeholder="https://..."
          />
          <p className="text-xs text-gray-500">
            Tạm thời nhập URL. Upload qua R2 sẽ thêm ở sprint sau.
          </p>
          {errors.image && (
            <p className="text-xs text-red-600">{errors.image}</p>
          )}
        </div>
      </section>

      {/* Allowed-for flags */}
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Cho phép thanh toán cho
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FLAG_DEFINITIONS.map((f) => (
            <div key={f.name} className="flex items-center gap-2">
              <Switch
                id={f.name}
                name={f.name}
                defaultChecked={method ? method[f.name] : f.name !== "canBuyProduct" && f.name !== "canDeposit"}
              />
              <Label htmlFor={f.name} className="cursor-pointer">
                {f.label}
              </Label>
            </div>
          ))}
        </div>
      </section>

      {/* Bank info */}
      {showBankFields && (
        <section className="space-y-4 rounded-xl border-l-4 border-blue-300 border-y border-r border-gray-200 bg-blue-50/20 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-700">
            Thông tin tài khoản ngân hàng
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bankName">Tên ngân hàng</Label>
              <Input
                id="bankName"
                name="bankName"
                defaultValue={method?.bankName ?? ""}
                placeholder="VD: Vietcombank"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankBranch">Chi nhánh</Label>
              <Input
                id="bankBranch"
                name="bankBranch"
                defaultValue={method?.bankBranch ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankAccountNumber">Số tài khoản *</Label>
              <Input
                id="bankAccountNumber"
                name="bankAccountNumber"
                defaultValue={method?.bankAccountNumber ?? ""}
              />
              {errors.bankAccountNumber && (
                <p className="text-xs text-red-600">
                  {errors.bankAccountNumber}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankAccountName">Chủ tài khoản *</Label>
              <Input
                id="bankAccountName"
                name="bankAccountName"
                defaultValue={method?.bankAccountName ?? ""}
              />
              {errors.bankAccountName && (
                <p className="text-xs text-red-600">
                  {errors.bankAccountName}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Gateway config */}
      {showGatewayFields && (
        <section className="space-y-4 rounded-xl border-l-4 border-orange-300 border-y border-r border-gray-200 bg-orange-50/20 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700">
            Cấu hình gateway (JSON)
          </h2>
          <p className="text-xs text-gray-500">
            VD:{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5">
              {`{"merchantId":"XYZ","apiKey":"...","returnUrl":"..."}`}
            </code>
            . Sprint 5.6.5 sẽ tích hợp thực tế.
          </p>
          <Textarea
            name="gatewayConfig"
            rows={4}
            defaultValue={initialGateway}
            placeholder='{"merchantId": "..."}'
            className="font-mono text-sm"
          />
          {errors.gatewayConfig && (
            <p className="text-xs text-red-600">{errors.gatewayConfig}</p>
          )}
        </section>
      )}

      {/* Display & Active */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="displayOrder">Thứ tự hiển thị</Label>
            <Input
              id="displayOrder"
              name="displayOrder"
              type="number"
              min={0}
              defaultValue={method?.displayOrder ?? 0}
            />
          </div>
          <div className="flex items-center gap-2 sm:pt-7">
            <Switch
              id="isActive"
              name="isActive"
              defaultChecked={method?.isActive ?? true}
            />
            <Label htmlFor="isActive" className="cursor-pointer">
              Kích hoạt
            </Label>
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo mới"}
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
