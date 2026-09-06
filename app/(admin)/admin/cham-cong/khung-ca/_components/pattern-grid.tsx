"use client";

// Bảng khung ca tuần của MỘT khối: người × 7 thứ (T2 → CN).
//
// Vì sao viết lại: bản cũ xếp chồng bảng của mọi khối, mỗi ô là `<select>` cao 24px chỉ hiện mã
// trần, và một mã đã ngưng trong danh mục làm ô vẽ TRỐNG — người xếp lịch nhìn thấy "chưa xếp"
// rồi xếp đè lên lịch đang chạy. Nay mỗi khối là một thẻ riêng, ô cao 36px, và mã đã ngưng vẫn
// hiện kèm chữ "(đã ngưng)" thay vì biến mất.
//
// Hai điều dễ vỡ:
//  · Thứ nghỉ (`offDays`) do PAGE đọc từ cấu hình rồi truyền xuống dạng cờ — đừng viết `w === 1`
//    ở đây, ngày nghỉ tuần là tham số vận hành chứ không phải hằng số.
//  · `savePatternCellAction` ghi từng ô một, KHÔNG có hoàn tác: mỗi lần chọn là một vòng server
//    rồi `router.refresh()`. Ô đang chờ bị khoá để không bấm hai lần vào cùng một thứ.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { EmptyState } from "@/components/admin/ui/states";
import { BTN_OUTLINE, FIELD, PILL } from "@/components/admin/cham-cong/classes";
import { SectionCard } from "@/components/admin/cham-cong/section-card";
import { ShiftCodeChip } from "@/components/cham-cong/ui/shift-code-chip";
import { addPersonToBlockAction, savePatternCellAction } from "../_actions";

/** Mã ca dùng được cho ô. `isLeave` chỉ để in nhóm trong chú giải — tổng Công/tuần vẫn theo K-01. */
export type PatternCode = { code: string; name: string; timeLabel: string; isLeave: boolean };

export type PatternPerson = {
  userId: string;
  name: string;
  jobLabel: string | null;
  /** Tên trên file Sheet khi khác tên hệ thống — người đối chiếu file cần thấy. */
  sheetName: string | null;
  byWeekday: Record<number, string | null>;
};

export type PatternBlock = {
  centerId: string;
  label: string;
  canAssign: boolean;
  /** Thứ nghỉ tuần của khối (0 = CN … 6 = T7), từ `shift.weeklyOffDays`. */
  offDays: number[];
  people: PatternPerson[];
};

export type Candidate = { userId: string; label: string };

/** Thứ Hai đứng đầu tuần làm việc; 0 = Chủ Nhật đứng cuối (khớp `vnWeekday` và cột Sheet). */
const WD = [1, 2, 3, 4, 5, 6, 0];
const WD_LABEL: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN" };
const WD_FULL: Record<number, string> = {
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
  0: "Chủ Nhật",
};

/** K-01 (luật Sheet): mọi mã làm việc = 1 công, X/P = nghỉ. Cố ý KHÔNG suy từ `isLeave` — con số
 *  này phải khớp cột tổng của file Sheet mà kế toán đối chiếu. */
function congTuan(p: PatternPerson): number {
  return Object.values(p.byWeekday).filter((c) => !!c && c !== "X" && c !== "P").length;
}

