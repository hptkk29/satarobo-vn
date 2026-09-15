"use client";

import { useState, useTransition } from "react";
import { docHinhThucLop } from "@/lib/orders/hinh-thuc-lop";
import { NHAN_COACH } from "@/lib/finance/coach-pricing";
import Link from "next/link";
import { Loader2, ChevronDown, Pencil, ArrowRightLeft, User } from "lucide-react";
import { nationalPhone } from "@/lib/phone";
import { toast } from "sonner";
import type { Prisma, OrderStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  changeOrderStatusAction,
  updateOrderNoteAction,
  updateOrderPaymentMethodAction,
} from "../_actions";
import { OrderInstallmentPlan, OrderQrSection } from "./order-payment-section";
import { OrderDebtSummary } from "./order-debt-summary";
import type { CongNoDon } from "@/lib/finance/cong-no-don";
import {
  PaymentRequestsSection,
  type PaymentRequestRow,
} from "./payment-requests-section";
import type { QrSessionView } from "../_qr-core";
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  deriveInstallmentBadge,
} from "@/lib/orders/status";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { ThongTinHoaDon } from "./thong-tin-hoa-don";
import {
  methodAllowsOrderType,
  methodServesCenter,
} from "@/lib/payments/method-scope";

// G4 — phương thức thanh toán có thể sửa (chỉ khi đơn chưa xác nhận); cần khả năng theo loại đơn.
type PaymentMethodOption = {
  id: string;
  name: string;
  /** null = dùng chung mọi cơ sở. RSC đã lọc theo cơ sở của đơn; giữ cột để lọc lại. */
  centerId: string | null;
  canBuyCourse: boolean;
  canBuyPackage: boolean;
  canBuyExam: boolean;
  canBuyProduct: boolean;
};

type InstallmentView = {
  id: string;
  soDot: number;
  amount: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  reminderDays: number | null;
};

type OrderWithIncludes = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: { select: { id: true; sku: true } };
        student: { select: { id: true; name: true } };
      };
    };
    paymentMethod: true;
    student: { select: { id: true; name: true } };
    lead: { select: { id: true; parentName: true } };
    center: { select: { id: true; name: true } };
    history: true;
  };
}>;

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  DRAFT: "bg-muted text-foreground hover:bg-muted",
  PENDING_PAYMENT:
    "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft",
  CONFIRMED: "bg-state-info-soft text-state-info-ink hover:bg-state-info-soft",
  COMPLETED:
    "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft",
  CANCELLED:
    "bg-state-danger-soft text-state-danger-ink hover:bg-state-danger-soft",
  REFUNDED: "bg-primary-soft text-primary hover:bg-primary-soft",
};

/**
 * Các khoản giảm của một dòng, đọc từ cột JSON `OrderItem.discounts`.
 *
 * ⚠️ `Json?` của Prisma tới đây là `unknown` — dữ liệu đi qua ranh giới RSC và không
 * có kiểu nào ép nó. Đọc phòng thủ và trả MẢNG RỖNG khi không hiểu, chứ không ném:
 * một đơn cũ (cột NULL) hay một hàng bị sửa tay ở DB không được làm trắng cả trang
 * đơn. Số tiền ở chân bảng vẫn lấy từ cột Int `discountAmount`, nên mảng này chỉ ảnh
 * hưởng phần GIẢI THÍCH — không có đường nào để nó làm sai một con số tiền.
 */
type KhoanGiamDaAp = {
  kieu: string;
  giaTri: number;
  phanTram: number | null;
  giam: number;
  lyDo: string | null;
};

function docKhoanGiam(raw: unknown): KhoanGiamDaAp[] {
  if (!Array.isArray(raw)) return [];
  const ra: KhoanGiamDaAp[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.giam !== "number") continue;
    ra.push({
      kieu: typeof o.kieu === "string" ? o.kieu : "SO_TIEN",
      giaTri: typeof o.giaTri === "number" ? o.giaTri : 0,
      phanTram: typeof o.phanTram === "number" ? o.phanTram : null,
      giam: o.giam,
      lyDo: typeof o.lyDo === "string" ? o.lyDo : null,
    });
  }
  return ra;
}

