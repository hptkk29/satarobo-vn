"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OrderType, OrderStatus, OrderItemType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { HelpHint } from "@/components/admin/ui/help-hint";
import { createOrderManualAction } from "../_actions";

type Course = {
  id: string;
  code: string | null;
  name: string;
  price: number | null;
};
type ProductOption = {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
  stockOnHand: number;
  category: string;
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

// O1 — selector loại đơn chỉ 2 lựa chọn (combo là course teachable → nằm trong "Khoá học").
type UiOrderType = Extract<OrderType, "COURSE" | "PRODUCT">;

const NO_CENTER = "NONE";
// N-2 — mốc "chưa quy được về con" trong ô chọn học sinh. Tách hằng riêng khỏi
// NO_CENTER dù cùng giá trị: hai ô khác nhau, đổi một cái không được kéo cái kia.
const NO_CHILD = "NONE";

export function OrderCreateForm({
  paymentMethods,
  courses,
  products,
  centers,
  provinces,
  leadId = null,
  leadChildren = [],
  defaultCustomer,
  defaultCenterId,
}: {
  paymentMethods: PM[];
  courses: Course[];
  products: ProductOption[];
  centers: Center[];
  // O2 — danh sách tỉnh/thành (2 cấp 2025) load từ server (vietnam-address-data).
  provinces: ComboboxOption[];
  // convert-v2 (R7-05/06): khi tạo đơn TỪ một lead, gắn leadId để convert sau tìm
  // được Payment RECORDED qua order.leadId. null = đơn walk-in thông thường.
  leadId?: string | null;
  // N-2 · quyết định B4 — con của phiếu, để quy đơn về đúng một đứa.
  leadChildren?: { id: string; fullName: string }[];
  defaultCustomer?: { name?: string; phone?: string; email?: string };
  defaultCenterId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [orderType, setOrderType] = useState<UiOrderType>("COURSE");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("PENDING_PAYMENT");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");

  const [customer, setCustomer] = useState({
    name: defaultCustomer?.name ?? "",
    phone: defaultCustomer?.phone ?? "",
    email: defaultCustomer?.email ?? "",
    cccd: "",
    address: "",
  });
  // O2 — tỉnh/phường qua combobox; lưu id, map sang tên khi submit.
  const [provinceId, setProvinceId] = useState<string | null>(null);
  const [wardId, setWardId] = useState<string | null>(null);
  const [wardOptions, setWardOptions] = useState<ComboboxOption[]>([]);
  const [wardLoading, setWardLoading] = useState(false);
  const [centerId, setCenterId] = useState<string>(defaultCenterId ?? NO_CENTER);
  // N-2 — phiếu ĐÚNG 1 con thì chọn sẵn (không có lựa chọn nào khác); phiếu nhiều con để
  // trống, ép người tạo đơn chọn thay vì hệ thống đoán hộ. Server suy lại y hệt luật này
  // (`resolveOrderLeadChildId`) nên bỏ qua form vẫn ra cùng kết quả.
  const [leadChildId, setLeadChildId] = useState<string>(
    leadChildren.length === 1 ? leadChildren[0]!.id : NO_CHILD,
  );

  // Single item
  const [itemRefId, setItemRefId] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);

  // Pricing
  const [discountAmount, setDiscountAmount] = useState(0);
  // BGĐ 31/07 — giảm giá nhập theo % hoặc số tiền + giải trình bắt buộc.
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");

  // Notes
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const availablePMs = useMemo(() => {
    return paymentMethods.filter((pm) => {
      if (orderType === "COURSE") return pm.canBuyCourse;
      if (orderType === "PRODUCT") return pm.canBuyProduct;
      return false;
    });
  }, [paymentMethods, orderType]);

  // Base UI <Select.Value> hiển thị value THÔ (mã/ID) → phải truyền `items` (map
  // value→nhãn) cho trigger hiện đúng tiếng Việt (item 3 — fix Radix→Base UI regression).
  const ORDER_TYPE_ITEMS: Record<UiOrderType, string> = {
    COURSE: "Khoá học",
    PRODUCT: "Sản phẩm",
  };
  const ORDER_STATUS_ITEMS = { DRAFT: "Nháp", PENDING_PAYMENT: "Chờ thanh toán", CONFIRMED: "Đã xác nhận đơn" };
  const pmItems = useMemo(
    () => Object.fromEntries(availablePMs.map((pm) => [pm.id, pm.name])),
    [availablePMs],
  );
  const centerItems = useMemo(
    () => ({ [NO_CENTER]: "— Không gán —", ...Object.fromEntries(centers.map((c) => [c.id, c.name])) }),
    [centers],
  );
  const leadChildItems = useMemo(
    () => ({
      [NO_CHILD]: "— Chưa quy được về con —",
      ...Object.fromEntries(leadChildren.map((c) => [c.id, c.fullName])),
    }),
    [leadChildren],
  );
  const itemItems = useMemo(() => {
    if (orderType === "COURSE")
      return Object.fromEntries(courses.map((c) => [c.id, c.code ? `${c.name} (${c.code})` : c.name]));
    return Object.fromEntries(products.map((pd) => [pd.id, `${pd.sku} · ${pd.name}`]));
  }, [orderType, courses, products]);

  // O4 hardening — khoá học có giá null/0 (vd Sata5 chưa nạp giá) → cảnh báo nhập tay.
  const coursePriceMissing = useMemo(() => {
    if (orderType !== "COURSE" || !itemRefId) return false;
    const c = courses.find((x) => x.id === itemRefId);
    return c ? c.price == null || c.price <= 0 : false;
  }, [orderType, itemRefId, courses]);

  function handleItemSelect(refId: string) {
    setItemRefId(refId);
    if (orderType === "COURSE") {
      const c = courses.find((x) => x.id === refId);
      if (c) {
        setItemName(c.name);
        setUnitPrice(c.price ?? 0);
      }
    } else {
      const pd = products.find((x) => x.id === refId);
      if (pd) {
        setItemName(`${pd.name} (${pd.sku})`);
        setUnitPrice(pd.salePrice);
      }
    }
  }

  // O2 — đổi tỉnh: reset phường + lazy-load danh sách phường theo tỉnh.
  function handleProvinceChange(nextProvinceId: string | null) {
    setProvinceId(nextProvinceId);
    setWardId(null);
    setWardOptions([]);
    if (!nextProvinceId) return;
    setWardLoading(true);
    void import("vietnam-address-data")
      .then(({ getWardsByProvince }) => {
        setWardOptions(
          getWardsByProvince(nextProvinceId).map((w) => ({
            value: w.id,
            label: w.name,
          })),
        );
      })
      .finally(() => setWardLoading(false));
  }

  const subtotal = unitPrice * quantity;
  // O5 — bỏ phí vận chuyển: tổng = max(0, tạm tính − giảm giá).
  // BGĐ 31/07 — chế độ %: số tiền giảm suy từ % (server tính lại — nguồn sự thật).
  const effectiveDiscount =
    discountMode === "percent"
      ? Math.min(subtotal, Math.round((subtotal * Math.min(100, Math.max(0, discountPercent))) / 100))
      : discountAmount;
  const totalAmount = Math.max(0, subtotal - effectiveDiscount);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!itemRefId || !itemName || unitPrice <= 0) {
      toast.error("Vui lòng chọn sản phẩm và nhập đơn giá > 0");
      return;
    }
    // AUTH-SĐT P5 — email khách hàng KHÔNG còn bắt buộc (xác nhận/nhắc nợ đi
    // Zalo theo SĐT). SĐT đã được validator `phoneVn` bắt buộc ở server.
    if (!paymentMethodId) {
      toast.error("Vui lòng chọn phương thức thanh toán");
      return;
    }

    const itemTypeMap: Record<UiOrderType, OrderItemType> = {
      COURSE: "COURSE_ENROLLMENT",
      PRODUCT: "PRODUCT",
    };
    const itemType: OrderItemType = itemTypeMap[orderType];

    const item = {
      type: itemType,
      itemName,
      quantity,
      unitPrice,
      packageId: null,
      examAttemptId: null,
      productId: orderType === "PRODUCT" ? itemRefId : null,
      metadata: orderType === "COURSE" ? { courseId: itemRefId } : null,
    };

    const cityName = provinceId
      ? (provinces.find((p) => p.value === provinceId)?.label ?? null)
      : null;
    const wardName = wardId
      ? (wardOptions.find((w) => w.value === wardId)?.label ?? null)
      : null;

    const input = {
      type: orderType as OrderType,
      status: orderStatus,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      customerCccd: customer.cccd || null,
      customerAddress: customer.address || null,
      customerWard: wardName,
      customerCity: cityName,
      studentId: null,
      leadId: leadId ?? null,
      // N-2 — null = chưa quy được về con; server kiểm con có thuộc phiếu này không.
      leadChildId: leadChildId === NO_CHILD ? null : leadChildId,
      centerId: centerId === NO_CENTER ? null : centerId,
      paymentMethodId,
      items: [item],
      // Chế độ %: gửi cả % (server quy ra tiền) — chế độ tiền: gửi số tuyệt đối.
      discountAmount: discountMode === "percent" ? 0 : discountAmount,
      discountPercent: discountMode === "percent" ? discountPercent || null : null,
      discountReason: discountReason.trim() || null,
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
      <section className="space-y-4 rounded-xl border border-border bg-muted/50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Thông tin đơn
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>
              Loại đơn *
              <HelpHint>
                Khoá học = học phí (gói combo cũng nằm ở đây). Sản phẩm = kit/robot bán
                rời. Chọn sai thì danh sách bên dưới và các hình thức thanh toán sẽ
                không hiện đúng.
              </HelpHint>
            </Label>
            <Select
              items={ORDER_TYPE_ITEMS}
              value={orderType}
              onValueChange={(v) => {
                setOrderType(v as UiOrderType);
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
                <SelectItem value="PRODUCT">Sản phẩm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Trạng thái ban đầu
              <HelpHint>
                Nháp: lưu tạm để sửa tiếp. Chờ thanh toán: đã chốt với khách, đang đợi
                thu tiền — chọn cái này cho hầu hết đơn. Đã xác nhận đơn: chỉ chọn khi
                tiền đã về đủ và kế toán đã đối chiếu.
              </HelpHint>
            </Label>
            <Select
              items={ORDER_STATUS_ITEMS}
              value={orderStatus}
              onValueChange={(v) => setOrderStatus(v as OrderStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Nháp</SelectItem>
                <SelectItem value="PENDING_PAYMENT">Chờ thanh toán</SelectItem>
                <SelectItem value="CONFIRMED">Đã xác nhận đơn</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Phương thức TT *
              <HelpHint>
                Cách phụ huynh trả tiền cho đơn này. Danh sách chỉ hiện những hình thức
                được phép dùng cho loại đơn đang chọn, nên đổi loại đơn là phải chọn lại.
              </HelpHint>
            </Label>
            <Select
              items={pmItems}
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
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
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
            <Label>Email (không bắt buộc)</Label>
            <Input
              type="email"
              value={customer.email}
              onChange={(e) =>
                setCustomer({ ...customer, email: e.target.value })
              }
              placeholder="Kênh dự phòng — bỏ trống nếu khách không dùng"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              CCCD/CMND
              {/* Câu hỏi phụ huynh hay hỏi lại nhân viên ("sao phải đưa CCCD?") — để sẵn
                  câu trả lời ngay cạnh ô, khỏi mỗi người giải thích một kiểu. */}
              <HelpHint>
                Chỉ cần khi phụ huynh muốn xuất hoá đơn hoặc phiếu thu đứng tên mình. Bỏ
                trống được. Số này là thông tin nhạy cảm nên ở màn Thanh toán sẽ bị che,
                ai mở xem đầy đủ đều bị ghi nhật ký.
              </HelpHint>
            </Label>
            <Input
              value={customer.cccd}
              onChange={(e) =>
                setCustomer({ ...customer, cccd: e.target.value })
              }
              inputMode="numeric"
              placeholder="9 hoặc 12 chữ số"
            />
          </div>
          {leadChildren.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                Học sinh của đơn
                <HelpHint>
                  Đơn này là của đứa con nào. Doanh thu, tỷ lệ chốt và chi phí trên mỗi
                  khách đều tính theo HỌC SINH, không theo phụ huynh — để trống thì đơn
                  rơi vào nhóm &quot;chưa quy được về con&quot; trong báo cáo. Một đơn chỉ
                  gắn được một con; hai anh em thì lập hai đơn.
                </HelpHint>
              </Label>
              <Select
                items={leadChildItems}
                value={leadChildId}
                onValueChange={(v) => setLeadChildId(v ?? NO_CHILD)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHILD}>— Chưa quy được về con —</SelectItem>
                  {leadChildren.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>
              Trung tâm
              <HelpHint>
                Cơ sở đứng tên đơn này — doanh thu và công nợ tính về cơ sở đó, và
                người của cơ sở khác sẽ không thấy đơn. Chỉ để trống khi đơn thật sự
                không thuộc cơ sở nào.
              </HelpHint>
            </Label>
            <Select items={centerItems} value={centerId} onValueChange={(v) => setCenterId(v ?? NO_CENTER)}>
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
            <Label>Địa chỉ (số nhà, đường)</Label>
            <Input
              value={customer.address}
              onChange={(e) =>
                setCustomer({ ...customer, address: e.target.value })
              }
            />
          </div>
          {/* O2 — Tỉnh/Thành TRƯỚC (searchable), Phường/Xã SAU (phụ thuộc tỉnh) */}
          <div className="space-y-1.5">
            <Label>Tỉnh/Thành</Label>
            <Combobox
              options={provinces}
              value={provinceId}
              onValueChange={handleProvinceChange}
              placeholder="Tìm tỉnh/thành..."
              emptyText="Không tìm thấy tỉnh/thành"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phường/Xã</Label>
            <Combobox
              options={wardOptions}
              value={wardId}
              onValueChange={setWardId}
              disabled={!provinceId || wardLoading}
              placeholder={
                !provinceId
                  ? "Chọn tỉnh/thành trước"
                  : wardLoading
                    ? "Đang tải..."
                    : "Tìm phường/xã..."
              }
              emptyText="Không tìm thấy phường/xã"
            />
          </div>
        </div>
      </section>

      {/* Item */}
      <section className="space-y-4 rounded-xl border-l-4 border-state-info border-y border-r border-border bg-state-info-soft/20 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-state-info-ink">
          Sản phẩm
        </h2>
        <div className="space-y-1.5">
          <Label>
            {orderType === "COURSE" ? "Khoá học *" : "Sản phẩm *"}
            <HelpHint>
              {orderType === "COURSE"
                ? "Chọn khoá là đơn giá tự điền theo giá niêm yết của khoá đó. Khoá chưa nạp giá sẽ có cảnh báo — khi đó phải nhập đơn giá tay."
                : "Sản phẩm hết hàng bị khoá, không chọn được — nhập kho trước rồi quay lại. Số tồn hiện ngay trong danh sách."}
            </HelpHint>
          </Label>
          <Select
            items={itemItems}
            value={itemRefId}
            onValueChange={(v) => handleItemSelect(v ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn..." />
            </SelectTrigger>
            <SelectContent>
              {orderType === "COURSE" &&
                courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </SelectItem>
                ))}
              {orderType === "PRODUCT" && products.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">
                  Không có sản phẩm ACTIVE. Tạo sản phẩm tại /products/new
                </div>
              )}
              {orderType === "PRODUCT" &&
                products.map((pd) => (
                  <SelectItem
                    key={pd.id}
                    value={pd.id}
                    disabled={pd.stockOnHand <= 0}
                  >
                    {pd.sku} · {pd.name} ·{" "}
                    {pd.salePrice.toLocaleString("vi-VN")}đ · còn{" "}
                    {pd.stockOnHand}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {/* O4 hardening — cảnh báo giá khoá học rỗng → nhập đơn giá tay */}
          {coursePriceMissing && (
            <div className="mt-2 rounded-lg border border-state-warning bg-state-warning-soft p-2 text-sm text-state-warning-ink">
              ⚠️ Khoá học này chưa có giá niêm yết. Vui lòng nhập đơn giá thủ
              công bên dưới.
            </div>
          )}
          {orderType === "PRODUCT" &&
            itemRefId &&
            (() => {
              const selected = products.find((p) => p.id === itemRefId);
              if (!selected) return null;
              const insufficient = selected.stockOnHand < quantity;
              return (
                <div
                  className={
                    "mt-2 rounded-lg p-2 text-sm " +
                    (insufficient
                      ? "border border-state-danger-soft bg-state-danger-soft text-state-danger-ink"
                      : "border border-state-info-soft bg-state-info-soft text-state-info-ink")
                  }
                >
                  {insufficient ? "⚠️" : "ℹ️"} Tồn kho hiện tại:{" "}
                  {selected.stockOnHand}
                  {insufficient && ` — không đủ cho yêu cầu ${quantity}`}
                </div>
              );
            })()}
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
            <Label>
              Đơn giá (VND) *
              <HelpHint>
                Tự điền theo giá niêm yết khi chọn khoá học/sản phẩm; chỉ sửa tay khi
                khoá chưa có giá. Muốn bớt tiền cho khách thì dùng ô Giảm giá bên dưới —
                hạ thẳng đơn giá sẽ không ai duyệt và báo cáo mất dấu khoản ưu đãi.
              </HelpHint>
            </Label>
            {/* Ô tiền: gõ 10000000 → hiện 10.000.000. Xoá trắng quy về 0 để chốt chặn
                `unitPrice <= 0` ở handleSubmit vẫn bắt được như trước. */}
            <MoneyInput
              name="unitPrice"
              min={0}
              value={unitPrice}
              onValueChange={(v) => setUnitPrice(v ?? 0)}
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="space-y-4 rounded-xl border border-border bg-muted/50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Định giá
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* BGĐ 31/07 — giảm giá: chọn hình thức % hoặc số tiền. */}
          <div className="space-y-1.5">
            <Label>
              Giảm giá
              <HelpHint>
                Theo số tiền: gõ thẳng số tiền bớt cho khách. Theo %: gõ 1–100, hệ thống
                quy ra tiền trên phần tạm tính. Hai cách cho ra cùng một khoản giảm —
                chọn cách nào đúng với thoả thuận với phụ huynh thì dễ giải trình hơn.
              </HelpHint>
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={discountMode === "amount" ? "default" : "outline"}
                onClick={() => setDiscountMode("amount")}
              >
                Theo số tiền
              </Button>
              <Button
                type="button"
                size="sm"
                variant={discountMode === "percent" ? "default" : "outline"}
                onClick={() => setDiscountMode("percent")}
              >
                Theo %
              </Button>
            </div>
            {discountMode === "amount" ? (
              // Chỉ nhánh "theo số tiền" là ô tiền; nhánh "theo %" vẫn là số đếm 1–100.
              <MoneyInput
                name="discountAmount"
                min={0}
                value={discountAmount}
                onValueChange={(v) => setDiscountAmount(v ?? 0)}
                placeholder="Số tiền giảm"
              />
            ) : (
              <Input
                type="number"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(e) =>
                  setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                }
                placeholder="% giảm (1–100)"
              />
            )}
          </div>
        </div>

        {/* BGĐ 31/07 — giải trình bắt buộc khi giảm giá tay; đơn sẽ chờ QLCS duyệt. */}
        {effectiveDiscount > 0 && (
          <div className="space-y-1.5">
            <Label>
              Giải trình giảm giá *
              <HelpHint>
                Quản lý cơ sở duyệt đơn đọc đúng dòng này để đồng ý hay trả lại, nên ghi
                rõ lý do và ai đã đồng ý (VD: &ldquo;em ruột HV Sata2, chị Lan CS1 đồng
                ý&rdquo;). Ghi &ldquo;ưu đãi&rdquo; chung chung thì đơn dễ bị trả lại và
                phụ huynh phải chờ.
              </HelpHint>
            </Label>
            <Input
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              maxLength={1000}
              placeholder="VD: HV cũ giới thiệu em ruột — ưu đãi theo chính sách anh chị em"
            />
            <p className="text-xs text-state-warning-ink">
              Đơn có giảm giá sẽ ở trạng thái <strong>chờ Quản lý cơ sở duyệt</strong> — chỉ
              xác nhận được sau khi duyệt.
            </p>
          </div>
        )}

        <div className="text-right">
          <div className="text-sm text-muted-foreground">
            Tạm tính:{" "}
            <span className="tabular-nums">
              {subtotal.toLocaleString("vi-VN")}
            </span>{" "}
            đ
          </div>
          {effectiveDiscount > 0 && (
            <div className="text-sm text-muted-foreground">
              Giảm giá:{" "}
              <span className="tabular-nums">
                −{effectiveDiscount.toLocaleString("vi-VN")}
              </span>{" "}
              đ
              {discountMode === "percent" && discountPercent > 0
                ? ` (${discountPercent}%)`
                : ""}
            </div>
          )}
          <div className="text-2xl font-bold text-foreground">
            Tổng:{" "}
            <span className="tabular-nums">
              {totalAmount.toLocaleString("vi-VN")}
            </span>{" "}
            đ
            <HelpHint className="ml-1.5 [&_svg]:size-4">
              Số tiền phụ huynh phải đóng cho đơn này = Tạm tính − Giảm giá. Nếu phụ
              huynh đóng làm 2 đợt thì vẫn lấy số này làm tổng, phần chia đợt làm ở màn
              chi tiết đơn sau khi tạo.
            </HelpHint>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            Ghi chú khách hàng
            <HelpHint>
              Nội dung liên quan trực tiếp tới khách: yêu cầu riêng, thoả thuận lúc bán.
              Việc nội bộ (dặn nhau, đánh giá khách) ghi ở ô bên cạnh.
            </HelpHint>
          </Label>
          <Textarea
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Ghi chú nội bộ
            <HelpHint>
              Chỉ nhân viên Sata Robo đọc được — dùng để dặn nhau về đơn này (đã hẹn gọi
              lại, chờ phụ huynh chuyển khoản…).
            </HelpHint>
          </Label>
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
