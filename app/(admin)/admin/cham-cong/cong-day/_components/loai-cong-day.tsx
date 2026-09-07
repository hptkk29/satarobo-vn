"use client";

// Bảng danh mục LOẠI CÔNG DẠY — sửa hệ số và bật/tắt ngay tại chỗ.
//
// Vì sao đặt trên CHÍNH màn báo cáo chứ không tách sang tab Cấu hình: danh mục này chỉ có 6
// dòng cố định (nguồn × vai), và câu hỏi người dùng thật sự hỏi là "vì sao tháng này công dạy
// ra con số đó" — trả lời bằng cách bày hệ số ngay cạnh con số. Tách sang tab khác là bắt người
// ta nhớ hai chỗ để hiểu một số.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { BTN_OUTLINE, FIELD, PILL } from "@/components/admin/cham-cong/classes";
import { cn } from "@/lib/utils";
import { saveTeachingCreditTypeAction } from "../_actions";

export type LoaiRow = {
  code: string;
  name: string;
  basis: "PER_SESSION" | "PER_HOUR";
  factor: number;
  countsInPeriod: boolean;
  isActive: boolean;
  /** Số buổi thuộc loại này trong kỳ đang xem — để người sửa thấy ngay mình đang động vào gì. */
  buoiTrongKy: number;
};

const CELL = "h-9 px-2 py-1 text-sm";

export function LoaiCongDayTable({ rows, canEdit }: { rows: LoaiRow[]; canEdit: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <PhanTrangBang cuonNgang tenDonVi="loại" khoaGhiNho="loai-cong-day">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th scope="col" className={adminTh}>Loại công dạy</th>
              <th scope="col" className={adminTh}>Cách tính</th>
              <th scope="col" className={cn(adminTh, "text-right")}>Hệ số</th>
              <th scope="col" className={adminTh}>Cộng vào kỳ</th>
              <th scope="col" className={adminTh}>Đang dùng</th>
              <th scope="col" className={cn(adminTh, "text-right")}>Buổi trong kỳ</th>
              {canEdit && <th scope="col" className={cn(adminTh, "text-right")}>Hành động</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Dong key={r.code} row={r} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </PhanTrangBang>
    </div>
  );
}

function Dong({ row, canEdit }: { row: LoaiRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(row);

  const doi =
    draft.basis !== row.basis ||
    draft.factor !== row.factor ||
    draft.countsInPeriod !== row.countsInPeriod ||
    draft.isActive !== row.isActive;

  const luu = () =>
    start(async () => {
      const r = await saveTeachingCreditTypeAction({
        code: row.code,
        basis: draft.basis,
        factor: draft.factor,
        countsInPeriod: draft.countsInPeriod,
        isActive: draft.isActive,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã lưu “${row.name}” — số công dạy tính lại theo hệ số mới`);
      router.refresh();
    });

  return (
    <tr className={cn(adminTr, "h-11")}>
      <td className={cn(adminTd, "py-0 font-medium")}>
        {row.name}
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{row.code}</span>
      </td>
      <td className={cn(adminTd, "py-0")}>
        {canEdit ? (
          <select
            aria-label={`Cách tính của ${row.name}`}
            className={cn(FIELD, CELL, "w-32")}
            value={draft.basis}
            onChange={(e) => setDraft({ ...draft, basis: e.target.value as LoaiRow["basis"] })}
          >
            <option value="PER_SESSION">Theo buổi</option>
            <option value="PER_HOUR">Theo giờ</option>
          </select>
        ) : (
          <span className="text-muted-foreground">{row.basis === "PER_HOUR" ? "Theo giờ" : "Theo buổi"}</span>
        )}
      </td>
      <td className={cn(adminTd, "py-0 text-right")}>
        {canEdit ? (
          <input
            type="number"
            step="0.1"
            min={0}
            max={10}
            aria-label={`Hệ số của ${row.name}`}
            className={cn(FIELD, CELL, "w-20 text-right tabular-nums")}
            value={draft.factor}
            onChange={(e) => setDraft({ ...draft, factor: Number(e.target.value) })}
            onKeyDown={(e) => e.key === "Enter" && doi && luu()}
          />
        ) : (
          <span className="tabular-nums">{row.factor}</span>
        )}
      </td>
      <td className={cn(adminTd, "py-0")}>
        {canEdit ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={draft.countsInPeriod}
              onChange={(e) => setDraft({ ...draft, countsInPeriod: e.target.checked })}
            />
            Cộng
          </label>
        ) : draft.countsInPeriod ? (
          <span className={cn(PILL, "bg-state-success-soft text-state-success-ink")}>Có</span>
        ) : (
          <span className="text-xs text-muted-foreground">Chỉ theo dõi</span>
        )}
      </td>
      <td className={cn(adminTd, "py-0")}>
        {canEdit ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            Dùng
          </label>
        ) : draft.isActive ? (
          <span className="text-xs text-foreground">Đang dùng</span>
        ) : (
          <span className="text-xs text-muted-foreground">Đã tắt</span>
        )}
      </td>
      <td className={cn(adminTd, "py-0 text-right tabular-nums")}>
        {row.buoiTrongKy || <span className="text-muted-foreground">–</span>}
      </td>
      {canEdit && (
        <td className={cn(adminTd, "py-0 text-right")}>
          <button
            type="button"
            disabled={!doi || pending}
            onClick={luu}
            className={cn(BTN_OUTLINE, "h-8 px-3 text-xs")}
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
        </td>
      )}
    </tr>
  );
}
