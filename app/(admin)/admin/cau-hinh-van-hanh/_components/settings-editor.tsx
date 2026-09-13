"use client";

// Trình sửa tham số vận hành — bản TAB NGANG (13/09/2026).
//
// ── BẢN CŨ SAI Ở ĐÂU ─────────────────────────────────────────────────────────────────────
// Một danh sách dọc 86 ô, gom theo `group` của mã nguồn, mỗi ô là một `<textarea>` JSON kèm
// tên khoá kiểu `cron.renewalReminderMinDays`. Người dùng trang này là quản trị hệ thống của
// trung tâm — họ không biết "cron" là gì, không biết `5` phải gõ trần còn `"616899"` phải có
// nháy kép, và phải cuộn qua 80 dòng không liên quan để tới thứ mình cần.
//
// Hệ quả không phải "xấu": tham số mà người có quyền đổi không hiểu nghĩa thì hoặc không ai
// đụng tới, hoặc bị đổi sai. Một trang cấu hình không dùng được cũng bằng không có.
//
// ── BẢN NÀY ──────────────────────────────────────────────────────────────────────────────
// · Chia tab theo CÔNG VIỆC (`lib/settings/nhan-van-hanh.ts`), không theo module mã nguồn.
// · Mỗi dòng: tên viết như một câu nói + một câu "đổi cái này thì chuyện gì xảy ra" + đơn vị.
// · Ô nhập theo ĐÚNG KIỂU giá trị: bật/tắt ra công tắc, số ra ô số, chữ ra ô chữ. Chỉ những
//   giá trị thật sự phức tạp (danh sách, bảng) mới còn ô JSON — và có dòng nhắc riêng.
// · Tên khoá kỹ thuật KHÔNG hiện mặc định; nằm trong mục "Chi tiết kỹ thuật" gấp lại, vì khi
//   có sự cố thì đó là thứ duy nhất tra được trong nhật ký kiểm toán.
//
// ── MỘT THỨ CỐ Ý GIỮ ─────────────────────────────────────────────────────────────────────
// Lưu TỪNG Ô một, mỗi lần một lý do — không gom "Lưu tất cả". Mỗi dòng nhật ký kiểm toán phải
// trả lời được "ai đổi cái gì, vì sao"; gom 20 ô vào một lý do là mất hẳn câu trả lời đó.

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { NhanVanHanh } from "@/lib/settings/nhan-van-hanh";
import { saveGlobalSettingAction } from "../actions";

export type SettingRowView = {
  key: string;
  value: unknown;
  nhan: NhanVanHanh;
};

/** Kiểu ô nhập suy từ GIÁ TRỊ, không cần đưa schema Zod qua ranh giới client. */
type KieuO = "batTat" | "so" | "chu" | "phucTap";

function kieuCuaGiaTri(v: unknown): KieuO {
  if (typeof v === "boolean") return "batTat";
  if (typeof v === "number") return "so";
  if (typeof v === "string") return "chu";
  return "phucTap";
}

