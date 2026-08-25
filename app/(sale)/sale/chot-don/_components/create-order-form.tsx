"use client";

// Form tạo đơn — bản site Sale.
//
// Cố ý HẸP hơn form của khu quản trị: một dòng hàng, không chọn cơ sở (server ép
// theo lead), không chọn trạng thái đơn (luôn là chờ thanh toán), không đơn
// PACKAGE/EXAM/COMBO. Sale bán khoá học và học cụ; ba loại kia là việc của quầy
// và của khu quản trị.
//
// Giảm giá: có ô, nhưng LUÔN đòi giải trình — server refine đúng luật đó
// (`orderCreateManualSchema`), ở đây chỉ chặn sớm cho khỏi mất một vòng gọi.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createOrderManualAction } from "@/app/(admin)/admin/orders/_actions";
// `lib/orders/sale-orders.ts` là module SERVER-ONLY (nó đọc DB) — import
// từ component client là vỡ bundle. Định dạng tiền lấy ở nguồn chung.
import { formatVndPlain } from "@/lib/format/money";

type PaymentMethod = {
  id: string;
  name: string;
  canBuyCourse: boolean;
  canBuyProduct: boolean;
};
// `code`/`price` nullable trong schema — nới đúng kiểu thật thay vì ép kiểu ở
// chỗ gọi, để chỗ nào quên xử null thì typecheck bắt chứ không phải người dùng.
type Course = { id: string; code: string | null; name: string; price: number | null };
type Product = { id: string; sku: string; name: string; salePrice: number };

type Loai = "COURSE" | "PRODUCT";

