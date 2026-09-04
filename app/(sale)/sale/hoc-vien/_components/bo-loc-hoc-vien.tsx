"use client";

/**
 * Thanh lọc màn "Học viên" của site Sale.
 *
 * ── Bản đôi của gì, và khác chỗ nào ─────────────────────────────────────────
 * Nội dung lấy nguyên từ khối `<form method="GET">` trong
 * `app/(admin)/admin/students/page.tsx`: ĐÚNG bốn điều khiển, đúng thứ tự, đúng
 * từng chữ ("Tất cả trạng thái" · "Tất cả cơ sở" · "Tất cả lớp" · "Áp dụng").
 * Tồn tại riêng vì chủ dự án chốt 04/09/2026 tách bản site Sale khỏi khu quản trị.
 *
 * Chỉ CÁCH BÀY đổi, và đổi đúng hai thứ:
 *   1. `<select>` GỐC của trình duyệt → `<Select>` của kho. Bản admin trộn ba
 *      thứ tiếng trên một hàng (ô nhập bo góc theo kho, select do hệ điều hành
 *      vẽ, nút của kho); đó là dấu hiệu rõ nhất của giao diện chắp vá — cùng lỗi
 *      đã sửa ở `khach-cua-toi/_components/filters.tsx` ngày 28/08.
 *   2. Gửi biểu mẫu bằng ĐIỀU HƯỚNG CLIENT (`router.push` trong `useTransition`)
 *      thay vì nạp lại cả trang. Với full reload, trang cũ đứng yên vài giây
 *      không phản hồi gì nên người dùng bấm nút lần thứ hai (Lỗi 1 — QA 20/07).
 *      Bản admin `/classes` đã đi đường này từ lâu; `/students` thì chưa.
 *
 * ⚠️ ÁP DỤNG KHI BẤM NÚT, không áp dụng ngay khi đổi select — giữ đúng hành vi
 *    bản admin. Nút "Áp dụng" mà không áp dụng gì thì là nút trang trí.
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
import { SO_DONG_MAC_DINH } from "@/lib/ui/phan-trang";
import { NHAN_TRANG_THAI_HOC_VIEN } from "@/lib/sale/trang-thai-dao-tao";
import type { StudentStatus } from "@prisma/client";

/**
 * `<Select>` của kho không nhận giá trị rỗng làm một lựa chọn, nên "tất cả" phải
 * có mã riêng. Đặt ở đây một lần thay vì gõ chuỗi ma thuật ba chỗ.
 */
const TAT_CA = "__tat_ca__";

const LOP_O = cn(
  "h-9 rounded-lg border border-border bg-card text-sm",
  "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
);

export type ChonLoc = { value: string; label: string };

export function BoLocHocVien({
  view,
  soDong,
  q: qBanDau,
  status: statusBanDau,
  centerId: coSoBanDau,
  grade: khoiBanDau,
  coSo,
  trangThai,
  timDuocSdt,
}: {
  /** Tab vòng đời đang đứng; `"all"` thì không ghi vào URL. */
  view: string;
  /** Số dòng/trang đang chọn — phải mang theo, nếu không mỗi lần lọc lại về 20. */
  soDong: number;
  q: string;
  status: string;
  centerId: string;
  grade: string;
  coSo: ChonLoc[];
  /** Danh sách trạng thái hợp lệ, dựng ở server từ enum Prisma. */
  trangThai: StudentStatus[];
  /**
   * Ô tìm có quét cột SĐT không. Bản admin in MỘT câu gợi ý cho mọi người xem;
   * ở đây câu đó chỉ hiện khi nó ĐÚNG — người thiếu quyền xem SĐT mà được mời gõ
   * số sẽ tưởng hệ thống mất dữ liệu khách. Nợ #11 "search-oracle".
   */
  timDuocSdt: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(qBanDau);
  const [status, setStatus] = useState(statusBanDau);
  const [coSoChon, setCoSoChon] = useState(coSoBanDau);
  const [khoi, setKhoi] = useState(khoiBanDau);

  function apDung(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    // Thứ tự ghi giữ đúng bản admin để URL của hai site đọc giống nhau.
    if (soDong !== SO_DONG_MAC_DINH) p.set("size", String(soDong));
    if (view !== "all") p.set("view", view);
    if (q.trim()) p.set("q", q.trim());
    if (coSoChon) p.set("centerId", coSoChon);
    if (khoi) p.set("grade", khoi);
    // Lọc trạng thái chỉ có nghĩa ở tab "Tất cả" — các tab khác đã mã hoá trạng thái.
    if (view === "all" && status) p.set("status", status);
    // KHÔNG mang `page` sang: đổi bộ lọc thì trang 7 cũ hầu như không còn tồn tại,
    // và người dùng rơi vào một bảng trắng không hiểu vì sao.
    const qs = p.toString();
    start(() => router.push(qs ? `/sale/hoc-vien?${qs}` : "/sale/hoc-vien"));
  }

  return (
    <form onSubmit={apDung} className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[15rem] flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm học viên"
          placeholder={
            timDuocSdt
              ? "Tên / mã / phụ huynh / SĐT phụ huynh..."
              : "Tên / mã / phụ huynh..."
          }
          className={cn(LOP_O, "w-full pl-9 pr-3 placeholder:text-muted-foreground")}
        />
      </div>

      {view === "all" && (
        <Select
          value={status || TAT_CA}
          onValueChange={(v) => setStatus(v === null || v === TAT_CA ? "" : String(v))}
        >
          <SelectTrigger
            aria-label="Lọc theo trạng thái"
            className={cn(LOP_O, "w-auto min-w-[11rem]")}
            disabled={pending}
          >
            <SelectValue>
              {(v: string | null) =>
                v && v !== TAT_CA
                  ? (NHAN_TRANG_THAI_HOC_VIEN[v as StudentStatus] ?? String(v))
                  : "Tất cả trạng thái"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TAT_CA}>Tất cả trạng thái</SelectItem>
            {trangThai.map((s) => (
              <SelectItem key={s} value={s}>
                {NHAN_TRANG_THAI_HOC_VIEN[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={coSoChon || TAT_CA}
        onValueChange={(v) => setCoSoChon(v === null || v === TAT_CA ? "" : String(v))}
      >
        <SelectTrigger
          aria-label="Lọc theo cơ sở"
          className={cn(LOP_O, "w-auto min-w-[10.5rem]")}
          disabled={pending}
        >
          <SelectValue>
            {(v: string | null) =>
              (v && v !== TAT_CA ? coSo.find((c) => c.value === v)?.label : null) ??
              "Tất cả cơ sở"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TAT_CA}>Tất cả cơ sở</SelectItem>
          {coSo.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={khoi || TAT_CA}
        onValueChange={(v) => setKhoi(v === null || v === TAT_CA ? "" : String(v))}
      >
        <SelectTrigger
          aria-label="Lọc theo lớp"
          className={cn(LOP_O, "w-auto min-w-[8.5rem]")}
          disabled={pending}
        >
          <SelectValue>
            {(v: string | null) => (v && v !== TAT_CA ? `Lớp ${v}` : "Tất cả lớp")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TAT_CA}>Tất cả lớp</SelectItem>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
            <SelectItem key={g} value={String(g)}>
              Lớp {g}
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
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
          "disabled:opacity-50",
        )}
      >
        {pending ? "Đang lọc…" : "Áp dụng"}
      </button>
    </form>
  );
}
