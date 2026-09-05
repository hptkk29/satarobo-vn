"use client";

/**
 * Site Sale — lưới lịch ca của chính người đăng nhập + hộp thoại đăng ký ca.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/lich-ca/_components/my-shifts-calendar.tsx` ──
 * Tách bản riêng theo chốt 04/09/2026 (site Sale không dùng chung component với
 * khu quản trị). Bản admin GIỮ NGUYÊN, không sửa.
 *
 * 🔴 ĐƯỜNG GHI KHÔNG ĐƯỢC TÁCH. Server Action vẫn là `saveMyShifts` của khu quản
 *    trị. Chỉ phần VẼ tách ra. Ở đó có ba luật không được sao chép lại lần hai:
 *    sát ngày (<2 ngày) thì tự chuyển `LEAVE_REQUESTED`, trần 3 lần khẩn cấp mỗi
 *    tháng, và `centerId` phải set khi tạo (`scopedDb` KHÔNG che write — quên là
 *    dòng vô hình với chính cơ sở của mình).
 *
 * ⚠️ `router.refresh()` là BẮT BUỘC, không phải cho chắc. `saveMyShifts` gọi
 *    `revalidatePath("/cham-cong/lich-ca")` + `revalidatePath("/cham-cong/lich-ca-nhan-vien")`
 *    — đường SẠCH của host quản trị, không khớp `/sale/cham-cong/lich-ca`. Bỏ
 *    `router.refresh()` thì lưu ca xong lưới vẫn y nguyên cho tới khi tải lại
 *    tay, và người dùng bấm lưu lần hai.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: bảy nhãn thứ (CN → T7), ô ngày mang số ngày + dấu
 * tiết dạy + các ca đã đăng ký + dấu "nghỉ?"; hộp thoại mang đúng tiêu đề "Đăng
 * ký ca · {ngày}", đúng khối nhắc tiết dạy, đúng cảnh báo "Ca đang chọn chưa phủ
 * giờ có tiết dạy", đúng ba nút ca kèm khung giờ, đúng ô ghi chú, đúng câu "Bỏ
 * chọn hết = xin nghỉ cả ngày.", đúng hai nút Lưu / Hủy và đúng hai câu toast.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Ô ngày cao tối thiểu 64px giữ nguyên, nhưng ngày HÔM NAY nay được đánh dấu
 *    bằng nền `--primary-soft` + viền `--primary` — cùng ngôn ngữ với mục đang
 *    đứng ở thanh bên (tím = "bạn đang ở đây"), không phải một màu trạng thái.
 * 2. Viên ca đăng ký đổi từ `bg-primary` + chữ trắng sang `--primary-soft` +
 *    `--primary-ink`. Trên nền tint 10%, `#7C3AED` chỉ đo được 4,94:1 (sát
 *    ngưỡng) còn `#6D28D9` được 6,15:1 — số đo ở đầu `sale.css`.
 * 3. Dấu tiết dạy và dấu "nghỉ?" đi qua thang ngữ nghĩa (`--state-info-*` /
 *    `--state-danger-*`) thay vì chuỗi class gõ tay. "Có tiết dạy" là THÔNG TIN
 *    (bạn bận giờ đó), không phải thành công — bản admin tô nó xanh `success`,
 *    và xanh ở đó không nói lên điều gì.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WorkShift } from "@prisma/client";
import { SHIFT_DEFS, SHIFT_ORDER, registrationWindowWarning } from "@/lib/shifts";
import { teachingUncovered } from "@/lib/work-schedule";
import { saveMyShifts } from "@/app/(admin)/admin/cham-cong/lich-ca/_actions";
import type { ODangKyCa, OTietDay } from "@/lib/sale/cham-cong";
import { cn } from "@/lib/utils";

const THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

type ONgay = { dateStr: string | null; day: number | null };

export function LichCaCuaToi({
  o,
  theoNgay,
  dayTheoNgay,
  homNay,
}: {
  o: ONgay[];
  theoNgay: Record<string, ODangKyCa>;
  dayTheoNgay: Record<string, OTietDay[]>;
  homNay: string;
}) {
  const router = useRouter();
  const [dangChay, batDau] = useTransition();
  const [dangChon, setDangChon] = useState<string | null>(null);
  const [caDaChon, setCaDaChon] = useState<WorkShift[]>([]);
  const [ghiChu, setGhiChu] = useState("");

  const banGhi = dangChon ? theoNgay[dangChon] : undefined;
  const tietDay = dangChon ? dayTheoNgay[dangChon] ?? [] : [];

  function moNgay(ngay: string) {
    setDangChon(ngay);
    setCaDaChon(theoNgay[ngay]?.shifts ?? []);
    setGhiChu(theoNgay[ngay]?.note ?? "");
  }

  function bat(s: WorkShift) {
    setCaDaChon((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  function luu() {
    if (!dangChon) return;
    batDau(async () => {
      const kq = await saveMyShifts({ date: dangChon, shifts: caDaChon, note: ghiChu.trim() });
      if (kq.ok) {
        toast.success(
          kq.status === "LEAVE_REQUESTED" ? "Đã lưu (đánh dấu xin nghỉ khẩn)" : "Đã lưu ca",
        );
        setDangChon(null);
        router.refresh();
      } else toast.error(kq.error);
    });
  }

  const canhBao = dangChon
    ? registrationWindowWarning(new Date(), new Date(`${dangChon}T00:00:00`))
    : null;

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
        {THU.map((t) => (
          <div key={t} className="py-1">
            {t}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {o.map((c, i) => {
          if (!c.dateStr) return <div key={i} />;
          const ngay = c.dateStr;
          const dk = theoNgay[ngay];
          const day = dayTheoNgay[ngay] ?? [];
          const laHomNay = ngay === homNay;
          return (
            <button
              key={i}
              type="button"
              onClick={() => moNgay(ngay)}
              className={cn(
                "min-h-16 rounded-lg border p-1 text-left transition-colors",
                "hover:border-[color:var(--primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40",
                laHomNay
                  ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)]"
                  : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{c.day}</span>
                {day.length > 0 && (
                  <span
                    title={`${day.length} tiết dạy`}
                    className="rounded bg-[color:var(--state-info-soft)] px-1 text-[9px] font-bold text-[color:var(--state-info)]"
                  >
                    📚{day.length}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {dk?.shifts.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-[color:var(--primary-soft)] px-1 text-[9px] font-bold text-[color:var(--primary-ink)]"
                  >
                    {SHIFT_DEFS[s].label.replace("Ca ", "")}
                  </span>
                ))}
                {dk?.status === "LEAVE_REQUESTED" && (
                  <span className="rounded bg-[color:var(--state-danger-soft)] px-1 text-[9px] font-bold text-[color:var(--state-danger)]">
                    nghỉ?
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {dangChon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDangChon(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-[var(--bong-the)]">
            <h3 className="mb-1 text-sm font-semibold tracking-tight text-foreground">
              Đăng ký ca · {dangChon}
            </h3>

            {banGhi?.status === "LEAVE_REQUESTED" && (
              <p className="mb-2 text-xs font-medium text-[color:var(--state-danger)]">
                Đang ở trạng thái xin nghỉ khẩn.
              </p>
            )}

            {tietDay.length > 0 && (
              <div className="mb-2 rounded-lg bg-[color:var(--state-info-soft)] p-2 text-xs text-[color:var(--state-info)]">
                <p className="font-semibold">📚 Ngày này bạn có tiết dạy:</p>
                <ul className="mt-0.5 space-y-0.5">
                  {tietDay.map((t, k) => (
                    <li key={k}>
                      lúc <b>{t.start}</b>
                      {t.end ? `–${t.end}` : ""} ({t.label})
                    </li>
                  ))}
                </ul>
                <p className="mt-1">
                  Hãy chọn ca <b>phủ</b> giờ dạy ở trên.
                </p>
              </div>
            )}

            {tietDay.length > 0 && teachingUncovered(caDaChon, tietDay) && (
              <p className="mb-2 rounded-lg bg-[color:var(--state-warning-soft)] px-2 py-1.5 text-xs font-medium text-[color:var(--state-warning)]">
                ⚠ Ca đang chọn chưa phủ giờ có tiết dạy.
              </p>
            )}

            <div className="space-y-2">
              {SHIFT_ORDER.map((s) => {
                const bat_ = caDaChon.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => bat(s)}
                    disabled={dangChay}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40",
                      bat_
                        ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary-ink)]"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span className="font-medium">{SHIFT_DEFS[s].label}</span>
                    <span className="text-xs">
                      {SHIFT_DEFS[s].start}–{SHIFT_DEFS[s].end}
                      {bat_ ? " ✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <textarea
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              disabled={dangChay}
              rows={2}
              placeholder="Ghi chú (vd: lý do xin nghỉ)…"
              className="mt-3 w-full resize-y rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30"
            />

            {canhBao && (
              <p className="mt-2 rounded-lg bg-[color:var(--state-warning-soft)] px-2 py-1.5 text-xs text-[color:var(--state-warning)]">
                {canhBao}
              </p>
            )}

            <p className="mt-2 text-xs text-muted-foreground">Bỏ chọn hết = xin nghỉ cả ngày.</p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={luu}
                disabled={dangChay}
                className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-semibold text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] disabled:opacity-50"
              >
                {dangChay ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                type="button"
                onClick={() => setDangChon(null)}
                className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
