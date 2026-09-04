"use client";

/**
 * Site Sale — thanh lọc + bảng của màn "Đơn hàng".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/orders/_components/orders-list-client.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%:
 *   · 5 điều khiển lọc, đúng thứ tự — Từ ngày · Đến ngày · Trạng thái · Loại ·
 *     ô tìm "Mã đơn / SĐT / Tên KH"; hai nút "Xoá" + "Áp dụng".
 *   · 8 cột, đúng thứ tự, đúng nhãn — Mã đơn · Khách hàng · Loại · Số tiền (VND) ·
 *     Phương thức · Trạng thái · Tạo lúc · Chi tiết.
 *   · Hành vi: đổi bộ lọc rồi bấm "Áp dụng"; nạp thêm bằng con trỏ trang
 *     ("Tải thêm", 20 dòng/lượt); toast "Lỗi tải đơn hàng"; dòng rỗng
 *     "Chưa có đơn hàng".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô → `.bang-sale` của `sale.css`. Mật độ nằm ở CSS thì
 *    bảng MỚI tự đúng; nằm trong từng ô thì phải nhớ chép.
 * 2. Thanh lọc rời trôi trên nền trang → `<KhungDuLieu.Loc>` (nền `--surface-chim`,
 *    nằm TRONG khung) — mắt đọc nó là "công cụ", không phải "dữ liệu".
 * 3. Nhãn trạng thái `<Badge className="bg-state-…">` gõ tay → `<StatusPill>` theo
 *    thang ngữ nghĩa (`lib/sale/trang-thai-don-hang.ts`). Bài kiểm
 *    `lib/sale/ky-luat-mau.test.ts` canh đúng chỗ này.
 * 4. Cột "Loại" bản admin là `<Badge variant="outline">` — một viền xám quanh một
 *    chữ, không mang màu nào. Đó là PHÂN LOẠI, không phải trạng thái; hệ thiết kế
 *    Sale để phân loại ở dạng chữ thường (DESIGN.md §1: viên thuốc là để đọc
 *    trạng thái, có viên thuốc ở khắp nơi thì hết ai nhìn viên nào). CHỮ giữ
 *    nguyên — vẫn là `ORDER_TYPE_LABEL[...]`.
 * 5. Cột tiền + cột "Tạo lúc" dùng `.o-so` → canh phải + chữ số đều bề ngang, cột
 *    thẳng hàng khi quét dọc. Đây là màn TIỀN nên đó không phải chuyện thẩm mỹ:
 *    số không thẳng hàng là số không so được bằng mắt.
 *
 * ⚠️ TIỀN: không có phép tính nào ở tệp này. `o.totalAmount` là số nguyên VND lấy
 *    thẳng từ `Order.totalAmount`, chỉ đi qua `toLocaleString("vi-VN")` — ĐÚNG như
 *    bản admin, không thêm hậu tố "đ" (đơn vị đã nằm trong tiêu đề cột "(VND)").
 */
import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { cn } from "@/lib/utils";
import {
  queryOrders,
  type OrderFilters,
  type OrderRow,
} from "@/app/(admin)/admin/orders/_actions";
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  deriveInstallmentBadge,
} from "@/lib/orders/status";
import type { OrderStatus, OrderType } from "@prisma/client";
import {
  MOI_LOAI_DON,
  MOI_TRANG_THAI_DON,
  toneTraGop,
  toneTrangThaiDon,
} from "@/lib/sale/trang-thai-don-hang";

/**
 * ⚠️ NỢ ĐÃ BIẾT — màn chi tiết đơn chưa có bản Sale.
 * `/orders/{id}` là clean URL host quản trị; trên host Sale nó bị viết lại thành
 * `/sale/orders/{id}` → 404. Giữ nguyên (bản mount cũ hỏng y hệt) thay vì trỏ bừa
 * sang một màn khác. Lý do đầy đủ ghi ở đầu `page.tsx`.
 */
const duongChiTiet = (id: string) => `/orders/${id}`;

/**
 * Giá trị ảo cho mục "tất cả": chuỗi rỗng KHÔNG dùng được làm `value` của
 * `<SelectItem>` — đó là giá trị "chưa chọn gì" của chính điều khiển.
 * Bản admin dùng chuỗi `"ALL"`; giữ nguyên ý nghĩa, đổi tên cho khỏi lẫn với
 * một giá trị enum thật.
 */