// OD1b — duyệt kế hoạch trả góp 2 đợt (C4).

/**
 * Ngày (không giờ) theo múi giờ Việt Nam, khai TƯỜNG MINH.
 *
 * Khối này render cả ở server lẫn client: server Vercel chạy UTC còn trình duyệt của
 * người dùng ở +07, để mặc định thì hạn đóng đợt 2 lệch một ngày giữa hai lần vẽ.
 */

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Khối phụ ở cột phải — tiêu đề nhỏ, nội dung là cặp nhãn/giá trị. */
function Khoi({
  tieuDe,
  hanhDong,
  children,
}: {
  tieuDe: string;
  hanhDong?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {tieuDe}
        </h2>
        {hanhDong}
      </div>
      {children}
    </section>
  );
}

/**
 * Một cặp nhãn/giá trị.
 *
 * `min-w-0` + `break-words` vì tiếng Việt dài là mặc định chứ không phải ca biên
 * (PRODUCT.md nguyên tắc 2): tên cơ sở "Trụ sở chính - Nguyễn Hữu Thọ" và email khách
 * đều dài hơn cột phải 20rem.
 */
function O({
  nhan,
  children,
}: {
  nhan: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {nhan}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function OrderDetailClient({
  order,
  canManage,
  qrUrl,
  transferContent,
  dueNow,
  installments,
  paymentRequests,
  qrSessions,
  paymentMethods,
  accounting,
  congNo,
  hanhDongPhu,
}: {
  order: OrderWithIncludes;
  canManage: boolean;
  // OD1b — quyền duyệt kế hoạch trả góp (installments:approve) tách khỏi orders:manage.
  // BGĐ 31/07 — quyền duyệt giảm giá nhập tay (discounts:approve).
  // G4 — QR + kế hoạch 2 đợt render trong cùng component để kiểm soát thứ tự section.
  qrUrl: string | null;
  transferContent: string;
  /** Số tiền QR đang thu (đợt 1 nếu chọn 2 đợt) + nhãn. */
  dueNow: { amount: number; label: string };
  installments: InstallmentView[];
  /** 03/08 — sổ phiếu thu theo đợt (nguồn của bảng "Phiếu thu & QR theo đợt"). */
  paymentRequests: PaymentRequestRow[];
  /** Phiên QR ACTIVE còn hạn của từng phiếu (key = paymentRequestId). */
  qrSessions: Record<string, QrSessionView>;
  paymentMethods: PaymentMethodOption[];
  // (b) PA-A — tổng theo sổ kế toán (Payment) của đơn: CONFIRMED vs PENDING (chờ ✓).
  accounting: { confirmed: number; pending: number };
  congNo: CongNoDon;
  /**
   * Nút phụ của thanh tiêu đề (hiện là "Gửi email") — RSC truyền vào vì nó cần dữ liệu
   * mẫu email lấy từ DB. Để đây thay vì dựng một thanh tiêu đề thứ hai ở RSC: hai thanh
   * hành động cạnh nhau là hai chỗ người dùng phải quét mắt cho cùng một việc.
   */
  hanhDongPhu?: React.ReactNode;
}) {
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | "">("");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState(order.internalNote ?? "");
  const [isPending, startTransition] = useTransition();
  // G4 — lịch sử trạng thái dạng dropdown (mặc định đóng).
  const [historyOpen, setHistoryOpen] = useState(false);
  // G4 — sửa phương thức thanh toán (chỉ khi đơn chưa xác nhận).
  const [pmEditing, setPmEditing] = useState(false);
  const [pmValue, setPmValue] = useState(order.paymentMethodId ?? "");

  // Số học viên KHÁC NHAU mà đơn này đang gánh. Đếm theo `OrderItem.studentId` chứ
  // không theo `order.studentId`: cột trên đơn chỉ được set khi đơn quy về đúng một
  // em, nên với đơn hai con nó là NULL và đếm ở đó luôn ra 0.
  const soHocVienTrenDon = new Set(
    order.items.map((it) => it.studentId).filter((id): id is string => !!id),
  ).size;

  // Tổng giảm khai Ở CẤP DÒNG. Khác `order.discountAmount` với dữ liệu CŨ: đơn cũ giảm
  // ở cấp đơn nên tổng này = 0 trong khi cột đơn > 0. Không được "sửa" chênh lệch đó —
  // chia ngược một khoản giảm cả đơn về từng dòng là bịa ra một sự thật mịn hơn sự thật
  // gốc (xem đầu migration 20260915140000).
  const giamTheoDong = order.items.reduce((s, it) => s + it.discountAmount, 0);

  const nextOptions = NEXT_STATUSES[order.status];
  // G4 — chỉ cho sửa phương thức khi đơn còn DRAFT/PENDING_PAYMENT (khớp guard server).
  const canEditPaymentMethod =
    canManage && (order.status === "DRAFT" || order.status === "PENDING_PAYMENT");
  // Luật chọn phương thức nay ở MỘT chỗ (lib/payments/method-scope.ts) — dùng chung với
  // cổng server `updateOrderPaymentMethodAction`, nên dropdown không thể lệch với thứ
  // server chấp nhận. Lọc cả cơ sở dù RSC đã lọc: rẻ, và là lưới nếu ai đó đổi câu query.
  const pmUsable = (pm: PaymentMethodOption): boolean =>
    methodServesCenter(pm, order.centerId) && methodAllowsOrderType(pm, order.type);
  const usablePMs = paymentMethods.filter(pmUsable);
  // ⚠️ `<Select>` dựng trên base-ui: `<SelectValue>` in GIÁ TRỊ THÔ, không tra nhãn từ
  // `<SelectItem>` con. Ở đây value là PaymentMethod.id (cuid), nên thiếu map `items` là
  // ô hiện ra một chuỗi cuid thay vì tên phương thức.
  const pmItems = Object.fromEntries(usablePMs.map((pm) => [pm.id, pm.name]));

  // FIX-H9 — updatedAt client đã thấy; gửi kèm mọi lần ghi để phát hiện sửa đồng thời.
  const seenUpdatedAt = new Date(order.updatedAt).toISOString();

  // `InstallmentView.status` là `string` (dữ liệu đã tuần tự hoá qua ranh giới RSC), còn
  // `deriveInstallmentBadge` chỉ nhận "PENDING" | "PAID". Lọc thay vì ép kiểu: một giá trị
  // lạ lọt vào thì badge im lặng biến mất, còn ép kiểu thì nó hiện SAI.
  const badgeTraGop = deriveInstallmentBadge(
    installments.flatMap((i) =>
      i.status === "PENDING" || i.status === "PAID"
        ? [{ soDot: i.soDot, status: i.status }]
        : [],
    ),
  );

  function handleStale() {
    toast.error("Người khác vừa sửa đơn này. Đang tải lại…");
    setStatusModalOpen(false);
    setTimeout(() => window.location.reload(), 800);
  }

  function handleStatusChange() {
    if (!newStatus) return;
    startTransition(async () => {
      const result = await changeOrderStatusAction(
        order.id,
        { toStatus: newStatus, reason },
        seenUpdatedAt,
      );
      if (result.ok) {
        toast.success("Đã đổi trạng thái");
        setStatusModalOpen(false);
        window.location.reload();
      } else if (result.error === "STALE_WRITE") {
        handleStale();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSaveNote() {
    startTransition(async () => {
      const result = await updateOrderNoteAction(
        order.id,
        internalNote,
        seenUpdatedAt,
      );
      if (result.ok) {
        toast.success("Đã lưu ghi chú");
        window.location.reload();
      } else if (result.error === "STALE_WRITE") {
        handleStale();
      } else toast.error(result.error);
    });
  }

  // G4 — đổi phương thức thanh toán (huỷ → giữ phương thức cũ).
  function handleSavePaymentMethod() {
    if (!pmValue) {
      toast.error("Chọn phương thức thanh toán");
      return;
    }
    startTransition(async () => {
      const result = await updateOrderPaymentMethodAction(
        order.id,
        pmValue,
        seenUpdatedAt,
      );
      if (result.ok) {
        toast.success("Đã đổi phương thức thanh toán");
        setPmEditing(false);
        window.location.reload();
      } else if (result.error === "STALE_WRITE") {
        handleStale();
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* ── THANH TIÊU ĐỀ ────────────────────────────────────────────────────
          Danh tính + tổng tiền + hành động, trong MỘT hàng ở màn rộng và xếp
          chồng ở màn hẹp.

          Nút "Đổi trạng thái" trước đây nằm TRẦN ở đáy trang, dưới cả ghi chú và
          lịch sử — hành động chính của màn ở vị trí cuối cùng người ta cuộn tới.
          Nay nó nằm cạnh con số nó tác động tới. */}
      <header className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0">
            <h1 className="break-all font-mono text-lg font-bold text-foreground sm:text-xl">
              {order.code}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="whitespace-nowrap">
                {ORDER_TYPE_LABEL[order.type]}
              </Badge>
              <Badge
                className={`whitespace-nowrap ${STATUS_BADGE_CLASS[order.status]}`}
              >
                {ORDER_STATUS_LABEL[order.status]}
              </Badge>
              {badgeTraGop && (
                <Badge
                  className={`whitespace-nowrap ${
                    badgeTraGop.color === "emerald"
                      ? "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft"
                      : "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft"
                  }`}
                >
                  {badgeTraGop.label}
                </Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Tạo {formatDateTime(order.createdAt)}
              {order.center ? ` · ${order.center.name}` : ""}
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 lg:items-end lg:border-0 lg:pt-0">
            <div className="lg:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tổng đơn
              </p>
              {/* text-2xl là TRẦN cho số tiền (DESIGN.md §3): 955.563.000đ từng tràn
                  ra ngoài thẻ ở cỡ lớn hơn. */}
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground sm:text-2xl">
                {order.totalAmount.toLocaleString("vi-VN")} đ
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {hanhDongPhu}
              {canManage && nextOptions.length > 0 && (
                <Button onClick={() => setStatusModalOpen(true)}>
                  <ArrowRightLeft className="h-4 w-4" aria-hidden />
                  Đổi trạng thái
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── HAI CỘT ──────────────────────────────────────────────────────────
          Cột TRÁI đi theo ĐÚNG trình tự nghiệp vụ, chủ dự án chốt 14/09: còn
          thiếu bao nhiêu → bán cái gì → chia mấy đợt → in phiếu thu và QR. Khối
          QR đứng CUỐI vì nó là HỆ QUẢ của kế hoạch: đặt nó trước kế hoạch là mời
          người ta quét một mã dựng từ số tiền chưa chốt. Cột PHẢI là hồ sơ: ai
          mua, xuất hoá đơn cho ai, ghi chú, lịch sử.

          Trước bản này trang cao 1 cột và chốt `max-w-5xl`, nên ở màn 1531px hơn
          nửa bề ngang bỏ trống trong khi khối QR — công cụ thu tiền — nằm dưới cả
          ghi chú và lịch sử trạng thái.

          Thứ tự khi xếp chồng (dưới lg) CHÍNH LÀ thứ tự ưu tiên ở trên: cột trái
          trước, cột phải sau. Không cần đảo gì trên mobile. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-5 lg:space-y-6">
          {/* Công nợ — câu hỏi đầu tiên khi mở một đơn là "còn thiếu bao nhiêu". */}
          <OrderDebtSummary congNo={congNo} />

          {/* Sản phẩm */}
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Sản phẩm ({order.items.length})
              </h2>
              {/* Đơn NHIỀU CON phải tự khai ra là nó nhiều con. `order.student` để
                  trống ở đơn loại này (cố ý — không quy một đơn hai em về một em),
                  nên nếu không có nhãn đây thì trên đầu trang đơn trông y hệt đơn
                  "chưa gắn học viên", và người soát sẽ đi tìm cái không thiếu. */}
              {soHocVienTrenDon > 1 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <User className="h-3 w-3" aria-hidden />
                  {soHocVienTrenDon} học viên
                </span>
              )}
            </div>
            <PhanTrangBang cuonNgang>
              {/* Mật độ theo DESIGN.md §2: `whitespace-nowrap` trên CẢ th và td là
                  thứ duy nhất chặn chiều cao dòng nhảy loạn (đo trước đợt 11/08:
                  65–71px và không đều nhau). Riêng cột tên được phép xuống dòng —
                  nó là cột chữ duy nhất và tên khoá học tiếng Việt thì dài. */}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tên
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      SL
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Đơn giá
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Thành tiền
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.id} className="border-b border-border">
                      <td className="min-w-[12rem] px-3 py-3 align-top">
                        <div className="font-medium text-foreground">
                          {it.itemName}
                        </div>
                        {/* Dòng này mua cho CON NÀO. Với đơn một con nó là thừa vô
                            hại; với đơn hai con nó là thứ DUY NHẤT nối được số tiền
                            với đứa trẻ — hoàn tiền, chuyển lớp và nhắc nợ đều hỏi
                            đúng câu đó. */}
                        {it.student && (
                          <Link
                            href={`/students/${it.student.id}`}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-state-info-ink hover:underline"
                          >
                            <User className="h-3 w-3 shrink-0" aria-hidden />
                            {it.student.name}
                          </Link>
                        )}
                        {/* Hình thức lớp (SR.QD.219 Điều 5) — hiện ra vì nó GIẢI THÍCH đơn
                            giá: Coach 1-1 ×2,0 cao hơn giá niêm yết là hợp lệ, và không có
                            nhãn này thì người soát đơn chỉ thấy "bán đắt gấp đôi". */}
                        {(() => {
                          const ht = docHinhThucLop(it.metadata);
                          if (ht.coachFormat === "GROUP") return null;
                          return (
                            <span className="mt-1 inline-flex whitespace-nowrap rounded-md bg-state-info-soft px-2 py-0.5 text-xs font-semibold text-state-info-ink">
                              {NHAN_COACH[ht.coachFormat]}
                              {ht.soBuoi != null ? ` · ${ht.soBuoi} buổi` : ""}
                            </span>
                          );
                        })()}
                        {it.product && (
                          <Link
                            href={`/products/${it.product.id}`}
                            className="mt-1 block font-mono text-xs text-state-info-ink hover:underline"
                          >
                            → {it.product.sku}
                          </Link>
                        )}
                        {it.itemDescription && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {it.itemDescription}
                          </div>
                        )}
                        {/* TỪNG KHOẢN giảm kèm giải trình riêng — dấu vết thay cho cơ
                            chế duyệt đã gỡ 14/09/2026. Liệt kê ra chứ không gộp: ba ưu
                            đãi trên một dòng là ba chương trình khác nhau, và “giảm
                            740.000đ” không nói được đó là những chương trình nào.
                            Đơn CŨ (cột JSON rỗng) rơi về nhánh dưới, hiện y như trước. */}
                        {(() => {
                          const khoan = docKhoanGiam(it.discounts).filter((k) => k.giam > 0);
                          if (khoan.length > 0) {
                            return (
                              <ul className="mt-1 space-y-0.5">
                                {khoan.map((k, i) => (
                                  <li key={i} className="text-xs text-muted-foreground">
                                    <span className="font-medium text-state-danger-ink">
                                      −{k.giam.toLocaleString("vi-VN")}đ
                                      {k.phanTram != null ? " (" + k.phanTram + "%)" : ""}
                                    </span>
                                    {k.lyDo ? <> · {k.lyDo}</> : null}
                                  </li>
                                ))}
                              </ul>
                            );
                          }
                          return it.discountAmount > 0 && it.discountReason ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium text-state-danger-ink">Giảm giá:</span>{" "}
                              {it.discountReason}
                            </div>
                          ) : null;
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">
                        {it.quantity}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">
                        {it.unitPrice.toLocaleString("vi-VN")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right align-top font-medium tabular-nums">
                        {/* Dòng CÓ giảm riêng: hiện tạm tính gạch ngang → số sau giảm.
                            Chỉ in số cuối thì người soát không thấy khoản ưu đãi ở đâu
                            ra, mà đó đúng là con số phụ huynh sẽ hỏi. Đơn CŨ (giảm ở cấp
                            đơn, `Σ dòng = 0`) rơi vào nhánh dưới và hiện y như trước. */}
                        {it.discountAmount > 0 ? (
                          <>
                            <span className="block text-xs font-normal text-muted-foreground line-through">
                              {it.totalPrice.toLocaleString("vi-VN")}
                            </span>
                            {/* `discountPercent` chỉ có nghĩa khi dòng có ĐÚNG MỘT
                                khoản kiểu % — nhiều khoản thì "phần trăm của dòng"
                                không tồn tại như một con số, và in một tỉ lệ gần đúng
                                lên đây là in ra thứ không ai tính lại được. Chi tiết
                                từng khoản đã nằm ở cột Tên. */}
                            <span className="block text-xs font-normal text-state-danger-ink">
                              −{it.discountAmount.toLocaleString("vi-VN")}
                              {it.discountPercent != null ? ` (${it.discountPercent}%)` : ""}
                            </span>
                            {(it.totalPrice - it.discountAmount).toLocaleString("vi-VN")}
                          </>
                        ) : (
                          it.totalPrice.toLocaleString("vi-VN")
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-sm">
                  <tr>
                    <td
                      colSpan={3}
                      className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground"
                    >
                      Tạm tính:
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {order.subtotal.toLocaleString("vi-VN")}
                    </td>
                  </tr>
                  {order.discountAmount > 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-2 text-right text-muted-foreground"
                      >
                        {/* Đơn MỚI: tổng này = Σ giảm của các dòng (đã in ngay trên).
                            Đơn CŨ: giảm khai ở cấp đơn, `Σ dòng = 0` — nhãn đổi theo để
                            người đọc không đi tìm khoản giảm ở từng dòng mà không thấy. */}
                        {giamTheoDong > 0 ? "Tổng giảm (theo dòng)" : "Giảm giá"}
                        {/* Đơn CŨ tạo bằng mã khuyến mãi (hệ đã gỡ 03/08) vẫn hiện mã đã
                            dùng để đối soát lịch sử — không còn link tới màn voucher. */}
                        {order.voucherCode ? <> — mã {order.voucherCode}</> : null}:
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-state-danger-ink">
                        -{order.discountAmount.toLocaleString("vi-VN")}
                      </td>
                    </tr>
                  )}
                  {order.shippingFee > 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground"
                      >
                        Phí vận chuyển:
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {order.shippingFee.toLocaleString("vi-VN")}
                      </td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td
                      colSpan={3}
                      className="whitespace-nowrap px-3 py-2.5 text-right"
                    >
                      Tổng:
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      {order.totalAmount.toLocaleString("vi-VN")} đ
                    </td>
                  </tr>
                </tfoot>
              </table>
            </PhanTrangBang>
          </section>

          {/* ⚠️ ĐÃ GỠ [14/09/2026] — khối DUYỆT ĐƠN (giảm giá + kế hoạch thanh toán).
              Chủ dự án chốt bỏ cơ chế duyệt đơn hàng. Thay cho nó không phải khoảng
              trống: dấu vết giá + AuditLog ORDER_CREATED ghi ngay lúc tạo đơn
              (lib/orders/price-guard.ts), và khoá kế hoạch nay theo TIỀN chứ không
              theo cờ duyệt (lib/payments/plan-money-guard.ts). */}

          {/* ── MÃ QR LÊN TRƯỚC KẾ HOẠCH [15/09/2026] ─────────────────────────
              Chủ dự án: *"đưa phần mã QR lên trước phần kế hoạch thanh toán"*.

              Vì sao đúng: sau đợt này kế hoạch được lập NGAY ở trang tạo đơn, nên khi
              mở lại trang đơn thì việc của sale gần như luôn là XUẤT QR cho đợt kế
              tiếp — còn kế hoạch chỉ sửa khi khách đổi ý. Thứ dùng mỗi ngày phải đứng
              trên thứ dùng thỉnh thoảng.

              03/08 — QR xuất THEO TỪNG PHIẾU THU (đợt), thay cho 1 nút QR mức đơn.
              Đơn cũ chưa có phiếu thu nào → giữ nguyên khối QR mức đơn để không mất
              khả năng thu tiền. */}
          {paymentRequests.length > 0 ? (
            <PaymentRequestsSection
              requests={paymentRequests}
              initialSessions={qrSessions}
              canManage={canManage}
              // Cột kế hoạch — sổ DUY NHẤT biết tới tiền mặt. Không truyền thì bảng in
              // "Chờ thu · còn thiếu X" cho đợt sale đã thu xong và vẫn mở nút Xuất QR.
              daThuTay={Object.fromEntries(
                installments.filter((i) => i.status === "PAID").map((i) => [i.soDot, true]),
              )}
            />
          ) : (
            <OrderQrSection
              qrUrl={qrUrl}
              transferContent={transferContent}
              dueNow={dueNow}
            />
          )}

          {/* Kế hoạch thanh toán — ĐỨNG SAU khối QR từ 15/09/2026 (xem chú thích trên). */}
          <OrderInstallmentPlan
            orderId={order.id}
            totalAmount={order.totalAmount}
            canManage={canManage}
            installments={installments}
            accounting={accounting}
            // TRỤC B (`Payment.saleStatus = RECORDED`) — nguồn của mặc định ô "đã thu".
            // Phải là ĐÚNG con số mà `recordInstallmentPlan` đo khi gác; xem chú thích
            // ở `daThuTheoSo` trong `order-payment-section.tsx`.
            daThuTheoSo={congNo.daThu}
            // TIỀN THẬT đã rót về TỪNG PHIẾU — nguồn để KHOÁ đợt đã thu. Không suy từ
            // `OrderInstallment.status`: cột đó là kế hoạch, còn đây là sổ tiền.
            paymentRequests={paymentRequests}
          />
        </div>

        {/* ── CỘT PHẢI — hồ sơ đơn ────────────────────────────────────────────
            `lg:sticky lg:self-start` KHÔNG kèm `overflow-y-auto`: khối "Người mua
            trên hoá đơn" có chú thích ⓘ định vị tuyệt đối, và một khung cuộn sẽ
            cắt mất nó. Cột cao hơn màn hình thì cuộn theo trang như bình thường. */}
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-4 lg:self-start lg:space-y-6">
          <Khoi tieuDe="Thông tin khách hàng">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <O nhan="Tên">{order.customerName}</O>
              {/* Dạng NỘI ĐỊA `0930000015`, không phải `84930000015` như trong DB.
                  `canonicalPhone` cất dạng 84 vì đó là khoá đối chiếu; nhưng người
                  đọc ô này đang chuẩn bị BẤM SỐ ĐÓ gọi cho phụ huynh, và dạng 84 là
                  dạng không ai đọc to lên được. Cùng lý do đã đưa nội dung CK về
                  dạng nội địa (lib/payments/noi-dung-ck.ts). */}
              <O nhan="SĐT">{nationalPhone(order.customerPhone) ?? order.customerPhone}</O>
              <O nhan="Email">{order.customerEmail ?? "—"}</O>
              <O nhan="Địa chỉ">
                {[order.customerAddress, order.customerWard, order.customerCity]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </O>
              {order.student && (
                <O nhan="Học sinh">
                  <Link
                    href={`/students/${order.student.id}`}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    {order.student.name}
                  </Link>
                </O>
              )}
              {/* Đường VỀ lead — nửa còn lại của cặp liên kết (15/09/2026). Sale đi
                  lead → đơn để xuất QR, rồi cần quay lại lead để ghi nhật ký gọi.
                  Trước bản này đây là chữ trơ, và mũi tên một chiều là một nửa lời hứa. */}
              {order.lead && (
                <O nhan="Lead">
                  <Link
                    href={`/leads/${order.lead.id}`}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    {order.lead.parentName}
                  </Link>
                </O>
              )}
              {order.center && <O nhan="Trung tâm">{order.center.name}</O>}
            </dl>
          </Khoi>

          {/* Người mua trên hoá đơn — khối RIÊNG, xem chú thích trong component. */}
          <ThongTinHoaDon
            orderId={order.id}
            don={{
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              customerEmail: order.customerEmail,
              customerAddress: order.customerAddress,
              customerWard: order.customerWard,
              customerCity: order.customerCity,
              customerCccd: order.customerCccd,
              invoiceBuyerName: order.invoiceBuyerName,
              invoiceCompanyName: order.invoiceCompanyName,
              invoiceTaxCode: order.invoiceTaxCode,
              invoiceEmail: order.invoiceEmail,
            }}
            updatedAt={seenUpdatedAt}
            canManage={canManage}
          />

          {/* Phương thức thanh toán (G4 — nút "Sửa" khi đơn chưa xác nhận) */}
          <Khoi
            tieuDe="Phương thức thanh toán"
            hanhDong={
              canEditPaymentMethod && !pmEditing ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPmValue(order.paymentMethodId ?? "");
                    setPmEditing(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Thay đổi
                </Button>
              ) : undefined
            }
          >
            {pmEditing ? (
              <div className="space-y-2">
                <Select
                  items={pmItems}
                  value={pmValue}
                  onValueChange={(v) => setPmValue(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chọn phương thức" />
                  </SelectTrigger>
                  <SelectContent>
                    {usablePMs.map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>
                        {pm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {usablePMs.length === 0 && (
                  // Danh sách rỗng mà im lặng thì người dùng bấm mãi không hiểu. Ca thật:
                  // cơ sở của đơn chưa có phương thức nào hợp loại đơn này, hoặc phương
                  // thức riêng của cơ sở đã bị tắt.
                  <p className="text-xs text-state-warning-ink">
                    Cơ sở của đơn này chưa có phương thức thanh toán nào dùng được
                    cho loại đơn &ldquo;{order.type}&rdquo;. Khai thêm ở trang Cơ
                    sở → mục Thanh toán.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleSavePaymentMethod}
                    disabled={isPending || !pmValue}
                  >
                    {isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    )}
                    Lưu
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPmEditing(false)}
                    disabled={isPending}
                  >
                    Huỷ
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <O nhan="Phương thức">{order.paymentMethod?.name ?? "—"}</O>
                <O nhan="Mã GD ngân hàng">{order.bankReference ?? "—"}</O>
                <O nhan="Gateway txn ID">{order.gatewayTxnId ?? "—"}</O>
                <O nhan="Thanh toán lúc">
                  {order.paidAt ? formatDateTime(order.paidAt) : "—"}
                </O>
              </dl>
            )}
          </Khoi>

          <Khoi tieuDe="Ghi chú">
            <div className="space-y-3">
              {order.customerNote && (
                <div className="text-sm">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Ghi chú khách hàng
                  </div>
                  <div className="rounded-lg bg-state-warning-soft p-3 text-foreground">
                    {order.customerNote}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label
                  htmlFor="ghi-chu-noi-bo"
                  className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Ghi chú nội bộ
                </label>
                <Textarea
                  id="ghi-chu-noi-bo"
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={3}
                  disabled={!canManage}
                />
                {canManage && (
                  <Button
                    size="sm"
                    onClick={handleSaveNote}
                    disabled={isPending}
                    variant="outline"
                  >
                    {isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    )}
                    Lưu ghi chú
                  </Button>
                )}
              </div>
            </div>
          </Khoi>

          {/* Lịch sử trạng thái */}
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={historyOpen}
            >
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Lịch sử trạng thái ({order.history.length})
              </h2>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${
                  historyOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {historyOpen &&
              (order.history.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Chưa có thay đổi trạng thái
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {order.history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm"
                    >
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-state-info" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="whitespace-nowrap">
                            {ORDER_STATUS_LABEL[h.fromStatus]}
                          </Badge>
                          <span className="text-muted-foreground">→</span>
                          <Badge className="whitespace-nowrap">
                            {ORDER_STATUS_LABEL[h.toStatus]}
                          </Badge>
                        </div>
                        <div className="mt-1 break-words text-xs text-muted-foreground">
                          {h.changedByName} · {formatDateTime(h.createdAt)}
                        </div>
                        {h.reason && (
                          <div className="mt-1 break-words text-sm italic text-foreground">
                            &ldquo;{h.reason}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </section>
        </aside>
      </div>

      {/* Status change modal */}
      <Dialog
        open={statusModalOpen}
        onOpenChange={(o) => !isPending && setStatusModalOpen(o)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi trạng thái đơn hàng</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm">
              Hiện tại:{" "}
              <Badge variant="outline">{ORDER_STATUS_LABEL[order.status]}</Badge>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Chuyển sang:</label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as OrderStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái mới" />
                </SelectTrigger>
                <SelectContent>
                  {nextOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lý do (tuỳ chọn):</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatusModalOpen(false)}
              disabled={isPending}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={handleStatusChange}
              disabled={!newStatus || isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
