"use client";

/**
 * Site Sale — ô chọn học viên của màn "Học bạ".
 *
 * ── BẢN ĐÔI CỦA khối `<form method="get">` trong `app/(admin)/admin/hoc-ba/page.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%: một ô chọn học viên (nhãn rỗng "— Chọn học viên —", tên kèm
 * mã trong ngoặc) + nút "Xem". Không thêm bộ lọc nào.
 *
 * ── ĐỔI CÁCH BÀY, KHÔNG ĐỔI HÀNH VI ─────────────────────────────────────────
 * 1. `<select>` GỐC của trình duyệt → `<Select>` của kho, cùng lý do đã ghi ở
 *    `khach-cua-toi/_components/filters.tsx`: một ô do hệ điều hành vẽ đứng cạnh
 *    các ô bo góc theo tông kho là dấu hiệu rõ nhất của giao diện chắp vá.
 * 2. Vẫn là "chọn rồi bấm Xem", KHÔNG tự nhảy khi đổi lựa chọn — giữ đúng hành
 *    vi bản admin: mỗi lần đổi là một lần dựng lại trọn học bạ, tự chạy khi người
 *    dùng còn đang cuộn tìm tên là tải nặng cho một cú chạm nhầm.
 *
 * ⚠️ ĐIỀU HƯỚNG BẰNG `/sale/hoc-ba`, KHÔNG phải form GET về chính trang. Bản
 *    admin cố ý dùng `method="get"` không `action` để đúng ở cả `/hoc-ba` lẫn
 *    `/admin/hoc-ba`. Trên host Sale trang thật là `/sale/hoc-ba`; đi thẳng đường
 *    thật thì thanh địa chỉ và mục điều hướng đang sáng đều đúng.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { MucChonHocVien } from "@/lib/sale/hoc-ba";

/** Giá trị ảo cho mục "chưa chọn": chuỗi rỗng là giá trị "chưa chọn gì" của chính điều khiển. */
const CHUA_CHON = "__chua_chon__";

export function ChonHocVien({
  danhSach,
  dangChon,
}: {
  danhSach: MucChonHocVien[];
  dangChon: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chon, setChon] = useState(dangChon || CHUA_CHON);

  const nhan = (id: string) => {
    const hv = danhSach.find((x) => x.id === id);
    if (!hv) return "— Chọn học viên —";
    return hv.ma ? `${hv.ten} (${hv.ma})` : hv.ten;
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(() =>
          router.replace(
            chon === CHUA_CHON ? "/sale/hoc-ba" : `/sale/hoc-ba?studentId=${chon}`,
          ),
        );
      }}
    >
      <Select
        value={chon}
        onValueChange={(v) => {
          if (v !== null) setChon(String(v));
        }}
      >
        <SelectTrigger
          aria-label="Chọn học viên"
          className="h-9 w-auto min-w-[18rem] max-w-[26rem] rounded-lg bg-card text-sm"
          disabled={pending}
        >
          <SelectValue>
            {(v: string | null) =>
              v && v !== CHUA_CHON ? nhan(String(v)) : "— Chọn học viên —"
            }
          </SelectValue>
        </SelectTrigger>
        {/* 500 học viên là trần truy vấn — danh sách PHẢI tự cuộn, không đẩy dài trang. */}
        <SelectContent className="max-h-80 min-w-[22rem]">
          <SelectItem value={CHUA_CHON}>— Chọn học viên —</SelectItem>
          {danhSach.map((hv) => (
            <SelectItem key={hv.id} value={hv.id}>
              {hv.ma ? `${hv.ten} (${hv.ma})` : hv.ten}
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
          "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
        )}
      >
        {pending ? "Đang mở…" : "Xem"}
      </button>
    </form>
  );
}
