"use client";

/**
 * Site Sale — thanh lọc màn "Đăng ký học".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/enrollments/page.tsx` (khối `<form method="GET">`) ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%: bốn điều khiển, đúng thứ tự, đúng câu chữ — kể cả
 * "Đang hoạt động (mặc định)" và nhãn nút "Áp dụng bộ lọc".
 *
 * ── ĐỔI CÁCH BÀY, KHÔNG ĐỔI HÀNH VI ─────────────────────────────────────────
 * 1. `<select>` GỐC của trình duyệt → `<Select>` của kho. Lý do đã ghi ở
 *    `khach-cua-toi/_components/filters.tsx`: ô nhập bo góc theo tông kho đứng
 *    cạnh select do hệ điều hành vẽ là dấu hiệu rõ nhất của giao diện chắp vá.
 * 2. Lưới `grid-cols-5` + nút chiếm trọn một hàng → một hàng `flex-wrap`, ô tìm
 *    co giãn, nút đứng cuối. Bản admin bắt nút "Áp dụng bộ lọc" ăn nguyên một
 *    hàng ngang 100% bề rộng — nút hành động phụ mà to hơn mọi thứ quanh nó.
 *
 * ⚠️ VẪN LÀ "ĐỔI RỒI BẤM ÁP DỤNG", KHÔNG tự áp dụng khi đổi select — cố ý.
 *    Người dùng màn này thường đặt cả lớp + cơ sở + trạng thái rồi mới xem; tự
 *    áp dụng là ba lần tải lại trang cho một lần lọc. Đây cũng đúng hành vi bản
 *    admin, nên người quen màn cũ không phải học lại.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LOC_DANG_HOAT_DONG, MUC_LOC_TRANG_THAI } from "@/lib/sale/trang-thai-dang-ky";

/**
 * Giá trị ảo cho mục "tất cả". Chuỗi rỗng KHÔNG dùng được làm `value` của
 * `<SelectItem>` — nó là giá trị "chưa chọn gì" của chính điều khiển.
 */
const MOI_LOP = "__moi_lop__";
const MOI_CO_SO = "__moi_co_so__";

/** Một bộ lớp vỏ cho cả ba điều khiển — cùng chiều cao, cùng bo góc, cùng vòng focus. */
const LOP_DIEU_KHIEN = "h-9 rounded-lg bg-card text-sm";

export function BoLocDangKyHoc({
  q,
  trangThai,
  lopId,
  coSoId,
  danhSachLop,
  danhSachCoSo,
  timDuocSdt,
}: {
  q: string;
  trangThai: string;
  lopId: string;
  coSoId: string;
  danhSachLop: ReadonlyArray<{ id: string; ten: string; ma: string | null }>;
  danhSachCoSo: ReadonlyArray<{ id: string; ten: string }>;
  /** Ô tìm có quét cột SĐT không — nói thẳng trong placeholder (S-1). */
  timDuocSdt: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nhap, setNhap] = useState(q);
  const [tt, setTt] = useState(trangThai || LOC_DANG_HOAT_DONG);
  const [lop, setLop] = useState(lopId || MOI_LOP);
  const [cs, setCs] = useState(coSoId || MOI_CO_SO);

  function apDung() {
    const sp = new URLSearchParams();
    if (nhap.trim()) sp.set("q", nhap.trim());
    if (tt && tt !== LOC_DANG_HOAT_DONG) sp.set("status", tt);
    if (lop !== MOI_LOP) sp.set("classId", lop);
    if (cs !== MOI_CO_SO) sp.set("centerId", cs);
    const qs = sp.toString();
    // `replace` chứ không `push`: lọc đi lọc lại mà đẩy vào lịch sử thì bấm Quay
    // lại phải bấm mười lần mới ra khỏi trang.
    start(() => router.replace(qs ? `/sale/dang-ky-hoc?${qs}` : "/sale/dang-ky-hoc"));
  }

  const tenLop = (id: string) => {
    const c = danhSachLop.find((x) => x.id === id);
    if (!c) return "Tất cả lớp";
    return c.ma ? `${c.ma} · ${c.ten}` : c.ten;
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apDung();
      }}
    >
      {/* Ô tìm: biểu tượng nằm TRONG ô, không đứng cạnh làm một nút giả. */}
      <div className="relative min-w-[16rem] flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          name="q"
          value={nhap}
          onChange={(e) => setNhap(e.target.value)}
          aria-label="Tìm đăng ký học"
          placeholder={
            timDuocSdt
              ? "Tìm HS / SĐT PH / tên lớp / mã lớp..."
              : "Tìm HS / tên lớp / mã lớp..."
          }
          className={cn(
            LOP_DIEU_KHIEN,
            "w-full border border-border pl-9 pr-3",
            "placeholder:text-muted-foreground",
            "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
          )}
        />
      </div>

      <Select
        value={tt}
        onValueChange={(v) => {
          if (v !== null) setTt(String(v));
        }}
      >
        <SelectTrigger
          aria-label="Lọc theo trạng thái"
          className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[13rem]")}
          disabled={pending}
        >
          <SelectValue>
            {(v: string | null) =>
              MUC_LOC_TRANG_THAI.find((m) => m.value === v)?.label ??
              MUC_LOC_TRANG_THAI[0].label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {MUC_LOC_TRANG_THAI.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={lop}
        onValueChange={(v) => {
          if (v !== null) setLop(String(v));
        }}
      >
        <SelectTrigger
          aria-label="Lọc theo lớp"
          className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[11rem] max-w-[18rem]")}
          disabled={pending}
        >
          <SelectValue>
            {(v: string | null) => (v && v !== MOI_LOP ? tenLop(String(v)) : "Tất cả lớp")}
          </SelectValue>
        </SelectTrigger>
        {/* 200 lớp là trần truy vấn — danh sách PHẢI tự cuộn, không đẩy dài trang.
            `min-w` rộng hơn nút: bề rộng popup mặc định bám bề rộng nút
            (`w-(--anchor-width)`), mà "MÃ LỚP · Tên lớp" dài hơn nút rất nhiều nên
            sẽ bị cắt cụt ngay chỗ người dùng cần đọc để chọn. */}
        <SelectContent className="max-h-80 min-w-[22rem]">
          <SelectItem value={MOI_LOP}>Tất cả lớp</SelectItem>
          {danhSachLop.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.ma ? `${c.ma} · ${c.ten}` : c.ten}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={cs}
        onValueChange={(v) => {
          if (v !== null) setCs(String(v));
        }}
      >
        <SelectTrigger
          aria-label="Lọc theo cơ sở"
          className={cn(LOP_DIEU_KHIEN, "w-auto min-w-[10rem]")}
          disabled={pending}
        >
          <SelectValue>
            {(v: string | null) =>
              v && v !== MOI_CO_SO
                ? (danhSachCoSo.find((x) => x.id === v)?.ten ?? "Tất cả cơ sở")
                : "Tất cả cơ sở"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={MOI_CO_SO}>Tất cả cơ sở</SelectItem>
          {danhSachCoSo.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.ten}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "h-9 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          "hover:bg-[color:var(--primary-dark)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
          "disabled:opacity-50",
        )}
      >
        {pending ? "Đang lọc…" : "Áp dụng bộ lọc"}
      </button>
    </form>
  );
}
