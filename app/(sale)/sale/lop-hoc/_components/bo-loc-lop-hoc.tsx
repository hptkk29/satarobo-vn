"use client";

/**
 * Thanh lọc màn "Lớp học" của site Sale — bản đôi của
 * `app/(admin)/admin/classes/_components/class-filters.tsx` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng năm điều khiển, đúng thứ tự, đúng từng chữ: ô tìm "Tìm tên / mã lớp..." ·
 * "Mọi trạng thái" · "Tất cả cơ sở" · "Tất cả khoá" · "Tất cả GV" · nút
 * "Áp dụng bộ lọc" / "Đang lọc…". Cơ chế cũng giữ: điều hướng CLIENT trong
 * `useTransition` (bản admin đã đi đường này từ QA 20/07 — full reload làm người
 * dùng tưởng nút không ăn rồi bấm lần hai).
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 * Lưới 6 cột với nút chiếm trọn một hàng → một hàng `flex-wrap` nằm trong thanh
 * lọc của `KhungDuLieu`; `<select>` gốc của trình duyệt → `<Select>` của kho.
 * Bản admin trộn ba thứ tiếng trên một hàng (ô nhập của kho, select do hệ điều
 * hành vẽ, nút của kho) — cùng lỗi đã sửa ở màn "Khách của tôi" ngày 28/08.
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
import type { ChonLoc } from "@/lib/sale/du-lieu-lop-hoc";

/** `<Select>` của kho không nhận giá trị rỗng làm một lựa chọn. */
const TAT_CA = "__tat_ca__";

const LOP_O = cn(
  "h-9 rounded-lg border border-border bg-card text-sm",
  "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
);

/** Một ô chọn của thanh lọc — năm ô khác nhau đúng ở nhãn và danh sách. */
function OChon({
  nhan,
  giaTri,
  dat,
  chon,
  moiThu,
  rong,
  dang,
}: {
  nhan: string;
  giaTri: string;
  dat: (v: string) => void;
  chon: ChonLoc[];
  /** Nhãn của lựa chọn "không lọc gì" — giữ đúng câu chữ bản admin. */
  moiThu: string;
  rong: string;
  dang: boolean;
}) {
  return (
    <Select
      value={giaTri || TAT_CA}
      onValueChange={(v) => dat(v === null || v === TAT_CA ? "" : String(v))}
    >
      <SelectTrigger aria-label={nhan} className={cn(LOP_O, "w-auto", rong)} disabled={dang}>
        <SelectValue>
          {(v: string | null) =>
            (v && v !== TAT_CA ? chon.find((c) => c.value === v)?.label : null) ?? moiThu
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TAT_CA}>{moiThu}</SelectItem>
        {chon.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BoLocLopHoc({
  banDau,
  trangThai,
  coSo,
  khoa,
  giaoVien,
}: {
  banDau: {
    q?: string;
    status?: string;
    centerId?: string;
    courseId?: string;
    teacherId?: string;
  };
  trangThai: ChonLoc[];
  coSo: ChonLoc[];
  khoa: ChonLoc[];
  giaoVien: ChonLoc[];
}) {
  const router = useRouter();
  const [dang, start] = useTransition();
  const [q, setQ] = useState(banDau.q ?? "");
  const [status, setStatus] = useState(banDau.status ?? "");
  const [centerId, setCenterId] = useState(banDau.centerId ?? "");
  const [courseId, setCourseId] = useState(banDau.courseId ?? "");
  const [teacherId, setTeacherId] = useState(banDau.teacherId ?? "");

  function apDung(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (centerId) p.set("centerId", centerId);
    if (courseId) p.set("courseId", courseId);
    if (teacherId) p.set("teacherId", teacherId);
    const qs = p.toString();
    start(() => router.push(qs ? `/sale/lop-hoc?${qs}` : "/sale/lop-hoc"));
  }

  return (
    <form onSubmit={apDung} className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[14rem] flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm lớp"
          placeholder="Tìm tên / mã lớp..."
          className={cn(LOP_O, "w-full pl-9 pr-3 placeholder:text-muted-foreground")}
        />
      </div>

      <OChon
        nhan="Lọc theo trạng thái"
        giaTri={status}
        dat={setStatus}
        chon={trangThai}
        moiThu="Mọi trạng thái"
        rong="min-w-[10.5rem]"
        dang={dang}
      />
      <OChon
        nhan="Lọc theo cơ sở"
        giaTri={centerId}
        dat={setCenterId}
        chon={coSo}
        moiThu="Tất cả cơ sở"
        rong="min-w-[10rem]"
        dang={dang}
      />
      <OChon
        nhan="Lọc theo khoá học"
        giaTri={courseId}
        dat={setCourseId}
        chon={khoa}
        moiThu="Tất cả khoá"
        rong="min-w-[10rem]"
        dang={dang}
      />
      <OChon
        nhan="Lọc theo giáo viên"
        giaTri={teacherId}
        dat={setTeacherId}
        chon={giaoVien}
        moiThu="Tất cả GV"
        rong="min-w-[10rem]"
        dang={dang}
      />

      <button
        type="submit"
        disabled={dang}
        className={cn(
          "h-9 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          "hover:bg-[color:var(--primary-dark)]",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
          "disabled:opacity-50",
        )}
      >
        {dang ? "Đang lọc…" : "Áp dụng bộ lọc"}
      </button>
    </form>
  );
}
