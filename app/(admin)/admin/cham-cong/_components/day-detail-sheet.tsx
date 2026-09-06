"use client";

// app/(admin)/admin/cham-cong/_components/day-detail-sheet.tsx — chi tiết MỘT người trong MỘT ngày.
//
// Vì sao file này tồn tại: bản cũ (`override-cell.tsx`) nhét ô nhập công + ô lý do + 3 nút vào đúng
// một ô bảng rộng ~90px, nên người rà phải gõ lý do trong một ô 40 ký tự và KHÔNG nhìn thấy thứ
// dùng để quyết định — các lượt quét trong ngày. Ở đây bấm TÊN mở panel: lượt quét, giờ, công máy
// tính, rồi mới đến ô ghi đè.
//
// Điều dễ vỡ:
//  · Mọi thứ hiển thị đã được ĐỊNH DẠNG Ở SERVER (giờ +07, "7h29"). RSC không truyền hàm sang
//    client được, nên đừng chuyển sang nhận `Date` rồi format ở đây — giờ sẽ ra theo múi của máy
//    người xem, không phải giờ VN.
//  · `setDayOverrideAction` tự kiểm quyền `hr_attendance:adjust` tại cơ sở CỦA NGÀY ĐÓ và từ chối
//    khi ngày chưa được tính. `canAdjust`/`locked`/`computed` ở đây chỉ để giấu form cho đỡ vô ích.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FlagList } from "@/components/cham-cong/ui/flag-chip";
import { ShiftCodeChip, type ShiftSource } from "@/components/cham-cong/ui/shift-code-chip";
import { DayTypePill, type DayType } from "@/components/cham-cong/ui/day-type-pill";
import { BTN_OUTLINE, BTN_PRIMARY, FIELD } from "@/components/admin/cham-cong/classes";
import { cn } from "@/lib/utils";
import { setDayOverrideAction } from "../_actions";

export type DayTap = {
  /** "08:02" — giờ VN, đã format ở server. */
  time: string;
  dir: "IN" | "OUT";
  flags: string[];
};

export type DayRow = {
  userId: string;
  name: string;
  code: string | null;
  source?: ShiftSource;
  dayType: DayType | null;
  taps: DayTap[];
  /** "7h29" / "8h00" — đã format ở server. */
  worked: string;
  expected: string;
  credit: number | null;
  engineCredit: number | null;
  override: boolean;
  overrideNote: string | null;
  computed: boolean;
  flags: string[];
  /** "YYYY-MM-DD" — khoá ghi của Server Action. */
  workDate: string;
  /** "T4 09/09/2026". */
  dateLabel: string;
  /** Tên khối chịu công ngày đó — in trong câu thiếu quyền. */
  blockLabel: string;
};

export function DayDetailSheet({
  row,
  canAdjust,
  locked,
  kyHref,
}: {
  row: DayRow;
  canAdjust: boolean;
  locked: boolean;
  /** Đường sang màn Kỳ công của đúng kỳ/khối đang xem. */
  kyHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [units, setUnits] = useState(row.credit != null ? String(row.credit) : "");
  const [reason, setReason] = useState(row.overrideNote ?? "");

  const save = (value: number | null) =>
    start(async () => {
      const r = await setDayOverrideAction({
        userId: row.userId,
        workDate: row.workDate,
        units: value,
        note: value == null ? null : reason,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(value == null ? "Đã bỏ ghi đè" : "Đã ghi đè công");
      setOpen(false);
      router.refresh();
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={`Chi tiết ${row.name}`}
        className="block max-w-[15rem] truncate text-left font-medium text-foreground transition-colors hover:underline"
        title={row.name}
      >
        {row.name}
      </SheetTrigger>

      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row.name}</SheetTitle>
          <SheetDescription>
            {row.dateLabel} · {row.blockLabel}
          </SheetDescription>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ShiftCodeChip code={row.code} source={row.source} size="sm" />
            <DayTypePill type={row.dayType} />
            <FlagList codes={row.flags} max={4} />
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Lượt quét trong ngày
            </h3>
            {row.taps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Không có lượt quét nào được nhận. Công vẫn đếm theo ca đã xếp — lượt quét chỉ sinh
                cờ để quản lý rà.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {row.taps.map((t, i) => (
                  <li key={`${t.time}-${t.dir}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono tabular-nums text-foreground">{t.time}</span>
                    <span className="text-muted-foreground">{t.dir === "IN" ? "Vào" : "Ra"}</span>
                    <FlagList codes={t.flags} max={2} />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Công của ngày
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Giờ làm / kế hoạch</dt>
              <dd className="text-right font-medium tabular-nums text-foreground">
                {row.worked} / {row.expected}
              </dd>
              <dt className="text-muted-foreground">Máy tính</dt>
              <dd className="text-right font-medium tabular-nums text-foreground">
                {row.engineCredit ?? "—"}
              </dd>
              <dt className="text-muted-foreground">Công ghi nhận</dt>
              <dd className="text-right font-semibold tabular-nums text-foreground">
                {row.credit ?? "Chờ tính"}
              </dd>
              {row.override && (
                <>
                  <dt className="text-muted-foreground">Lý do ghi đè</dt>
                  <dd className="text-right text-foreground">{row.overrideNote ?? "—"}</dd>
                </>
              )}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Ghi đè công
            </h3>

            {locked ? (
              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  Kỳ đã chốt — chỉ đổi qua đơn chỉnh công hoặc mở lại kỳ.
                </p>
                <Link href={kyHref} className="mt-2 inline-block font-medium text-primary hover:underline">
                  Sang màn Kỳ công
                </Link>
              </div>
            ) : !canAdjust ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Ghi đè cần quyền <code className="rounded bg-card px-1 py-0.5 font-mono text-xs">hr_attendance:adjust</code>{" "}
                tại {row.blockLabel}.
              </p>
            ) : !row.computed || row.credit == null ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Máy chưa tính ngày này. Chờ vài phút rồi tải lại — chưa có số máy tính thì không có
                gì để ghi đè.
              </p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim() || units === "") return;
                  save(Number(units));
                }}
              >
                <div>
                  <label htmlFor={`units-${row.userId}`} className="mb-1 block text-sm font-semibold text-foreground">
                    Công ghi nhận
                  </label>
                  <input
                    id={`units-${row.userId}`}
                    type="number"
                    step="0.5"
                    min="0"
                    max="3"
                    value={units}
                    autoFocus
                    onChange={(e) => setUnits(e.target.value)}
                    className={cn(FIELD, "w-24")}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Máy tính {row.engineCredit ?? "—"} công. Nhấn Enter để lưu.
                  </p>
                </div>
                <div>
                  <label htmlFor={`reason-${row.userId}`} className="mb-1 block text-sm font-semibold text-foreground">
                    Lý do <span className="text-state-danger-ink">*</span>
                  </label>
                  <input
                    id={`reason-${row.userId}`}
                    value={reason}
                    maxLength={300}
                    required
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Vd: quên bấm ra, đã xác nhận với quản lý"
                    className={cn(FIELD, "w-full")}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={pending || !reason.trim() || units === ""}
                    className={BTN_PRIMARY}
                  >
                    Lưu
                  </button>
                  {row.override && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => save(null)}
                      className={BTN_OUTLINE}
                    >
                      Bỏ ghi đè
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Huỷ
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
