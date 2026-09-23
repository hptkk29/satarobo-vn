import Link from "next/link";
import type { DiscountApprovalStatus, InstallmentApprovalStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { HelpHint } from "@/components/admin/ui/help-hint";
import { formatVndPlain } from "@/lib/format/money";
import { OrderApprovalButtons } from "./order-approval-buttons";

/**
 * Một tờ đơn chờ duyệt — đủ mọi mục quản lý cơ sở cần để quyết định TẠI CHỖ,
 * không phải mở sang trang chi tiết rồi quay lại (chốt 20/08/2026).
 *
 * Server Component: chỉ cặp nút bấm là client.
 */

export type PendingOrderCardData = {
  id: string;
  code: string;
  createdAt: Date;
  /** Đã che theo quyền orders:view-pii ở tầng trang — component này chỉ in ra. */
  customerName: string;
  customerPhone: string;
  centerName: string | null;
  paymentMethodName: string | null;
  subtotal: number;
  discountAmount: number;
  /** Có giá trị = nhân viên nhập theo %, null = nhập thẳng số tiền. */
  discountPercent: number | null;
  discountReason: string | null;
  shippingFee: number;
  totalAmount: number;
  customerNote: string | null;
  internalNote: string | null;
  discountApprovalStatus: DiscountApprovalStatus | null;
  installmentApprovalStatus: InstallmentApprovalStatus | null;
  items: { id: string; itemName: string; quantity: number; totalPrice: number }[];
  installments: {
    id: string;
    soDot: number;
    amount: number;
    status: string;
    dueDate: Date | null;
    paidAt: Date | null;
  }[];
};

/**
 * Ngày giờ theo múi giờ Việt Nam, khai TƯỜNG MINH.
 *
 * Vercel chạy UTC còn máy làm việc +07: để mặc định thì hạn đóng đợt 2 in ra trên
 * production lệch một ngày so với lúc thử ở máy, mà không có gì báo.
 */
function formatVnDate(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

const INSTALLMENT_STATUS_LABEL: Record<string, string> = {
  PAID: "đã thu",
  PENDING: "chưa thu",
  OVERDUE: "quá hạn",
  CANCELLED: "đã huỷ",
};

/** Dòng số tiền: nhãn trái, số phải, canh cột đều nhau giữa các đơn. */
function MoneyRow({
  label,
  value,
  hint,
  strong,
  negative,
}: {
  label: string;
  value: number;
  hint?: React.ReactNode;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-1 ${strong ? "border-t border-border pt-2 font-bold text-foreground" : "text-muted-foreground"}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {hint && <HelpHint>{hint}</HelpHint>}
      </span>
      <span
        className={`tabular-nums ${negative ? "text-state-danger-ink" : strong ? "" : "text-foreground"}`}
      >
        {negative ? "-" : ""}
        {formatVndPlain(value)}
      </span>
    </div>
  );
}

export function OrderApprovalCard({ order }: { order: PendingOrderCardData }) {
  const choDuyetGiamGia = order.discountApprovalStatus === "PENDING_APPROVAL";
  const choDuyetKeHoach = order.installmentApprovalStatus === "PENDING_APPROVAL";
  // Đơn chỉ có kế hoạch trả góp thì KHÔNG in khối giảm giá rỗng, và ngược lại —
  // "gộp một khối" không có nghĩa là bịa ra nội dung đơn không có.
  //
  // ⚠️ Đơn ĐANG CHỜ DUYỆT KẾ HOẠCH thì LUÔN in khối này, kể cả khi bảng đợt rỗng
  // hoặc mới có 1 dòng: trước đây điều kiện chỉ là `length > 1`, nên card in badge
  // "Chờ duyệt kế hoạch thanh toán" mà bên dưới không có kế hoạch nào — quản lý cơ
  // sở bấm "Duyệt đơn" trong khi không nhìn thấy thứ mình đang duyệt. Dữ liệu thiếu
  // phải NÓI RA, không được ẩn đi.
  const coKeHoach = choDuyetKeHoach || order.installments.length > 1;
  const keHoachDuDong = order.installments.length > 1;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
        <div>
          <Link
            href={`/orders/${order.id}`}
            className="font-mono text-base font-bold text-foreground hover:text-primary hover:underline"
          >
            {order.code}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tạo {formatVnDate(order.createdAt)}
            {order.centerName ? ` · ${order.centerName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {choDuyetGiamGia && (
            <Badge className="bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft">
              Chờ duyệt giảm giá
            </Badge>
          )}
          {choDuyetKeHoach && (
            <Badge className="bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft">
              Chờ duyệt kế hoạch thanh toán
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">Phụ huynh</div>
            <div className="font-medium text-foreground">{order.customerName}</div>
            <div className="text-foreground">{order.customerPhone}</div>
          </div>

          <div>
            <div className="mb-1 text-muted-foreground">Sản phẩm mua</div>
            <ul className="space-y-1">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground">{it.itemName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    SL {it.quantity} · {formatVndPlain(it.totalPrice)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="text-muted-foreground">Hình thức thanh toán: </span>
            <span className="text-foreground">{order.paymentMethodName ?? "—"}</span>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <MoneyRow label="Tiền niêm yết" value={order.subtotal} />
            {order.discountAmount > 0 && (
              <MoneyRow
                label={
                  order.discountPercent != null
                    ? `Giảm giá (theo %: ${order.discountPercent}%)`
                    : "Giảm giá (theo số tiền)"
                }
                value={order.discountAmount}
                negative
                hint={
                  <>
                    Nhân viên bán hàng nhập tay khoản giảm này — theo phần trăm hoặc
                    theo số tiền — và phải viết giải trình. Bạn duyệt nghĩa là đồng ý
                    bán ở mức giá sau giảm.
                  </>
                }
              />
            )}
            {order.shippingFee > 0 && (
              <MoneyRow label="Phí vận chuyển" value={order.shippingFee} />
            )}
            <MoneyRow label="Tổng tiền phải đóng" value={order.totalAmount} strong />
          </div>

          {order.discountReason && (
            <div className="rounded-lg bg-muted p-3">
              <span className="font-semibold text-foreground">Giải trình giảm giá: </span>
              <span className="text-foreground">{order.discountReason}</span>
            </div>
          )}

          {coKeHoach && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                Kế hoạch thanh toán 2 đợt
                <HelpHint>
                  Phụ huynh đóng làm hai lần. Duyệt là KHOÁ kế hoạch lại: sau đó số
                  tiền và số đợt không sửa được nữa, vì phiếu thu và mã QR phát cho
                  khách đã bám theo nó.
                </HelpHint>
              </div>
              {keHoachDuDong ? (
                <ul className="space-y-1">
                  {order.installments.map((i) => (
                    <li key={i.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-foreground">
                        Đợt {i.soDot}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({INSTALLMENT_STATUS_LABEL[i.status] ?? i.status}
                          {i.dueDate ? ` · hạn ${formatVnDate(i.dueDate)}` : ""}
                          {!i.dueDate && i.paidAt ? ` · ${formatVnDate(i.paidAt)}` : ""})
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {formatVndPlain(i.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                /* Nói thẳng là kế hoạch KHÔNG có gì để xem, thay vì ẩn khối rồi để
                   người duyệt tưởng đơn không có kế hoạch nào. */
                <p className="rounded-lg bg-state-warning-soft p-3 text-xs text-state-warning-ink">
                  {order.installments.length === 0
                    ? "Đơn xin duyệt kế hoạch thanh toán nhưng CHƯA CÓ dòng đợt nào."
                    : "Đơn xin duyệt kế hoạch thanh toán nhưng bảng đợt mới có 1 dòng — chưa thành kế hoạch 2 đợt."}{" "}
                  Mở đơn xem lại trước khi duyệt; nếu sai thì bấm &ldquo;Từ chối&rdquo;
                  kèm lý do để nhân viên lập lại.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {(order.customerNote || order.internalNote) && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          {order.customerNote && (
            <div>
              <span className="text-muted-foreground">Ghi chú khách hàng: </span>
              <span className="text-foreground">{order.customerNote}</span>
            </div>
          )}
          {order.internalNote && (
            <div>
              <span className="text-muted-foreground">Ghi chú nội bộ: </span>
              <span className="text-foreground">{order.internalNote}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <OrderApprovalButtons orderId={order.id} />
      </div>
    </section>
  );
}