function HangCauHinh({ row, choSua }: { row: SettingRowView; choSua: boolean }) {
  const kieu = kieuCuaGiaTri(row.value);
  const [thoNhap, setThoNhap] = useState(() =>
    kieu === "phucTap" ? JSON.stringify(row.value, null, 2) : String(row.value ?? ""),
  );
  const [bat, setBat] = useState(() => row.value === true);
  const [lyDo, setLyDo] = useState("");
  const [dangLuu, batDauLuu] = useTransition();

  const giaTriMoi = (): { ok: true; v: unknown } | { ok: false; loi: string } => {
    if (kieu === "batTat") return { ok: true, v: bat };
    if (kieu === "so") {
      const n = Number(thoNhap.trim().replace(/\s/g, ""));
      if (thoNhap.trim() === "" || Number.isNaN(n)) {
        return { ok: false, loi: "Hãy nhập một con số" };
      }
      return { ok: true, v: n };
    }
    if (kieu === "chu") return { ok: true, v: thoNhap };
    try {
      return { ok: true, v: JSON.parse(thoNhap) };
    } catch {
      return {
        ok: false,
        loi: "Nội dung chưa đúng định dạng — kiểm lại dấu phẩy và dấu ngoặc",
      };
    }
  };

  // So với giá trị ĐANG LƯU để biết có gì để lưu không. Nút sáng khi không có thay đổi là một
  // lời hứa suông: bấm vào chỉ ghi thêm một dòng nhật ký kiểm toán rỗng nghĩa.
  const coDoi = useMemo(() => {
    const g = giaTriMoi();
    if (!g.ok) return true; // đang nhập dở ⇒ cứ cho bấm để hiện thông báo lỗi
    return JSON.stringify(g.v) !== JSON.stringify(row.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thoNhap, bat, row.value]);

  const luu = () => {
    const g = giaTriMoi();
    if (!g.ok) {
      toast.error(g.loi);
      return;
    }
    if (!lyDo.trim()) {
      toast.error("Vui lòng nhập lý do thay đổi");
      return;
    }
    batDauLuu(async () => {
      const res = await saveGlobalSettingAction({ key: row.key, value: g.v, reason: lyDo });
      if (res.ok) {
        toast.success(`Đã lưu: ${row.nhan.ten}`);
        setLyDo("");
      } else {
        toast.error(res.error.message);
      }
    });
  };

  const idO = `o-${row.key.replace(/\./g, "-")}`;

  return (
    <div className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <label htmlFor={idO} className="text-sm font-semibold text-foreground">
            {row.nhan.ten}
            {row.nhan.canThan && (
              <span
                className="ml-1.5 inline-flex translate-y-0.5 text-state-warning-ink"
                title="Đổi cái này ảnh hưởng rộng hoặc tốn tiền"
              >
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Cần cân nhắc</span>
              </span>
            )}
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {row.nhan.giaiThich}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:w-64 sm:justify-end">
          {kieu === "batTat" ? (
            <>
              <span className="text-sm text-muted-foreground">{bat ? "Đang bật" : "Đang tắt"}</span>
              <Switch
                id={idO}
                checked={bat}
                onCheckedChange={setBat}
                disabled={!choSua || dangLuu}
                aria-label={row.nhan.ten}
              />
            </>
          ) : kieu === "phucTap" ? null : (
            <>
              <Input
                id={idO}
                value={thoNhap}
                inputMode={kieu === "so" ? "decimal" : "text"}
                onChange={(e) => setThoNhap(e.target.value)}
                disabled={!choSua || dangLuu}
                className="w-full sm:w-40"
              />
              {row.nhan.donVi && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {row.nhan.donVi}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {kieu === "phucTap" && (
        <div className="mt-3">
          <Textarea
            id={idO}
            value={thoNhap}
            onChange={(e) => setThoNhap(e.target.value)}
            disabled={!choSua || dangLuu}
            rows={Math.min(14, thoNhap.split("\n").length + 1)}
            className="font-mono text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Đây là một danh sách nhiều mục. Giữ nguyên dấu ngoặc và dấu phẩy như mẫu sẵn có —
            chỉ sửa phần chữ bên trong dấu nháy.
          </p>
        </div>
      )}

      {choSua && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="Lý do thay đổi (bắt buộc)"
            disabled={dangLuu}
            aria-label={`Lý do thay đổi: ${row.nhan.ten}`}
            className="sm:flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={luu}
            disabled={!coDoi || dangLuu}
            className="shrink-0"
          >
            {dangLuu ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
          Chi tiết kỹ thuật
        </summary>
        {/* Tên khoá là thứ DUY NHẤT tra được trong nhật ký kiểm toán và khi hỏi bên kỹ thuật —
            nên phải có, nhưng gấp lại để nó không chen vào giữa người dùng và việc của họ. */}
        <code className="mt-1 block text-[11px] text-muted-foreground">{row.key}</code>
      </details>
    </div>
  );
}

export function BangCauHinhTab({
  rows,
  choSua,
}: {
  rows: readonly SettingRowView[];
  choSua: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card">
      {rows.map((r) => (
        <HangCauHinh key={r.key} row={r} choSua={choSua} />
      ))}
    </div>
  );
}

/** Thanh tab ngang. Cuộn ngang trên điện thoại thay vì xuống hàng thành ba tầng nút. */
export function ThanhTab({
  tabs,
  dangChon,
  onChon,
}: {
  tabs: readonly { id: string; ten: string }[];
  dangChon: string;
  onChon: (id: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" aria-label="Nhóm cấu hình" className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const chon = t.id === dangChon;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={chon}
              onClick={() => onChon(t.id)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                chon
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.ten}
            </button>
          );
        })}
      </div>
    </div>
  );
}