export function PatternGrid({
  blocks,
  codes,
  candidates,
}: {
  blocks: PatternBlock[];
  codes: PatternCode[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [addUser, setAddUser] = useState<Record<string, string>>({});

  function doiO(block: PatternBlock, person: PatternPerson, weekday: number, code: string) {
    const key = `${block.centerId}-${person.userId}-${weekday}`;
    setBusy(key);
    start(async () => {
      const r = await savePatternCellAction({
        userId: person.userId,
        centerId: block.centerId,
        weekday,
        code: code || null,
        sheetName: person.sheetName ?? undefined,
        jobLabel: person.jobLabel ?? undefined,
      });
      setBusy(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        code
          ? `${person.name}: ${WD_FULL[weekday]} → ca ${code}`
          : `${person.name}: bỏ ca ${WD_FULL[weekday]}`,
      );
      router.refresh();
    });
  }

  function themNguoi(block: PatternBlock) {
    const userId = addUser[block.centerId];
    if (!userId) return;
    setBusy(`add:${block.centerId}`);
    start(async () => {
      const r = await addPersonToBlockAction({ userId, centerId: block.centerId });
      setBusy(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Hàng chỉ xuất hiện khi có ít nhất một ô — action đặt sẵn Thứ Hai = X (nghỉ).
      toast.success("Đã thêm vào khối — mặc định Thứ Hai nghỉ (X), chọn mã cho từng thứ");
      setAddUser((m) => ({ ...m, [block.centerId]: "" }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {codes.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Mã ca đang dùng</span>
          {codes.map((c) => (
            <span key={c.code} className="inline-flex items-center gap-1.5">
              <ShiftCodeChip code={c.code} size="sm" />
              {c.name}
              {c.timeLabel && <span className="tabular-nums">· {c.timeLabel}</span>}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Danh mục mã ca đang trống — khai mã ở tab <b>Mã ca</b> trước, chưa có mã thì không xếp được
          khung ca.
        </p>
      )}

      {blocks.map((b) => {
        const off = new Set(b.offDays);
        const dsThem = candidates.filter((c) => !b.people.some((p) => p.userId === c.userId));
        return (
          <SectionCard
            key={b.centerId}
            title={b.label}
            icon={CalendarRange}
            actions={
              b.canAssign ? (
                <>
                  <label htmlFor={`them-${b.centerId}`} className="sr-only">
                    Chọn nhân sự để thêm vào {b.label}
                  </label>
                  <select
                    id={`them-${b.centerId}`}
                    className={cn(FIELD, "max-w-[15rem]")}
                    value={addUser[b.centerId] ?? ""}
                    disabled={pending || dsThem.length === 0}
                    onChange={(e) => setAddUser((m) => ({ ...m, [b.centerId]: e.target.value }))}
                  >
                    <option value="">
                      {dsThem.length === 0 ? "Đã có đủ nhân sự" : "Thêm nhân sự vào khối…"}
                    </option>
                    {dsThem.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={BTN_OUTLINE}
                    disabled={!addUser[b.centerId] || pending}
                    onClick={() => themNguoi(b)}
                  >
                    <UserPlus aria-hidden className="h-4 w-4" />
                    Thêm
                  </button>
                </>
              ) : (
                <span
                  className={cn(PILL, "bg-muted text-muted-foreground")}
                  title="Sửa khung ca cần quyền hr_attendance:assign tại khối này"
                >
                  Chỉ xem
                </span>
              )
            }
          >
            {b.people.length === 0 ? (
              <EmptyState
                title={`${b.label} chưa có ai trong khung ca`}
                description={
                  b.canAssign
                    ? "Chọn nhân sự ở ô phía trên rồi bấm Thêm — sau đó chọn mã ca cho từng thứ."
                    : "Khối này chưa có lịch tuần cố định. Người xếp lịch của khối sẽ thêm nhân sự vào đây."
                }
              />
            ) : (
              <PhanTrangBang
                cuonNgang
                tenDonVi="người"
                khoaGhiNho={`khung-ca:${b.centerId}`}
                soDongMacDinh={20}
              >
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th scope="col" className={cn(adminTh, "px-3 py-2")}>
                        Nhân sự
                      </th>
                      {WD.map((w) => (
                        <th
                          key={w}
                          scope="col"
                          className={cn(adminTh, "px-1 py-2 text-center", off.has(w) && "bg-muted")}
                          title={off.has(w) ? `${WD_FULL[w]} — ngày nghỉ tuần của khối` : WD_FULL[w]}
                        >
                          {WD_LABEL[w]}
                        </th>
                      ))}
                      <th scope="col" className={cn(adminTh, "px-3 py-2 text-right")}>
                        Công/tuần
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {b.people.map((p) => (
                      <tr key={p.userId} className={adminTr}>
                        <td
                          className={cn(adminTd, "max-w-[15rem] truncate px-3 py-1.5 font-medium")}
                          title={[p.name, p.sheetName && p.sheetName !== p.name ? `Sheet: ${p.sheetName}` : null, p.jobLabel]
                            .filter(Boolean)
                            .join(" · ")}
                        >
                          {p.name}
                          {p.jobLabel && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">· {p.jobLabel}</span>
                          )}
                        </td>

                        {WD.map((w) => {
                          const cur = p.byWeekday[w] ?? "";
                          // `id`/`htmlFor` không mang dấu hai chấm: id hợp lệ nhưng làm vỡ mọi
                          // selector CSS/test viết tay sau này.
                          const key = `${b.centerId}-${p.userId}-${w}`;
                          const nhan = `Ca ${WD_FULL[w]} của ${p.name}`;
                          // Mã đã ngưng trong danh mục vẫn phải hiện: bỏ nó khỏi danh sách là ô
                          // vẽ trống và người xếp lịch tưởng thứ đó chưa có ca.
                          const laMaNgung = !!cur && !codes.some((c) => c.code === cur);
                          return (
                            <td
                              key={w}
                              className={cn("px-1 py-1.5 text-center", off.has(w) && "bg-muted")}
                            >
                              {b.canAssign ? (
                                <>
                                  <label htmlFor={key} className="sr-only">
                                    {nhan}
                                  </label>
                                  <select
                                    id={key}
                                    className={cn(FIELD, "w-[4.5rem] px-2 text-center font-mono")}
                                    value={cur}
                                    disabled={pending && busy === key}
                                    aria-busy={pending && busy === key ? true : undefined}
                                    title={
                                      cur
                                        ? `${nhan}: ${cur}${laMaNgung ? " (mã đã ngưng)" : ""}`
                                        : `${nhan}: chưa xếp`
                                    }
                                    onChange={(e) => doiO(b, p, w, e.target.value)}
                                  >
                                    <option value="">—</option>
                                    {laMaNgung && <option value={cur}>{cur} (đã ngưng)</option>}
                                    {codes.map((c) => (
                                      <option key={c.code} value={c.code}>
                                        {c.code}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <span className="inline-flex h-9 items-center justify-center" title={`${nhan}: chỉ xem`}>
                                  <ShiftCodeChip code={cur || null} size="sm" />
                                </span>
                              )}
                            </td>
                          );
                        })}

                        <td className={cn(adminTd, "px-3 py-1.5 text-right font-semibold tabular-nums")}>
                          {congTuan(p)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PhanTrangBang>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
