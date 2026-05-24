"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OrderType, OrderStatus, OrderItemType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createOrderManualAction } from "../_actions";

type Course = {
  id: string;
  code: string | null;
  name: string;
  price: number | null;
};
type Pkg = {
  id: string;
  code: string;
  name: string;
  priceMember: number | null;
  priceEarlyBird: number | null;
};
type PM = {
  id: string;
  code: string;
  name: string;
  canBuyCourse: boolean;
  canBuyPackage: boolean;
  canBuyExam: boolean;
  canBuyProduct: boolean;
};
type Center = { id: string; name: string };

const NO_CENTER = "NONE";

export function OrderCreateForm({
  paymentMethods,
  courses,
  packages,
  centers,
}: {
  paymentMethods: PM[];
  courses: Course[];
  packages: Pkg[];
  centers: Center[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [orderType, setOrderType] = useState<OrderType>("COURSE");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("PENDING_PAYMENT");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");

  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    ward: "",
    city: "",
  });
  const [centerId, setCenterId] = useState<string>(NO_CENTER);

  // Single item
  const [itemRefId, setItemRefId] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);

  // Pricing
  const [discountAmount, setDiscountAmount] = useState(0);
  const [shippingFee, setShippingFee] = useState(0);
  const [voucherCode, setVoucherCode] = useState("");

  // Notes
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const availablePMs = useMemo(() => {
    return paymentMethods.filter((pm) => {
      if (orderType === "COURSE") return pm.canBuyCourse;
      if (orderType === "PACKAGE") return pm.canBuyPackage;
      if (orderType === "EXAM") return pm.canBuyExam;
      if (orderType === "PRODUCT") return pm.canBuyProduct;
      return false;
    });
  }, [paymentMethods, orderType]);

  function handleItemSelect(refId: string) {
    setItemRefId(refId);
    if (orderType === "COURSE") {
      const c = courses.find((x) => x.id === refId);
      if (c) {
        setItemName(c.name);
        setUnitPrice(c.price ?? 0);
      }
    } else if (orderType === "PACKAGE") {
      const p = packages.find((x) => x.id === refId);
      if (p) {
        setItemName(p.name);
        setUnitPrice(p.priceMember ?? p.priceEarlyBird ?? 0);
      }
    }
  }

  const subtotal = unitPrice * quantity;
  const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!itemRefId || !itemName || unitPrice <= 0) {
      toast.error("Vui lòng chọn sản phẩm và nhập đơn giá > 0");
      return;
    }
    if (!paymentMethodId) {
      toast.error("Vui lòng chọn phương thức thanh toán");
      return;
    }
    if (orderType !== "COURSE" && orderType !== "PACKAGE") {
      toast.error("v1 chỉ hỗ trợ COURSE và PACKAGE");
      return;
    }

    const itemType: OrderItemType =
      orderType === "COURSE" ? "COURSE_ENROLLMENT" : "COURSE_PACKAGE";

    const item = {
      type: itemType,
      itemName,
      quantity,
      unitPrice,
      packageId: orderType === "PACKAGE" ? itemRefId : null,
      examAttemptId: null,
      metadata: orderType === "COURSE" ? { courseId: itemRefId } : null,
    };

    const input = {
      type: orderType,
      status: orderStatus,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email || null,
      customerAddress: customer.address || null,
      customerWard: customer.ward || null,
      customerCity: customer.city || null,
      studentId: null,
      leadId: null,
      centerId: centerId === NO_CENTER ? null : centerId,
      paymentMethodId,
      items: [item],
      discountAmount,
      shippingFee,
      voucherCode: voucherCode || null,
      customerNote: customerNote || null,
      internalNote: internalNote || null,
    };

    startTransition(async () => {
      const result = await createOrderManualAction(input);
      if (result.ok) {
        toast.success(`Đã tạo đơn ${result.code}`);
        router.push(`/orders/${result.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order header */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Thông tin đơn
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Loại đơn *</Label>
            <Select
              value={orderType}
              onValueChange={(v) => {
                setOrderType(v as OrderType);
                setItemRefId("");
                setItemName("");
                setUnitPrice(0);
                setPaymentMethodId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COURSE">Khoá học</SelectItem>
                <SelectItem value="PACKAGE">Gói combo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Trạng thái ban đầu</Label>
            <Select
              value={orderStatus}
              onValueChange={(v) => setOrderStatus(v as OrderStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Nháp</SelectItem>
                <SelectItem value="PENDING_PAYMENT">Chờ thanh toán</SelectItem>
                <SelectItem value="CONFIRMED">Đã xác nhận TT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phương thức TT *</Label>
            <Select
              value={paymentMethodId}
              onValueChange={(v) => setPaymentMethodId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn..." />
              </SelectTrigger>
              <SelectContent>
                {availablePMs.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>
                    {pm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Customer */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Khách hàng
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tên phụ huynh *</Label>
            <Input
              value={customer.name}
              onChange={(e) =>
                setCustomer({ ...customer, name: e.target.value })
              }
              required
              minLength={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>SĐT *</Label>
            <Input
              value={customer.phone}
              onChange={(e) =>
                setCustomer({ ...customer, phone: e.target.value })
              }
              required
              placeholder="09xxxxxxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={customer.email}
              onChange={(e) =>
                setCustomer({ ...customer, email: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trung tâm</Label>
            <Select value={centerId} onValueChange={(v) => setCenterId(v ?? NO_CENTER)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CENTER}>— Không gán —</SelectItem>
                {centers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Địa chỉ</Label>
            <Input
              value={customer.address}
              onChange={(e) =>
                setCustomer({ ...customer, address: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phường/Xã</Label>
            <Input
              value={customer.ward}
              onChange={(e) =>
                setCustomer({ ...customer, ward: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tỉnh/Thành</Label>
            <Input
              value={customer.city}
              onChange={(e) =>
                setCustomer({ ...customer, city: e.target.value })
              }
            />
          </div>
        </div>
      </section>

      {/* Item */}
      <section className="space-y-4 rounded-xl border-l-4 border-blue-300 border-y border-r border-gray-200 bg-blue-50/20 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-blue-700">
          Sản phẩm
        </h2>
        <div className="space-y-1.5">
          <Label>{orderType === "COURSE" ? "Khoá học *" : "Gói combo *"}</Label>
          <Select value={itemRefId} onValueChange={(v) => handleItemSelect(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn..." />
            </SelectTrigger>
            <SelectContent>
              {orderType === "COURSE"
                ? courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.code ? ` (${c.code})` : ""}
                    </SelectItem>
                  ))
                : packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>Số lượng</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Đơn giá (VND) *</Label>
            <Input
              type="number"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Định giá
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Mã voucher</Label>
            <Input
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              placeholder="Tuỳ chọn (Sprint 5.7)"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Giảm giá (VND)</Label>
            <Input
              type="number"
              min={0}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phí vận chuyển (VND)</Label>
            <Input
              type="number"
              min={0}
              value={shippingFee}
              onChange={(e) => setShippingFee(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">
            Tạm tính:{" "}
            <span className="tabular-nums">
              {subtotal.toLocaleString("vi-VN")}
            </span>{" "}
            đ
          </div>
          <div className="text-2xl font-bold text-gray-900">
            Tổng:{" "}
            <span className="tabular-nums">
              {totalAmount.toLocaleString("vi-VN")}
            </span>{" "}
            đ
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Ghi chú khách hàng</Label>
          <Textarea
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ghi chú nội bộ</Label>
          <Textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            rows={2}
          />
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Đang tạo..." : "Tạo đơn"}
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
