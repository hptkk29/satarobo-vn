"use client";

/**
 * Site Sale — thanh lọc màn "Leads".
 *
 * ── BẢN ĐÔI CỦA HAI KHỐI RỜI TRONG `app/(admin)/admin/leads/page.tsx` ───────
 *   · `FilterBar` (form GET: Tìm · Cơ sở · Sale · Nguồn · Từ ngày · Đến ngày)
 *   · ô chọn "Tất cả trạng thái" nằm LẠC trong `leads-table.tsx`
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%: đúng BẢY ô lọc, đúng nhãn, đúng chỗ-giữ-chỗ (kể cả
 * "vd: sata1, sale-form, quatang"), đúng hai nút "Lọc" / "Xoá lọc", và đúng điều
 * kiện quyền — hai ô "Cơ sở" và "Sale" CHỈ hiện cho người có `leads:view-all`.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. GỘP làm MỘT thanh. Bản admin để ô trạng thái nằm trong thân bảng, cách sáu ô
 *    kia một tầng — người dùng phải học rằng "bộ lọc ở hai chỗ".
 * 2. `<select>` gốc của trình duyệt → `<Select>` của kho (cùng lý do đã ghi ở
 *    `khach-cua-toi/_components/filters.tsx`: ô nhập bo góc đứng cạnh select do hệ
 *    điều hành vẽ là dấu hiệu rõ nhất của giao diện chắp vá).
 *
 * ⚠️ MỘT KHÁC BIỆT HÀNH VI, CÓ CHỦ ĐÍCH — và nó là bản VÁ, không phải bản sao.
 *    Form GET của bản admin không mang theo `status` (không có input ẩn nào cho
 *    nó), nên bấm "Lọc" sau khi đã chọn tab "Đã đăng ký" là ÂM THẦM bỏ mất bộ lọc
 *    trạng thái. Ở đây `status` được mang theo như sáu ô còn lại. Không ô lọc nào
 *    được thêm hay bớt — chỉ là cái đang có thôi tự bốc hơi.
 *
 * ⚠️ `view` và `size` LUÔN được giữ. Mất `view` là người đang xem Kanban bị đá về
 *    bảng mỗi lần lọc; mất `size` là mỗi lần lọc lại quay về 20 dòng.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KANBAN_COLUMNS, LEAD_STATUS_LABEL } from "@/lib/leads/status";
import { SO_DONG_MAC_DINH } from "@/lib/ui/phan-trang";
import type { MucLoc } from "@/lib/sale/leads";
import { cn } from "@/lib/utils";

/**
 * Giá trị ảo cho mục "tất cả". Chuỗi rỗng KHÔNG dùng được làm `value` của
 * `<SelectItem>` — nó là giá trị "chưa chọn gì" của chính điều khiển.
 */
const MOI_TRANG_THAI = "__moi_trang_thai__";
const MOI_CO_SO = "__moi_co_so__";
const MOI_SALE = "__moi_sale__";

/** Một bộ lớp vỏ cho mọi điều khiển — cùng chiều cao, cùng bo góc, cùng vòng focus. */
const LOP_DIEU_KHIEN = "h-9 rounded-lg bg-card text-sm";
const LOP_O_NHAP = cn(
  LOP_DIEU_KHIEN,
  "w-full border border-border px-3",
  "placeholder:text-muted-foreground",
  "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
);

