/**
 * Site Sale — hai khối "việc trong tầm tay" của màn `/sale/dashboard`:
 *   · "Việc cần làm"        (phiếu follow-up quá hạn + đến hạn hôm nay)
 *   · "Trải nghiệm sắp tới" (buổi học thử của khách do tôi phụ trách)
 *
 * ── ĐƯỜNG DẪN ──────────────────────────────────────────────────────────────
 * Bản admin trỏ `/leads/{id}`. Trên host Sale đường đó thành `/sale/leads/{id}`
 * → 404. Bản Sale trỏ thẳng `/sale/khach-cua-toi/{id}` — màn hồ sơ khách dành
 * cho người trực tiếp chăm khách, và là màn ĐÚNG cho ngữ cảnh này.
 *
 * ── MÀU ────────────────────────────────────────────────────────────────────
 * Chỉ ngày HẾT HẠN của việc quá hạn được tô, và chỉ nó. Tô cả dòng (hoặc cả
 * cột ngày) là làm màu mất nghĩa: khi mọi dòng đều kêu thì không dòng nào nổi.
 * Cùng kết luận đã ghi ở `app/(sale)/sale/khach-cua-toi/_components/lead-table.tsx`
 * sau khi bản sửa lần một làm 8/11 dòng đỏ.
 */
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { TieuDeNhom } from "@/components/sale/ui/dai-so-lieu";
import { formatDateVN } from "@/lib/format/date";
import type { OTrial, OViec } from "@/lib/sale/dashboard";
import { LOP_KHOI } from "./khoi";

/** Trần dòng hiển thị — giữ bằng bản admin (8). */
const TRAN_DONG_VIEC = 8;

export function KhoiViecCanLam({
  quaHan,
  homNay,
  bayGio,
}: {
  quaHan: OViec[];
  homNay: OViec[];
  /**
   * Mốc "bây giờ" tính MỘT LẦN ở server rồi truyền xuống.
   *
   * Không gọi `new Date()` trong thân component: server và client vẽ ở hai thời
   * điểm khác nhau nên một việc đến hạn sát mốc sẽ đổi màu giữa HTML máy chủ và
   * lần dựng lại đầu tiên ⇒ cảnh báo hydration, và một dòng nhấp nháy đổi màu.
   */
  bayGio: number;
}) {
  const dong = [...quaHan, ...homNay].slice(0, TRAN_DONG_VIEC);

  return (
    <section className={LOP_KHOI}>
      <TieuDeNhom>
        Việc cần làm ({quaHan.length} quá hạn · {homNay.length} hôm nay)
      </TieuDeNhom>
      {dong.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Không có việc đến hạn.</p>
      ) : (
        <ul className="mt-2">
          {dong.map((t) => {
            const treHan = t.dueAt.getTime() < bayGio;
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 text-sm last:border-0"
              >
                <Link
                  href={`/sale/khach-cua-toi/${t.leadId}`}
                  className="min-w-0 truncate font-medium text-[color:var(--primary-ink)] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {t.title}
                </Link>
                <span
                  className={
                    treHan
                      ? "shrink-0 text-xs font-semibold tabular-nums text-[color:var(--state-danger)]"
                      : "shrink-0 text-xs tabular-nums text-muted-foreground"
                  }
                >
                  {formatDateVN(t.dueAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {quaHan.length + homNay.length > TRAN_DONG_VIEC ? (
        // Đếm câm là nói dối về số lượng — cùng bài học `canhBaoCat` của màn
        // "Khách của tôi". Tiêu đề nói 23 việc mà danh sách chỉ có 8 dòng thì
        // phải nói rõ 15 dòng còn lại đang ở đâu.
        <p className="mt-2 text-xs text-muted-foreground">
          Còn {quaHan.length + homNay.length - TRAN_DONG_VIEC} việc nữa —{" "}
          <Link href="/sale" className="text-[color:var(--primary-ink)] hover:underline">
            xem đủ ở Bảng việc hôm nay
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

export function KhoiTrialSapToi({ trial }: { trial: OTrial[] }) {
  return (
    <section className={LOP_KHOI}>
      <TieuDeNhom bieuTuong={<FlaskConical className="h-4 w-4 text-[color:var(--primary)]" />}>
        Trải nghiệm sắp tới
      </TieuDeNhom>
      {trial.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Chưa có buổi trải nghiệm nào.</p>
      ) : (
        <ul className="mt-2">
          {trial.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 text-sm last:border-0"
            >
              <Link
                href={`/sale/khach-cua-toi/${t.leadId}`}
                className="min-w-0 truncate font-medium text-[color:var(--primary-ink)] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {t.ten}
              </Link>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t.luc}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
