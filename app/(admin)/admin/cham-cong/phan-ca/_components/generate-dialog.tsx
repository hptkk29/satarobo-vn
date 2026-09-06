"use client";

// Hộp "Sinh lưới tháng từ khung ca tuần".
//
// Vì sao tách thành hộp riêng: đây là thao tác GHI HÀNG TRĂM Ô một lượt, nhưng bản cũ để nó thành
// một nút nằm lẫn trong thanh lọc, và trả kết quả bằng MỘT dòng chữ nối chuỗi ("+12 ô mới · 3 đổi
// · … · ⚠ 2 người…"). Bảy con số dính nhau như vậy không đọc được, còn `warnings` (mã ca lạ trong
// khung ca) thì bị nuốt hẳn — người xếp lịch không bao giờ biết có mã sai.
//
// Nay: chọn kỳ + chọn khối trong một hộp, kết quả là `<dl>` bảy dòng có nhãn, và hai danh sách
// cảnh báo hiện đầy đủ. Hộp KHÔNG tự đóng sau khi chạy — kết quả là thứ phải đọc, không phải toast.
//
// `generateMonthAction` sống ở `khung-ca/_actions.ts` (cùng chủ với khung ca tuần) và tự gác quyền
// theo từng khối; ở đây chỉ bày các khối người dùng có `hr_attendance:assign`.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BTN_OUTLINE, BTN_PRIMARY, FIELD } from "@/components/admin/cham-cong/classes";
import { generateMonthAction } from "../../khung-ca/_actions";

/** Gương của `GenerateResult` (lib/cham-cong/generate-db.ts) — khai lại để component client không
 *  kéo module server vào cây import chỉ vì một kiểu dữ liệu. */
type GenKetQua = {
  created: number;
  replaced: number;
  kept: number;
  cleared: number;
  skippedProtected: number;
  skippedNoPermission: number;
  unknownCode: number;
  people: number;
  restWarnings: { userId: string; from: string; to: string }[];
  warnings: string[];
};

/** Bảy con số của một lượt sinh, kèm giải thích ngắn — không có nhãn thì "kept 12" vô nghĩa. */
const SO_DO: { key: keyof GenKetQua; label: string; hint: string }[] = [
  { key: "created", label: "Ô mới", hint: "ngày chưa có ca, nay được xếp" },
  { key: "replaced", label: "Ô đổi mã", hint: "đã có ca theo khung, mã cũ khác mã mới" },
  { key: "kept", label: "Ô giữ nguyên", hint: "mã trùng khung ca, không ghi lại" },
  { key: "cleared", label: "Ô bị xoá", hint: "khung ca bỏ trống thứ đó" },
  { key: "skippedProtected", label: "Ô được bảo vệ", hint: "sửa tay / đơn đã duyệt / file import" },
  { key: "skippedNoPermission", label: "Ô ngoài quyền", hint: "thuộc khối bạn không xếp được" },
  { key: "unknownCode", label: "Mã lạ", hint: "mã trong khung ca không có trong danh mục" },
];

