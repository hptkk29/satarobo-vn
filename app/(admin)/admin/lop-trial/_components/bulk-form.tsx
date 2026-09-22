"use client";

// Mở lớp trải nghiệm cho CẢ KỲ theo thứ — chủ dự án 22/09/2026 ("Tạo lớp Trial theo
// ngày, thứ, và khung thời gian có GV đi làm").
//
// ⚠️ KHÔNG có ô nhập giờ ở đây, và đó là CHỦ ĐÍCH: mỗi ngày khớp thứ sẽ mở ĐÚNG các
// khung đã cấu hình của thứ đó, nên thứ 7 tự ra hai lớp (sáng + chiều) như yêu cầu. Cho
// gõ một khung tự do rồi áp cho mọi thứ là mời một lớp 11:00–15:00 vắt qua giờ nghỉ trưa
// — đúng thứ cổng khung giờ sinh ra để chặn.

import type { JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { taoLopTrialTheoThuAction } from "../_actions";
import {
  docKhungGio,
  keKhung,
  TEN_THU,
  THU_KHOA,
  type CauHinhKhung,
} from "@/lib/trial/khung-gio-mo-lop";
import type { Option } from "../_lib/types";

/** Thứ 2 → CN theo thứ tự người Việt đọc, kèm chỉ số `vnWeekday` để gửi lên server. */
const THU_HIEN = [1, 2, 3, 4, 5, 6, 0] as const;

export function BulkForm({
  centers,
  courses,
  coSoMacDinh,
  cauHinhKhung,
  homNay,
}: {
  centers: Option[];
  courses: Option[];
  coSoMacDinh: string;
  cauHinhKhung: CauHinhKhung;
  homNay: string;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [centerId, setCenterId] = useState(coSoMacDinh);
  const [courseId, setCourseId] = useState("");
  const [tu, setTu] = useState(homNay);
  const [den, setDen] = useState(homNay);
  // Mặc định tick đúng những thứ ĐANG MỞ theo cấu hình — người dùng mở form ra là thấy
  // ngay trung tâm đang chạy những thứ nào, không phải tự nhớ.
  const [thu, setThu] = useState<number[]>(() =>
    THU_HIEN.filter((t) => {
      const doc = docKhungGio(cauHinhKhung[THU_KHOA[t]!]);
      return doc.ok && doc.giaTri.length > 0;
    }),
  );

  function doiThu(t: number) {
    setThu((cu) => (cu.includes(t) ? cu.filter((x) => x !== t) : [...cu, t]));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (thu.length === 0) {
      toast.error("Chọn ít nhất một thứ");
      return;
    }
    startTransition(async () => {
      const res = await taoLopTrialTheoThuAction({ centerId, courseId: courseId || undefined, tu, den, thu });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const daTao = res.daTao ?? 0;
      const boQua = res.boQua ?? [];
      if (daTao === 0) {
        // KHÔNG báo "thành công" khi không mở được lớp nào — đó là lời khen cho một lượt
        // bấm không làm gì, và người dùng sẽ đi tìm lớp không tồn tại.
        toast.error(boQua[0] ?? "Không mở được lớp nào trong khoảng đã chọn");
        return;
      }
      toast.success(
        boQua.length > 0
          ? `Đã mở ${daTao} lớp; bỏ qua ${boQua.length} ngày (xem chi tiết bên dưới)`
          : `Đã mở ${daTao} lớp`,
      );
      setBoQua(boQua);
      router.refresh();
    });
  }

  const [boQua, setBoQua] = useState<string[]>([]);

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-4"
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

      <fieldset className="space-y-2">
        <legend className="text-xs text-muted-foreground">Mở vào các thứ *</legend>
        <div className="flex flex-wrap gap-2">
          {THU_HIEN.map((t) => {
            const khoa = THU_KHOA[t]!;
            const doc = docKhungGio(cauHinhKhung[khoa]);
            const coKhung = doc.ok && doc.giaTri.length > 0;
            const chon = thu.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => doiThu(t)}
                disabled={pending || !coKhung}
                // Thứ không có khung thì KHOÁ nút và nói lý do, thay vì cho tick rồi im
                // lặng bỏ qua — tick được mà không ra lớp nào là nút nói dối (luật 12).
                title={
                  coKhung
                    ? `${TEN_THU[khoa]}: ${keKhung(doc.ok ? doc.giaTri : [])}`
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
        <p className="text-[11px] text-muted-foreground">
          Mỗi ngày sẽ mở đúng các khung đã cấu hình của thứ đó — thứ 7 và Chủ nhật ra hai
          lớp (sáng và chiều).
        </p>
      </fieldset>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Cơ sở *
        <select
          value={centerId}
          onChange={(e) => setCenterId(e.target.value)}
          disabled={pending}
          required
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Khoá trải nghiệm
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={pending}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          <option value="">— chưa chọn khoá —</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
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
