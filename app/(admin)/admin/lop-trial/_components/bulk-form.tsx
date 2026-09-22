"use client";

// Mở lớp trải nghiệm cho CẢ KỲ — một khoảng ngày + NHIỀU TUỲ CHỌN.
//
// Chủ dự án 22/09/2026 (vòng 2): "chọn từ ngày đến ngày rồi phải chọn thêm giờ của kỳ đó,
// và có thể + thêm tuỳ chọn khác, ví dụ: tạo kỳ 22/09-30/09 lịch t3-t6 và lịch t7-cn
// riêng biệt".
//
// ── MỘT TUỲ CHỌN MANG ĐÚNG MỘT KHUNG ─────────────────────────────────────────────────
// Thứ 7 muốn cả sáng lẫn chiều thì là HAI tuỳ chọn. Đó cũng là lý do nút "+ Thêm tuỳ
// chọn" tồn tại, và là lý do ô chọn giờ lấy GIAO các khung của những thứ đã tick: tick
// T3 (tối) cùng T7 (sáng/chiều) thì giao rỗng — màn hình nói thẳng là phải tách ra, thay
// vì bày một khung rồi để server từ chối.
//
// ⚠️ Ô "Khoá trải nghiệm" ĐÃ GỠ cùng lượt này: "qlcs không biết khung giờ đó sẽ có học
// viên trải nghiệm nào nên cũng không biết khoá trải nghiệm nào".

