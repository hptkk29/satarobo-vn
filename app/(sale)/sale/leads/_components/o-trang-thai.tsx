"use client";

/**
 * Site Sale — ô "Trạng thái" của bảng Leads: vừa là NHÃN, vừa là chỗ đẩy bậc phễu.
 *
 * ── BẢN ĐÔI CỦA `StatusCell` trong `app/(admin)/admin/leads/_components/leads-table.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị.
 *
 * GIỮ NGUYÊN 100%: đủ 10 bậc `KANBAN_COLUMNS` đúng thứ tự, đúng nhãn; bậc rơi
 * (`LEAD_DROP_STATUSES`) vẫn hỏi lý do TRƯỚC khi ghi; thất bại vẫn nói ra bằng
 * toast và ô quay về trạng thái thật.
 *
 * ⚠️ QUYỀN GIỮ NGUYÊN: gác bằng `leads:change-status` (chỉ Tư vấn viên đẩy bậc),
 *    KHÔNG phải `leads:edit`. Thiếu quyền thì ô này chỉ còn là một cái nhãn.
 *    Ẩn điều khiển chỉ là tiện nghi — `updateLeadStatus` vẫn tự gác lại ở server.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bản admin nhuộm chính cái `<select>` bằng `LEAD_STATUS_BADGE` — mười màu
 *    Tailwind rời (`bg-sky-100`, `bg-emerald-100`…), đúng thứ `DESIGN.md §1` cấm
 *    và `lib/sale/ky-luat-mau.test.ts` canh. Nay màu đi qua thang NGỮ NGHĨA
 *    (`toneTrangThaiKhach`): chữ mang GIAI ĐOẠN, màu mang MỨC CẦN ĐỘNG TAY.
 * 2. `<select>` gốc của trình duyệt → `<Select>` của kho, để ô này không phải là
 *    thứ duy nhất trên màn do hệ điều hành vẽ.
 *
 * ⚠️ `value` chứ không `defaultValue`, và giá trị luôn lấy từ `trangThai` truyền
 *    vào: server TỪ CHỐI thì ô phải quay về trạng thái thật. Bản cũ dùng
 *    `defaultValue` + nuốt kết quả ⇒ ô hiện "Đã đăng ký" trong khi DB không đổi gì.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import { StatusPill } from "@/components/admin/ui/status-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KANBAN_COLUMNS, LEAD_DROP_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/status";
import { toneTrangThaiKhach } from "@/lib/sale/trang-thai-khach";
import { cn } from "@/lib/utils";
import { updateLeadStatus } from "@/app/(admin)/admin/leads/actions";
import { LyDoRotSale } from "./ly-do-rot";

export function NhanTrangThaiLead({ trangThai }: { trangThai: LeadStatus }) {
  return (
    <StatusPill tone={toneTrangThaiKhach(trangThai)}>
      {LEAD_STATUS_LABEL[trangThai]}
    </StatusPill>
  );
}

export function OTrangThaiLead({
  leadId,
  tenLead,
  trangThai,
  doiDuoc,
}: {
  leadId: string;
  tenLead: string;
  trangThai: LeadStatus;
  /** `leads:change-status`. `false` ⇒ chỉ là nhãn, không phải điều khiển. */
  doiDuoc: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  /** Bậc rơi đang chờ lý do. `null` = không có gì đang chờ. */
  const [choLyDo, setChoLyDo] = useState<LeadStatus | null>(null);

  function ghi(den: LeadStatus, lyDo?: string) {
    start(async () => {
      const res = await updateLeadStatus(leadId, den, lyDo);
      if (!res.ok) {
        // Cổng nghiệp vụ (R7-01) chặn CÓ lý do — nói đúng lý do cho tư vấn viên.
        toast.error(res.error ?? "Không đổi được trạng thái");
        return;
      }
      setChoLyDo(null);
      toast.success(`Đã chuyển sang "${LEAD_STATUS_LABEL[den]}"`);
      // ⚠️ KHÁC BẢN ADMIN, CÓ CHỦ ĐÍCH: action gọi `revalidatePath("/leads")` —
      // đường của khu quản trị. Màn này sống ở `/sale/leads` nên không nằm trong
      // vùng được làm mới, và nếu chỉ dựa vào revalidate thì bảng đứng im sau khi
      // đổi. `router.refresh()` là thứ kéo lại dữ liệu thật cho host Sale.
      router.refresh();
    });
  }

  if (!doiDuoc) return <NhanTrangThaiLead trangThai={trangThai} />;

  return (
    // Chặn nổi bọt: cả dòng bảng là một vùng bấm (mở ngăn chi tiết); bấm vào ô
    // này là để đổi bậc, không phải để mở ngăn.
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <LyDoRotSale
        status={choLyDo}
        tenLead={tenLead}
        dangGui={pending}
        onHuy={() => setChoLyDo(null)}
        onXacNhan={(lyDo) => choLyDo && ghi(choLyDo, lyDo)}
      />

      <Select
        value={trangThai}
        onValueChange={(v) => {
          if (v === null) return;
          const den = String(v) as LeadStatus;
          if (den === trangThai) return;
          // Bậc rơi phải kèm lý do — hỏi trước, ghi sau (server kiểm lại).
          if (LEAD_DROP_STATUSES.includes(den)) {
            setChoLyDo(den);
            return;
          }
          ghi(den);
        }}
      >
        <SelectTrigger
          size="sm"
          disabled={pending}
          aria-label={`Đổi trạng thái của ${tenLead}`}
          className={cn(
            "w-auto border-transparent bg-transparent pr-1 pl-0",
            "hover:border-border focus-visible:border-[color:var(--primary)]",
          )}
        >
          <SelectValue>
            {(v: string | null) => (
              <NhanTrangThaiLead trangThai={(v as LeadStatus | null) ?? trangThai} />
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80 min-w-[12rem]">
          {KANBAN_COLUMNS.map((s) => (
            <SelectItem key={s} value={s}>
              {LEAD_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pending ? (
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