function Nhan({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

export function BoLocLeads({
  cheDo,
  soDong,
  q,
  trangThai,
  coSoId,
  saleId,
  nguon,
  tuNgay,
  denNgay,
  danhSachCoSo,
  danhSachSale,
  xemTatCa,
  timDuocSdt,
}: {
  cheDo: "table" | "kanban";
  soDong: number;
  q: string;
  trangThai: string;
  coSoId: string;
  saleId: string;
  nguon: string;
  tuNgay: string;
  denNgay: string;
  danhSachCoSo: ReadonlyArray<MucLoc>;
  danhSachSale: ReadonlyArray<MucLoc>;
  /** `leads:view-all` — hai ô "Cơ sở" và "Sale" chỉ có nghĩa với vai này. */
  xemTatCa: boolean;
  /** Ô tìm có quét cột SĐT không — nói thẳng trong chỗ-giữ-chỗ (nợ #11). */
  timDuocSdt: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [oQ, setOQ] = useState(q);
  const [oTrangThai, setOTrangThai] = useState(trangThai || MOI_TRANG_THAI);
  const [oCoSo, setOCoSo] = useState(coSoId || MOI_CO_SO);
  const [oSale, setOSale] = useState(saleId || MOI_SALE);
  const [oNguon, setONguon] = useState(nguon);
  const [oTu, setOTu] = useState(tuNgay);
  const [oDen, setODen] = useState(denNgay);

  /** Hai khoá KHÔNG thuộc bộ lọc nhưng phải sống sót mọi lần lọc. */
  function nenTang(sp: URLSearchParams) {
    if (cheDo === "kanban") sp.set("view", "kanban");
    if (soDong !== SO_DONG_MAC_DINH) sp.set("size", String(soDong));
  }

  function apDung() {
    const sp = new URLSearchParams();
    nenTang(sp);
    if (oQ.trim()) sp.set("q", oQ.trim());
    // Chỉ mang `status` ở chế độ bảng: kanban hiện MỌI cột nên truy vấn bỏ qua vế
    // trạng thái (giữ nguyên hành vi bản admin). Mang theo một khoá không có tác
    // dụng là để lại một bộ lọc ma trên URL, bấm "Bảng" mới lòi ra.
    if (cheDo === "table" && oTrangThai !== MOI_TRANG_THAI) sp.set("status", oTrangThai);
    if (xemTatCa && oCoSo !== MOI_CO_SO) sp.set("centerId", oCoSo);
    if (xemTatCa && oSale !== MOI_SALE) sp.set("assignedToId", oSale);
    if (oNguon.trim()) sp.set("source", oNguon.trim());
    if (oTu) sp.set("dateFrom", oTu);
    if (oDen) sp.set("dateTo", oDen);
    // Đổi bộ lọc thì PHẢI về trang 1: trang 7 của bộ lọc cũ thường không tồn tại
    // trong bộ lọc mới, và người dùng rơi vào một bảng trắng không lý do.
    const qs = sp.toString();
    // `replace` chứ không `push`: lọc đi lọc lại mà đẩy vào lịch sử thì bấm Quay
    // lại phải bấm mười lần mới ra khỏi trang.
    start(() => router.replace(qs ? `/sale/leads?${qs}` : "/sale/leads", { scroll: false }));
  }

  function xoaLoc() {
    const sp = new URLSearchParams();
    nenTang(sp);
    const qs = sp.toString();
    start(() => router.replace(qs ? `/sale/leads?${qs}` : "/sale/leads", { scroll: false }));
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apDung();
      }}
    >
      <div className="min-w-[14rem] flex-1">
        <Nhan htmlFor="loc-lead-q">Tìm</Nhan>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="loc-lead-q"
            name="q"
            value={oQ}
            onChange={(e) => setOQ(e.target.value)}
            placeholder={timDuocSdt ? "Tên / SĐT / tên con" : "Tên / tên con"}
            className={cn(LOP_O_NHAP, "pl-9")}
          />
        </div>
      </div>

      {/* ⚠️ Ô này KHÔNG hiện ở chế độ Kanban — cố ý, và đây là chỗ dễ làm sai nhất
          khi gộp hai thanh lọc làm một. Bàn cờ vẽ ĐỦ mười cột nên truy vấn bỏ qua
          vế trạng thái; để ô lọc đứng đó là bày ra một điều khiển bấm vào không
          thấy gì đổi. Bản admin không gặp chuyện này chỉ vì ô nằm lẫn trong thân
          bảng, nên nó tự biến mất theo bảng. */}
      {cheDo === "table" ? (
        <div>
          <Nhan>Trạng thái</Nhan>
          <Select
            value={oTrangThai}
            onValueChange={(v) => v !== null && setOTrangThai(String(v))}
          >
            <SelectTrigger
              aria-label="Lọc theo trạng thái"
              disabled={pending}
              className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[11rem]")}
            >
              <SelectValue>
                {(v: string | null) =>
                  v && v !== MOI_TRANG_THAI
                    ? LEAD_STATUS_LABEL[v as LeadStatus]
                    : "Tất cả trạng thái"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={MOI_TRANG_THAI}>Tất cả trạng thái</SelectItem>
              {KANBAN_COLUMNS.map((s) => (
                <SelectItem key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {xemTatCa ? (
        <>
          <div>
            <Nhan>Cơ sở</Nhan>
            <Select value={oCoSo} onValueChange={(v) => v !== null && setOCoSo(String(v))}>
              <SelectTrigger
                aria-label="Lọc theo cơ sở"
                disabled={pending}
                className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[9rem]")}
              >
                <SelectValue>
                  {(v: string | null) =>
                    v && v !== MOI_CO_SO
                      ? (danhSachCoSo.find((c) => c.id === v)?.ten ?? "Tất cả")
                      : "Tất cả"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={MOI_CO_SO}>Tất cả</SelectItem>
                {danhSachCoSo.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.ten}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Nhan>Sale</Nhan>
            <Select value={oSale} onValueChange={(v) => v !== null && setOSale(String(v))}>
              <SelectTrigger
                aria-label="Lọc theo sale phụ trách"
                disabled={pending}
                className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[10rem] max-w-[16rem]")}
              >
                <SelectValue>
                  {(v: string | null) =>
                    v && v !== MOI_SALE
                      ? (danhSachSale.find((s) => s.id === v)?.ten ?? "Tất cả")
                      : "Tất cả"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80 min-w-[16rem]">
                <SelectItem value={MOI_SALE}>Tất cả</SelectItem>
                {danhSachSale.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.ten}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      <div className="w-36">
        <Nhan htmlFor="loc-lead-nguon">Nguồn</Nhan>
        <input
          id="loc-lead-nguon"
          name="source"
          value={oNguon}
          onChange={(e) => setONguon(e.target.value)}
          placeholder="vd: sata1, sale-form, quatang"
          className={LOP_O_NHAP}
        />
      </div>

      <div>
        <Nhan htmlFor="loc-lead-tu">Từ ngày</Nhan>
        <input
          id="loc-lead-tu"
          type="date"
          name="dateFrom"
          value={oTu}
          onChange={(e) => setOTu(e.target.value)}
          className={cn(LOP_O_NHAP, "w-auto")}
        />
      </div>

      <div>
        <Nhan htmlFor="loc-lead-den">Đến ngày</Nhan>
        <input
          id="loc-lead-den"
          type="date"
          name="dateTo"
          value={oDen}
          onChange={(e) => setODen(e.target.value)}
          className={cn(LOP_O_NHAP, "w-auto")}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "h-9 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
        )}
      >
        {pending ? "Đang lọc…" : "Lọc"}
      </button>

      <button
        type="button"
        onClick={xoaLoc}
        disabled={pending}
        className={cn(
          "h-9 shrink-0 rounded-lg border border-border bg-card px-3 text-sm font-medium",
          "text-muted-foreground transition-colors hover:bg-[color:var(--surface-chim)]",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[color:var(--primary)]/30 disabled:opacity-50",
        )}
      >
        Xoá lọc
      </button>
    </form>
  );
}