import type { JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { taoLopTrialTheoThuAction } from "../_actions";
import {
  goiYQuyTac,
  khungChungChoThu,
  TEN_THU,
  THU_KHOA,
  type CauHinhKhung,
  type QuyTacKy,
} from "@/lib/trial/khung-gio-mo-lop";
import type { Option } from "../_lib/types";

/** Thứ 2 → CN theo thứ tự người Việt đọc; giá trị là chỉ số `vnWeekday`. */
const THU_HIEN = [1, 2, 3, 4, 5, 6, 0] as const;

export function BulkForm({
  centers,
  coSoMacDinh,
  cauHinhKhung,
  homNay,
}: {
  centers: Option[];
  coSoMacDinh: string;
  cauHinhKhung: CauHinhKhung;
  homNay: string;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [centerId, setCenterId] = useState(coSoMacDinh);
  const [tu, setTu] = useState(homNay);
  const [den, setDen] = useState(homNay);
  // Mở form ra là đã có sẵn bộ tuỳ chọn suy từ cấu hình — với cấu hình mặc định, đúng ba
  // dòng T3–T6 tối · T7+CN sáng · T7+CN chiều, tức đúng ví dụ chủ dự án đưa ra.
  const [quyTac, setQuyTac] = useState<QuyTacKy[]>(() => goiYQuyTac(cauHinhKhung));
  const [boQua, setBoQua] = useState<string[]>([]);

  function suaQuyTac(i: number, moi: Partial<QuyTacKy>) {
    setQuyTac((cu) => cu.map((q, k) => (k === i ? { ...q, ...moi } : q)));
  }

  function doiThu(i: number, t: number) {
    setQuyTac((cu) =>
      cu.map((q, k) => {
        if (k !== i) return q;
        const thu = q.thu.includes(t) ? q.thu.filter((x) => x !== t) : [...q.thu, t].sort();
        // Đổi nhóm thứ có thể làm khung đang chọn hết hợp lệ (tick thêm T7 vào dòng tối).
        // Rơi về khung chung đầu tiên, hoặc để trống nếu không còn khung chung nào.
        const chung = khungChungChoThu(thu, cauHinhKhung);
        const conHopLe = chung.some(
          (c) => c.startTime === q.startTime && c.endTime === q.endTime,
        );
        const k0 = chung[0];
        return conHopLe
          ? { ...q, thu }
          : { ...q, thu, startTime: k0?.startTime ?? "", endTime: k0?.endTime ?? "" };
      }),
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quyTac.length === 0) {
      toast.error("Thêm ít nhất một tuỳ chọn");
      return;
    }
    const thieu = quyTac.findIndex((q) => q.thu.length === 0 || !q.startTime || !q.endTime);
    if (thieu >= 0) {
      toast.error(`Tuỳ chọn ${thieu + 1} chưa chọn đủ thứ và khung giờ`);
      return;
    }
    startTransition(async () => {
      const res = await taoLopTrialTheoThuAction({ centerId, tu, den, quyTac });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const daTao = res.daTao ?? 0;
      const bq = res.boQua ?? [];
      setBoQua(bq);
      if (daTao === 0) {
        // KHÔNG báo "thành công" khi không mở được lớp nào — đó là lời khen cho một lượt
        // bấm không làm gì, và người dùng sẽ đi tìm lớp không tồn tại.
        toast.error(bq[0] ?? "Không mở được lớp nào trong khoảng đã chọn");
        return;
      }
      toast.success(
        bq.length > 0 ? `Đã mở ${daTao} lớp; bỏ qua ${bq.length} ngày` : `Đã mở ${daTao} lớp`,
      );
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Từ ngày *
          <input
            type="date"
            value={tu}
            onChange={(e) => setTu(e.target.value)}
            disabled={pending}
            required
            aria-label="Từ ngày"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Đến ngày *
          <input
            type="date"
            value={den}
            onChange={(e) => setDen(e.target.value)}
            disabled={pending}
            required
            aria-label="Đến ngày"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Mỗi tuỳ chọn là <strong>một nhóm thứ + một khung giờ</strong>. Thứ 7 muốn cả sáng
          lẫn chiều thì tách thành hai tuỳ chọn.
        </p>

        {quyTac.map((q, i) => {
          const chung = khungChungChoThu(q.thu, cauHinhKhung);
          return (
            <fieldset key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-semibold text-foreground">
                  Tuỳ chọn {i + 1}
                </legend>
                {quyTac.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setQuyTac((cu) => cu.filter((_, k) => k !== i))}
                    disabled={pending}
                    aria-label={`Xoá tuỳ chọn ${i + 1}`}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {THU_HIEN.map((t) => {
                  const khoa = THU_KHOA[t]!;
                  const coKhung = khungChungChoThu([t], cauHinhKhung).length > 0;
                  const chon = q.thu.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => doiThu(i, t)}
                      disabled={pending || !coKhung}
                      // Thứ không có khung thì KHOÁ nút và nói lý do, thay vì cho tick rồi
                      // im lặng bỏ qua — tick được mà không ra lớp nào là nút nói dối.
                      title={
                        coKhung
                          ? TEN_THU[khoa]
                          : `${TEN_THU[khoa]} không mở lớp trải nghiệm — sửa ở Cấu hình vận hành`
                      }
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        !coKhung
                          ? "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60"
                          : chon
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {TEN_THU[khoa]}
                    </button>
                  );
                })}
              </div>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Khung giờ *
                {chung.length > 0 ? (
                  <select
                    value={`${q.startTime}-${q.endTime}`}
                    onChange={(e) => {
                      const [bd, kt] = e.target.value.split("-");
                      suaQuyTac(i, { startTime: bd ?? "", endTime: kt ?? "" });
                    }}
                    disabled={pending}
                    aria-label={`Khung giờ của tuỳ chọn ${i + 1}`}
                    className="max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
                  >
                    {chung.map((k) => (
                      <option key={`${k.startTime}-${k.endTime}`} value={`${k.startTime}-${k.endTime}`}>
                        {k.startTime}–{k.endTime}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    role="alert"
                    className="rounded-lg border border-state-warning-soft bg-state-warning-soft px-3 py-2 text-xs text-state-warning-ink"
                  >
                    {q.thu.length === 0
                      ? "Chọn ít nhất một thứ."
                      : "Các thứ đã chọn không có khung giờ nào dùng chung — tách thành hai tuỳ chọn (ví dụ T3–T6 riêng, T7–CN riêng)."}
                  </span>
                )}
              </label>
            </fieldset>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setQuyTac((cu) => [...cu, { thu: [], startTime: "", endTime: "" }])
          }
          disabled={pending || quyTac.length >= 10}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Thêm tuỳ chọn khác
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Cơ sở *
        <select
          value={centerId}
          onChange={(e) => setCenterId(e.target.value)}
          disabled={pending}
          required
          className="max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Đang mở lớp…" : "Mở lớp cho cả kỳ"}
      </button>

      {boQua.length > 0 && (
        <div
          role="status"
          className="space-y-1 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground"
        >
          <p className="font-semibold text-foreground">Đã bỏ qua {boQua.length} ngày:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {boQua.slice(0, 20).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {boQua.length > 20 && <p>…và {boQua.length - 20} dòng nữa.</p>}
        </div>
      )}
    </form>
  );
}
