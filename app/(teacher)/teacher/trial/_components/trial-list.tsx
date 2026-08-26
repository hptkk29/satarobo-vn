"use client";

// Bảng Trial site GV — 25/08 (chủ dự án): thay lưới thẻ theo ngày bằng HAI BẢNG PHẲNG.
//
//   • "Các suất sắp Trial" — hôm nay → hết 7 ngày tới, xếp theo ngày tăng dần.
//     Không có suất nào trong cửa sổ đó thì KHÔNG hiện bảng (yêu cầu: "không có thì
//     không hiển thị") — chứ không hiện bảng rỗng.
//   • "Đã Trial" — nằm dưới cùng, cùng bộ cột, mới nhất lên trước.
//
// Cột: Buổi · Học viên · Phụ huynh · Khoá học · Đánh giá · Trạng thái.
// Cột "Buổi" là thứ chủ dự án không liệt kê nhưng bảng xếp theo ngày mà không in ngày
// thì giáo viên không dùng được — giữ lại, để đầu bảng.
//
// "Đánh giá" chỉ còn nút Nhập/Xem phiếu; nút "Xuất PDF" đã gỡ theo yêu cầu (route
// /teacher/trial/pdf/[enrollmentId] vẫn còn cho ai có link cũ).
//
// ⚠️ Không có `new Date()` ở file này: mọi nhãn ngày đã được server format sẵn. Máy
// giáo viên không chắc chạy +07, và render server ↔ hydrate client lệch là vỡ trang.

import Link from "next/link";
import { CalendarClock, ClipboardList } from "lucide-react";
import type { TrialRowStatus } from "@/lib/lms/teacher-schedule";
import { EmptyState } from "../../_components/ui/empty-state";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

/** 1 dòng bảng — server đã format sẵn ngày giờ. */
export type TrialRowView = {
  enrollmentId: string;
  /** Buổi đang xếp cho ca — đi kèm trong link chấm phiếu (GĐ4: mỗi buổi một phiếu). */
  sessionId: string | null;
  /** "CN, 05/07" | "" (chưa xếp buổi). */
  dateLabel: string;
  /** "09:00–10:30" | "". */
  timeLabel: string;
  trialClassName: string;
  /** "Hoàng Gia Bảo - 2016" — server ghép sẵn cả năm sinh. */
  studentLabel: string;
  parentName: string | null;
  courseName: string | null;
  status: TrialRowStatus;
  evaluated: boolean;
};

const STATUS_LABEL: Record<TrialRowStatus, string> = {
  upcoming: "Sắp tới",
  rescheduled: "Bị dời lịch",
  "awaiting-eval": "Chờ đánh giá",
  evaluated: "Đã đánh giá",
  enrolled: "Đã nhập học · +1% HH",
  lost: "Bị rớt",
  withdrawn: "Đã rút",
};

const STATUS_CLASS: Record<TrialRowStatus, string> = {
  upcoming: "bg-state-info-soft text-state-info-ink",
  rescheduled: "bg-state-warning-soft text-state-warning-ink",
  "awaiting-eval": "bg-state-warning-soft text-state-warning-ink",
  evaluated: "bg-muted text-muted-foreground",
  enrolled: "bg-state-success-soft text-state-success-ink",
  lost: "bg-state-danger-soft text-state-danger-ink",
  withdrawn: "bg-muted text-muted-foreground",
};

function StatusPill({ status }: { status: TrialRowStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function TrialTable({ rows }: { rows: TrialRowView[] }) {
  return (
    <div className="t-card overflow-hidden">
      {/* Thanh phân trang nằm NGOÀI vùng cuộn ngang: để trong thì cuộn sang phải là
          nút chuyển trang trôi mất khỏi màn. */}
      <PhanTrangBang cuonNgang tenDonVi="suất Trial">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="px-5 py-3">
                Buổi
              </th>
              <th scope="col" className="px-5 py-3">
                Học viên
              </th>
              <th scope="col" className="px-5 py-3">
                Phụ huynh
              </th>
              <th scope="col" className="px-5 py-3">
                Khoá học
              </th>
              <th scope="col" className="px-5 py-3">
                Đánh giá
              </th>
              <th scope="col" className="px-5 py-3">
                Trạng thái
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.enrollmentId}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
              >
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <p className="font-semibold text-foreground">
                    {r.dateLabel || "Chưa xếp buổi"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[r.timeLabel, r.trialClassName].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="px-5 py-3.5 font-medium text-foreground">
                  {r.studentLabel}
                </td>
                <td className="px-5 py-3.5 text-foreground">
                  {r.parentName ?? "—"}
                </td>
                <td className="px-5 py-3.5 text-foreground">
                  {r.courseName ?? "—"}
                </td>
                <td className="px-5 py-3.5">
                  <Link
                    // GĐ4 — kèm `sessionId` của ĐÚNG buổi đang đứng. Thiếu nó thì server
                    // rơi về buổi đang xếp của ca, và giáo viên chấm buổi 2 lại sửa đè
                    // phiếu buổi 1 (khoá phiếu là cặp ca × buổi).
                    href={
                      r.sessionId
                        ? `?enrollmentId=${r.enrollmentId}&sessionId=${r.sessionId}`
                        : `?enrollmentId=${r.enrollmentId}`
                    }
                    className={
                      r.evaluated
                        ? "inline-flex whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                        : "inline-flex whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    }
                  >
                    {r.evaluated ? "Xem phiếu" : "Nhập phiếu"}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <StatusPill status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PhanTrangBang>
    </div>
  );
}

export function TrialList({
  upcoming,
  done,
  windowDays,
}: {
  upcoming: TrialRowView[];
  done: TrialRowView[];
  windowDays: number;
}) {
  if (upcoming.length === 0 && done.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Chưa có suất Trial nào"
        description="Buổi trải nghiệm bạn phụ trách sẽ hiện ở đây ngay khi quản lý xếp lịch."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Rỗng thì KHÔNG dựng bảng — yêu cầu 25/08: "không có thì không hiển thị". */}
      {upcoming.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">
              Các suất sắp Trial ({upcoming.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Từ hôm nay đến hết {windowDays} ngày tới
            </p>
          </div>
          <TrialTable rows={upcoming} />
        </section>
      )}

      {done.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">
              Đã Trial ({done.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Buổi đã diễn ra và các suất đã có kết quả
            </p>
          </div>
          <TrialTable rows={done} />
        </section>
      )}

      {upcoming.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          Không có suất Trial nào trong {windowDays} ngày tới.
        </p>
      )}
    </div>
  );
}