export function CreateOrderForm({
  leadId,
  defaultCustomerName,
  defaultCustomerPhone,
  defaultCustomerEmail,
  paymentMethods,
  courses,
  products,
}: {
  leadId: string;
  defaultCustomerName: string;
  defaultCustomerPhone: string;
  defaultCustomerEmail: string;
  paymentMethods: PaymentMethod[];
  courses: Course[];
  products: Product[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [loai, setLoai] = useState<Loai>("COURSE");
  const [itemId, setItemId] = useState("");
  const [soLuong, setSoLuong] = useState(1);
  const [donGia, setDonGia] = useState(0);
  const [giam, setGiam] = useState(0);
  const [lyDoGiam, setLyDoGiam] = useState("");
  const [ptId, setPtId] = useState("");
  const [ten, setTen] = useState(defaultCustomerName);
  const [sdt, setSdt] = useState(defaultCustomerPhone);
  const [email, setEmail] = useState(defaultCustomerEmail);
  const [ghiChu, setGhiChu] = useState("");

  const danhSach = loai === "COURSE" ? courses : products;
  // Phương thức thanh toán lọc theo loại đơn — chọn phải phương thức không dùng
  // được cho loại đó thì server từ chối, mà thông báo lúc đó khó hiểu.
  const ptHopLe = useMemo(
    () => paymentMethods.filter((m) => (loai === "COURSE" ? m.canBuyCourse : m.canBuyProduct)),
    [paymentMethods, loai],
  );

  function chonItem(id: string) {
    setItemId(id);
    if (loai === "COURSE") {
      const c = courses.find((x) => x.id === id);
      // Giá gợi ý từ danh mục, vẫn sửa được: bảng giá thật có ca đặc biệt
      // (ưu đãi anh em ruột, học lại) mà danh mục không mô tả hết.
      if (c) setDonGia(c.price ?? 0);
    } else {
      const p = products.find((x) => x.id === id);
      if (p) setDonGia(p.salePrice);
    }
  }

  const tamTinh = Math.max(0, soLuong * donGia - giam);
  const item = danhSach.find((x) => x.id === itemId);
  const thieuLyDo = giam > 0 && !lyDoGiam.trim();
  const sanSang =
    !!itemId && !!ptId && soLuong > 0 && donGia >= 0 && ten.trim().length >= 2 && !!sdt.trim() && !thieuLyDo;

  function guiDi() {
    if (!sanSang || !item) return;
    start(async () => {
      const res = await createOrderManualAction({
        type: loai,
        // Trạng thái luôn là chờ thanh toán: đơn của Sale mới lập thì chưa có
        // tiền. Ghi nhận tiền là bước riêng ngay sau đó.
        status: "PENDING_PAYMENT",
        customerName: ten.trim(),
        customerPhone: sdt.trim(),
        customerEmail: email.trim() || null,
        leadId,
        // KHÔNG gửi centerId: server ép theo cơ sở của lead
        // (`checkOrderCreateOwnership`), không tin giá trị client.
        paymentMethodId: ptId,
        items: [
          {
            type: loai === "COURSE" ? "COURSE_ENROLLMENT" : "PRODUCT",
            itemName: item.name,
            quantity: soLuong,
            unitPrice: donGia,
            ...(loai === "PRODUCT" ? { productId: item.id } : {}),
            ...(loai === "COURSE" ? { metadata: { courseId: item.id } } : {}),
          },
        ],
        discountAmount: giam,
        discountReason: giam > 0 ? lyDoGiam.trim() : null,
        shippingFee: 0,
        customerNote: ghiChu.trim() || null,
      });

      if (res.ok) {
        toast.success("Đã tạo đơn — ghi nhận thanh toán ở trang khách");
        router.push(`/sale/khach-cua-toi/${leadId}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Không tạo được đơn");
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Hàng</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted-foreground">Loại</span>
            <select
              value={loai}
              onChange={(e) => {
                setLoai(e.target.value as Loai);
                setItemId("");
                setDonGia(0);
                setPtId("");
              }}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2"
            >
              <option value="COURSE">Khoá học</option>
              <option value="PRODUCT">Học cụ</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="text-muted-foreground">
              {loai === "COURSE" ? "Khoá học" : "Sản phẩm"}
            </span>
            <select
              value={itemId}
              onChange={(e) => chonItem(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2"
            >
              <option value="">— chọn —</option>
              {danhSach.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="text-muted-foreground">Số lượng</span>
            <input
              type="number"
              min={1}
              value={soLuong}
              onChange={(e) => setSoLuong(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 tabular-nums"
            />
          </label>

          <label className="text-sm">
            <span className="text-muted-foreground">Đơn giá</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={donGia}
              onChange={(e) => setDonGia(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 tabular-nums"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Giảm giá</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted-foreground">Số tiền giảm</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={giam}
              onChange={(e) => setGiam(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 tabular-nums"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">
              Giải trình {giam > 0 ? <strong className="text-foreground">(bắt buộc)</strong> : null}
            </span>
            <input
              value={lyDoGiam}
              onChange={(e) => setLyDoGiam(e.target.value)}
              placeholder="Vd: ưu đãi anh em ruột"
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3"
            />
          </label>
        </div>
        {thieuLyDo ? (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
            Mọi khoản giảm đều phải có giải trình — đây là chốt của Ban giám đốc, không
            phải ô cho vui.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Người mua &amp; thanh toán</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted-foreground">Họ tên</span>
            <input
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Điện thoại</span>
            <input
              value={sdt}
              onChange={(e) => setSdt(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 tabular-nums"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Email (không bắt buộc)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Phương thức thanh toán</span>
            <select
              value={ptId}
              onChange={(e) => setPtId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2"
            >
              <option value="">— chọn —</option>
              {ptHopLe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-muted-foreground">Ghi chú cho khách</span>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Tạm tính</span>{" "}
          <strong className="text-lg tabular-nums text-foreground">{formatVndPlain(tamTinh)}</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            Số cuối do máy chủ tính lại — đây chỉ là để đối chiếu tại chỗ.
          </p>
        </div>
        <button
          type="button"
          onClick={guiDi}
          disabled={pending || !sanSang}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Đang tạo…" : "Tạo đơn"}
        </button>
      </div>
    </div>
  );
}
