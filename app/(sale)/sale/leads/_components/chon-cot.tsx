"use client";

/**
 * Site Sale — nút "Tuỳ chọn cột" của bảng Leads.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/leads/_components/column-picker.tsx` ──────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Việc lưu vẫn gọi ĐÚNG hai Server Action của khu quản
 *    trị (`saveLeadTableColumnsAction` / `resetLeadTableColumnsAction`) — nơi
 *    kiểm quyền, nắn theo danh mục ở server, và loại khoá lạc. Danh sách cột vẫn
 *    đến từ `lib/tables/lead-columns.ts`; tệp này KHÔNG được tự khai nhãn cột nào.
 *
 * GIỮ NGUYÊN 100% câu chữ: "Tuỳ chọn cột" · "Đang hiện (n)" · "Cột chưa dùng (n)" ·
 * "(đã che)" · "Khôi phục mặc định" · "Huỷ" · "Lưu" · cả đoạn giải thích PII và
 * các toast ("Phải giữ lại ít nhất một cột.", "Đã lưu tuỳ chọn cột của bạn.",
 * "Đã khôi phục bộ cột mặc định.").
 *
 * ── BA RÀNG BUỘC MANG NGUYÊN TỪ BẢN ADMIN, ĐỪNG PHÁ ─────────────────────────
 *  · KHÔNG thêm thư viện kéo-thả — HTML5 DnD thuần.
 *  · Kéo-thả HTML5 không dùng được bằng bàn phím và không chạy trên cảm ứng, nên
 *    nút ▲/▼ là đường CHÍNH (mobile 375px + a11y); kéo-thả chỉ là tiện ích desktop.
 *  · Nhãn "(đã che)" là LỜI GIẢI THÍCH, không phải hàng rào: dữ liệu đã bị che ở
 *    server (`maskLeadPiiFields`) trước khi rời máy chủ, nên bật cột lên vẫn chỉ
 *    ra bản đã che.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  saveLeadTableColumnsAction,
  resetLeadTableColumnsAction,
} from "@/app/(admin)/admin/leads/_column-actions";

export type CotChon = {
  key: string;
  label: string;
  group: string;
  pii?: boolean;
};

export function ChonCotLead({
  tableKey,
  dangHien: hienBanDau,
  dangAn: anBanDau,
  cheePii,
}: {
  tableKey: string;
  dangHien: CotChon[];
  dangAn: CotChon[];
  /** Người xem KHÔNG có `leads:view-pii` → chú thích "đã che" trên cột nhạy cảm. */
  cheePii: boolean;
}) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [hien, setHien] = useState<CotChon[]>(hienBanDau);
  const [an, setAn] = useState<CotChon[]>(anBanDau);
  const [keo, setKeo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function doiMo(next: boolean) {
    if (pending) return;
    if (next) {
      // Mở lại sau khi huỷ: bỏ mọi chỉnh sửa dở, quay về đúng cái đang chạy.
      setHien(hienBanDau);
      setAn(anBanDau);
      setKeo(null);
    }
    setMo(next);
  }

  function doiCho(tu: number, den: number) {
    setHien((ds) => {
      if (den < 0 || den >= ds.length || tu === den) return ds;
      const moi = [...ds];
      const [lay] = moi.splice(tu, 1);
      if (!lay) return ds;
      moi.splice(den, 0, lay);
      return moi;
    });
  }

  function tha(keyDich: string) {
    if (!keo || keo === keyDich) return;
    const tu = hien.findIndex((c) => c.key === keo);
    const den = hien.findIndex((c) => c.key === keyDich);
    if (tu < 0 || den < 0) return;
    doiCho(tu, den);
    setKeo(null);
  }

  function boCot(key: string) {
    const cot = hien.find((c) => c.key === key);
    if (!cot) return;
    setHien((ds) => ds.filter((c) => c.key !== key));
    setAn((ds) => [...ds, cot]);
  }

  function batCot(key: string) {
    const cot = an.find((c) => c.key === key);
    if (!cot) return;
    setAn((ds) => ds.filter((c) => c.key !== key));
    setHien((ds) => [...ds, cot]);
  }

  function luu() {
    if (hien.length === 0) {
      toast.error("Phải giữ lại ít nhất một cột.");
      return;
    }
    start(async () => {
      const res = await saveLeadTableColumnsAction({
        tableKey,
        visible: hien.map((c) => c.key),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Không lưu được tuỳ chọn cột");
        return;
      }
      toast.success("Đã lưu tuỳ chọn cột của bạn.");
      setMo(false);
      // Action revalidate `/leads` + `/admin/leads` — hai đường của khu quản trị.
      // Màn này ở `/sale/leads`, nên bảng chỉ đổi cột khi tự kéo lại dữ liệu.
      router.refresh();
    });
  }

  function khoiPhuc() {
    start(async () => {
      const res = await resetLeadTableColumnsAction({ tableKey });
      if (!res.ok) {
        toast.error(res.error ?? "Không khôi phục được");
        return;
      }
      toast.success("Đã khôi phục bộ cột mặc định.");
      setMo(false);
      router.refresh();
    });
  }

  return (
    <>
      {/* Dialog CONTROLLED + nút onClick — khuôn đang dùng khắp repo (không DialogTrigger). */}
      <button
        type="button"
        onClick={() => doiMo(true)}
        title="Chọn cột hiển thị trên bảng lead"
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3",
          "text-sm font-medium text-foreground transition-colors",
          "hover:bg-[color:var(--surface-chim)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
        )}
      >
        <Columns3 aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">Tuỳ chọn cột</span>
      </button>

      <Dialog open={mo} onOpenChange={doiMo}>
        <DialogContent className="max-h-[90vh] w-[min(96vw,72rem)] max-w-[72rem] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tuỳ chọn cột</DialogTitle>
            <DialogDescription>
              Cấu hình này là <strong>của riêng bạn</strong> — không ảnh hưởng người khác.
              Kéo thả để đổi thứ tự (hoặc dùng nút ▲ ▼ trên điện thoại).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Đang hiện ({hien.length})
              </h3>
              <ul className="space-y-1.5">
                {hien.map((cot, i) => (
                  <li
                    key={cot.key}
                    draggable
                    onDragStart={() => setKeo(cot.key)}
                    onDragEnd={() => setKeo(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => tha(cot.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5",
                      keo === cot.key && "opacity-50",
                    )}
                  >
                    <GripVertical
                      aria-hidden="true"
                      className="size-4 shrink-0 cursor-grab text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 break-words text-sm leading-snug text-foreground">
                      {cot.label}
                      {cheePii && cot.pii ? (
                        <span className="ml-1 text-xs text-muted-foreground">(đã che)</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => doiCho(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Đưa cột ${cot.label} lên trên`}
                      className="rounded p-1 text-muted-foreground hover:bg-[color:var(--surface-chim)] disabled:opacity-30"
                    >
                      <ArrowUp aria-hidden="true" className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => doiCho(i, i + 1)}
                      disabled={i === hien.length - 1}
                      aria-label={`Đưa cột ${cot.label} xuống dưới`}
                      className="rounded p-1 text-muted-foreground hover:bg-[color:var(--surface-chim)] disabled:opacity-30"
                    >
                      <ArrowDown aria-hidden="true" className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => boCot(cot.key)}
                      aria-label={`Bỏ cột ${cot.label} khỏi bảng`}
                      className="rounded p-1 text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-soft)]"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                ))}
                {hien.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">
                    Chưa chọn cột nào
                  </li>
                ) : null}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Cột chưa dùng ({an.length})
              </h3>
              {an.length === 0 ? (
                <p className="text-xs text-muted-foreground">Đã bật hết cột hiện có.</p>
              ) : (
                <div className="space-y-3">
                  {gomTheoNhom(an).map(([nhom, cots]) => (
                    <div key={nhom}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {nhom}
                      </p>
                      <ul className="space-y-1.5">
                        {cots.map((cot) => (
                          <li key={cot.key}>
                            <button
                              type="button"
                              onClick={() => batCot(cot.key)}
                              className={cn(
                                "flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border",
                                "px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors",
                                "hover:bg-[color:var(--surface-chim)] hover:text-foreground",
                              )}
                            >
                              <Plus aria-hidden="true" className="size-3.5 shrink-0" />
                              <span className="min-w-0 flex-1 break-words leading-snug">
                                {cot.label}
                                {cheePii && cot.pii ? (
                                  <span className="ml-1 text-xs">(đã che)</span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {cheePii ? (
            <p className="rounded-lg bg-[color:var(--surface-chim)] p-2.5 text-xs text-muted-foreground">
              Tài khoản của bạn không có quyền xem thông tin cá nhân của lead. Bật các cột
              đánh dấu <em>(đã che)</em> vẫn chỉ hiện bản đã che — đây không phải lỗi.
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={khoiPhuc} disabled={pending}>
              <RotateCcw className="mr-1.5 size-4" />
              Khôi phục mặc định
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => doiMo(false)} disabled={pending}>
                Huỷ
              </Button>
              <Button type="button" onClick={luu} disabled={pending}>
                {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                Lưu
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Gom cột ẩn theo nhóm, GIỮ thứ tự xuất hiện (thứ tự đó đến từ danh mục). */
function gomTheoNhom(cots: CotChon[]): [string, CotChon[]][] {
  const map = new Map<string, CotChon[]>();
  for (const c of cots) {
    const ds = map.get(c.group);
    if (ds) ds.push(c);
    else map.set(c.group, [c]);
  }
  return [...map.entries()];
}