const MOI_TRANG_THAI = "__moi_trang_thai__";
const MOI_LOAI = "__moi_loai__";

/** Một bộ lớp vỏ cho mọi điều khiển — cùng chiều cao, cùng bo góc, cùng vòng focus. */
const LOP_DIEU_KHIEN = "h-9 rounded-lg bg-card text-sm";
const LOP_O_NHAP = cn(
  LOP_DIEU_KHIEN,
  "border border-border px-3",
  "placeholder:text-muted-foreground",
  "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
);

/**
 * Ngày + giờ. Chép NGUYÊN bộ tuỳ chọn của bản admin (`formatDateTime`) chứ KHÔNG
 * dùng `formatDateTimeVN` của `lib/format/date`: hàm dùng chung đó gọi
 * `toLocaleString("vi-VN")` trần ⇒ ra `"14:30:00 5/9/2026"` (giờ trước, có giây),
 * khác hẳn `"05/09/2026, 14:30"` mà người dùng màn này đang đọc. Đổi định dạng
 * ngày là đổi NỘI DUNG, đúng thứ đợt tách này không được phép làm.
 */
function ngayGio(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function DanhSachDonHang() {
  const [filters, setFilters] = useState<OrderFilters>({});
  const [pendingFilters, setPendingFilters] = useState<OrderFilters>({});
  const [items, setItems] = useState<OrderRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(
    (reset: boolean, cursorOverride?: string | null) => {
      const useCursor = reset ? null : (cursorOverride ?? cursor);
      startTransition(async () => {
        try {
          const result = await queryOrders(filters, useCursor);
          setItems((prev) => (reset ? result.items : [...prev, ...result.items]));
          setCursor(result.nextCursor);
          setHasMore(!!result.nextCursor);
        } catch {
          toast.error("Lỗi tải đơn hàng");
        }
      });
    },
    [filters, cursor],
  );

  useEffect(() => {
    setCursor(null);
    setItems([]);
    setHasMore(false);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function apDung() {
    setFilters(pendingFilters);
  }
  function xoaLoc() {
    setPendingFilters({});
    setFilters({});
  }

  const trangThai = pendingFilters.status ?? MOI_TRANG_THAI;
  const loai = pendingFilters.type ?? MOI_LOAI;

  return (
    <>
      <KhungDuLieu.Loc>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apDung();
          }}
        >
          <input
            type="date"
            aria-label="Từ ngày"
            placeholder="Từ ngày"
            value={pendingFilters.dateFrom ?? ""}
            onChange={(e) =>
              setPendingFilters({
                ...pendingFilters,
                dateFrom: e.target.value || undefined,
              })
            }
            className={cn(LOP_O_NHAP, "w-[9.5rem]")}
          />
          <input
            type="date"
            aria-label="Đến ngày"
            placeholder="Đến ngày"
            value={pendingFilters.dateTo ?? ""}
            onChange={(e) =>
              setPendingFilters({
                ...pendingFilters,
                dateTo: e.target.value || undefined,
              })
            }
            className={cn(LOP_O_NHAP, "w-[9.5rem]")}
          />

          <Select
            value={trangThai}
            onValueChange={(v) =>
              setPendingFilters({
                ...pendingFilters,
                status:
                  v === null || v === MOI_TRANG_THAI ? undefined : (String(v) as OrderStatus),
              })
            }
          >
            <SelectTrigger
              aria-label="Lọc theo trạng thái"
              className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[11rem]")}
            >
              <SelectValue>
                {(v: string | null) =>
                  v && v !== MOI_TRANG_THAI
                    ? ORDER_STATUS_LABEL[v as OrderStatus]
                    : "Tất cả trạng thái"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={MOI_TRANG_THAI}>Tất cả trạng thái</SelectItem>
              {MOI_TRANG_THAI_DON.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={loai}
            onValueChange={(v) =>
              setPendingFilters({
                ...pendingFilters,
                type: v === null || v === MOI_LOAI ? undefined : (String(v) as OrderType),
              })
            }
          >
            <SelectTrigger
              aria-label="Lọc theo loại"
              className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[10rem]")}
            >
              <SelectValue>
                {(v: string | null) =>
                  v && v !== MOI_LOAI ? ORDER_TYPE_LABEL[v as OrderType] : "Tất cả loại"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={MOI_LOAI}>Tất cả loại</SelectItem>
              {MOI_LOAI_DON.map((t) => (
                <SelectItem key={t} value={t}>
                  {ORDER_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Ô tìm: biểu tượng nằm TRONG ô, không đứng cạnh làm một nút giả. */}
          <div className="relative min-w-[15rem] flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              aria-label="Tìm đơn hàng"
              placeholder="Mã đơn / SĐT / Tên KH"
              value={pendingFilters.search ?? ""}
              onChange={(e) =>
                setPendingFilters({
                  ...pendingFilters,
                  search: e.target.value || undefined,
                })
              }
              className={cn(LOP_O_NHAP, "w-full pl-9")}
            />
          </div>

          <button
            type="button"
            onClick={xoaLoc}
            className={cn(
              "h-9 shrink-0 rounded-lg border border-border bg-card px-4 text-sm font-medium",
              "text-foreground transition-colors hover:bg-[color:var(--surface-chim)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
            )}
          >
            Xoá
          </button>
          <button
            type="submit"
            disabled={isPending}
            className={cn(
              "h-9 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
              "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
              "hover:bg-[color:var(--primary-dark)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
              "disabled:opacity-50",
            )}
          >
            Áp dụng
          </button>
        </form>
      </KhungDuLieu.Loc>

      {items.length === 0 && !isPending ? (
        // `operate.md`: màn rỗng nói ĐANG Ở ĐÂU chứ không chỉ "không có gì".
        <KhungDuLieu.Rong
          ten="Chưa có đơn hàng"
          mo="Không có đơn nào khớp bộ lọc đang đặt. Bấm “Xoá” để bỏ bộ lọc và xem lại toàn bộ."
        />
      ) : (
        <PhanTrangBang tenDonVi="đơn hàng" khoaGhiNho="sale-don-hang" cuonNgang>
          <table className="bang-sale">
            <thead>
              <tr>
                <th scope="col">Mã đơn</th>
                <th scope="col">Khách hàng</th>
                <th scope="col">Loại</th>
                <th scope="col" className="o-so">
                  Số tiền (VND)
                </th>
                <th scope="col">Phương thức</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" className="o-so">
                  Tạo lúc
                </th>
                <th scope="col" className="o-so">
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const traGop = deriveInstallmentBadge(o.installments);
                return (
                  <tr key={o.id}>
                    <td className="font-mono">{o.code}</td>
                    <td>
                      <span className="block font-medium text-foreground">{o.customerName}</span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {o.customerPhone}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{ORDER_TYPE_LABEL[o.type]}</td>
                    <td className="o-so font-medium">{o.totalAmount.toLocaleString("vi-VN")}</td>
                    <td className="text-foreground">{o.paymentMethod?.name ?? "—"}</td>
                    <td>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <StatusPill tone={toneTrangThaiDon(o.status)}>
                          {ORDER_STATUS_LABEL[o.status]}
                        </StatusPill>
                        {traGop ? (
                          <StatusPill tone={toneTraGop(traGop.color)}>{traGop.label}</StatusPill>
                        ) : null}
                      </span>
                    </td>
                    <td className="o-so text-xs text-muted-foreground">{ngayGio(o.createdAt)}</td>
                    <td className="o-so">
                      <Link
                        href={duongChiTiet(o.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-[color:var(--surface-chim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30"
                      >
                        <Eye aria-hidden="true" className="size-3.5" />
                        Xem
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PhanTrangBang>
      )}

      {(hasMore || isPending) && (
        <KhungDuLieu.Chan>
          <div className="flex justify-center">
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Đang tải...
              </span>
            ) : hasMore ? (
              <button
                type="button"
                onClick={() => load(false)}
                disabled={isPending}
                className={cn(
                  "h-8 rounded-lg border border-border bg-card px-3 text-xs font-medium",
                  "text-foreground transition-colors hover:bg-[color:var(--surface-chim)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
                  "disabled:opacity-50",
                )}
              >
                Tải thêm
              </button>
            ) : null}
          </div>
        </KhungDuLieu.Chan>
      )}
    </>
  );
}