function ngayVi(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

export function GenerateDialog({
  defaultKy,
  blocks,
  defaultBlockId,
}: {
  /** Mặc định là tháng SAU theo giờ VN — xếp lịch là việc làm trước. */
  defaultKy: string;
  /** Chỉ khối có `hr_attendance:assign`. */
  blocks: { id: string; label: string }[];
  defaultBlockId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [ky, setKy] = useState(defaultKy);
  const [chon, setChon] = useState<string[]>(() =>
    defaultBlockId && blocks.some((b) => b.id === defaultBlockId) ? [defaultBlockId] : blocks.map((b) => b.id),
  );
  const [ketQua, setKetQua] = useState<GenKetQua | null>(null);

  if (blocks.length === 0) return null;

  function toggle(id: string) {
    setChon((cu) => (cu.includes(id) ? cu.filter((x) => x !== id) : [...cu, id]));
  }

  function chay() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ky) || chon.length === 0) return;
    setKetQua(null);
    start(async () => {
      const r = await generateMonthAction({ periodKey: ky, centerIds: chon });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setKetQua(r.data);
      toast.success("Đã sinh lưới tháng");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}>
        <Wand2 aria-hidden className="h-4 w-4" />
        Sinh lưới từ khung
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sinh lưới tháng từ khung ca</DialogTitle>
            <DialogDescription>
              Lấy khung ca tuần của từng người rải ra cả tháng. Không đè ô đã sửa tay, ô sinh từ đơn đã
              duyệt, ô từ file import. Chạy lại nhiều lần cho cùng một kỳ vẫn ra một kết quả.
            </DialogDescription>
          </DialogHeader>

          <fieldset disabled={pending} aria-busy={pending || undefined} className="space-y-4">
            <div>
              <label htmlFor="gen-ky" className="mb-1 block text-sm font-semibold text-foreground">
                Kỳ công
              </label>
              <input
                id="gen-ky"
                type="month"
                value={ky}
                onChange={(e) => setKy(e.target.value)}
                aria-invalid={!/^\d{4}-(0[1-9]|1[0-2])$/.test(ky)}
                className={cn(FIELD, "w-48")}
              />
            </div>

            <div>
              <span className="mb-1 block text-sm font-semibold text-foreground">Khối áp dụng</span>
              <div className="flex flex-col gap-1.5">
                {blocks.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={chon.includes(b.id)}
                      onChange={() => toggle(b.id)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {b.label}
                  </label>
                ))}
              </div>
              {chon.length === 0 && (
                <p role="alert" className="mt-1 text-xs text-state-danger-ink">
                  Chọn ít nhất một khối.
                </p>
              )}
            </div>
          </fieldset>

          {ketQua && (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                Kỳ {ky} · {ketQua.people} người
              </p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {SO_DO.map((s) => (
                  <div key={s.key} className="flex items-baseline justify-between gap-2">
                    <dt className="min-w-0 truncate text-sm text-muted-foreground" title={s.hint}>
                      {s.label}
                    </dt>
                    <dd className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {ketQua[s.key] as number}
                    </dd>
                  </div>
                ))}
              </dl>

              {ketQua.restWarnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-state-warning-soft bg-state-warning-soft p-3">
                  <p className="text-sm font-semibold text-state-warning-ink">
                    {ketQua.restWarnings.length} đợt làm 7 ngày liên tiếp không nghỉ (Điều 111 BLLĐ)
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-state-warning-ink">
                    {ketQua.restWarnings.slice(0, 8).map((w, i) => (
                      <li key={`${w.userId}-${w.from}-${i}`} className="tabular-nums">
                        {ngayVi(w.from)} → {ngayVi(w.to)}
                      </li>
                    ))}
                    {ketQua.restWarnings.length > 8 && (
                      <li>… và {ketQua.restWarnings.length - 8} đợt nữa</li>
                    )}
                  </ul>
                  <p className="mt-1 text-xs text-state-warning-ink">
                    Xem lưới bên dưới để biết là ai, rồi chèn một ngày X hoặc P.
                  </p>
                </div>
              )}

              {ketQua.warnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-state-danger-soft bg-state-danger-soft p-3">
                  <p className="text-sm font-semibold text-state-danger-ink">
                    {ketQua.warnings.length} cảnh báo khi đọc khung ca
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-state-danger-ink">
                    {ketQua.warnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {ketQua.warnings.length > 8 && <li>… và {ketQua.warnings.length - 8} cảnh báo nữa</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-4">
            <button type="button" onClick={() => setOpen(false)} className={BTN_OUTLINE}>
              {ketQua ? "Đóng" : "Huỷ"}
            </button>
            <button
              type="button"
              onClick={chay}
              disabled={pending || chon.length === 0}
              className={BTN_PRIMARY}
            >
              {pending ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 aria-hidden className="h-4 w-4" />
              )}
              {ketQua ? "Sinh lại" : "Sinh lưới"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
