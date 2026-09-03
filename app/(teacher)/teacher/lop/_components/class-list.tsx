"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ListToolbar,
  type SelectFilter,
} from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { khopBatKy } from "@/lib/ui/tim-kiem";

/** Một hàng lớp — plain data từ server (đã cách ly cơ sở qua scopedDb). */
export interface ClassRow {
  id: string;
  name: string;
  code: string | null;
  center: string | null;
  course: string;
  schedule: string;
  enrolled: number;
  capacity: number;
  status: string;
  /** Số buổi (đã tới ngày) chưa điểm danh — cột "Cần xử lý". */
  pending: number;
  /**
   * Lớp có việc điểm danh để làm hay không — sĩ số > 0 VÀ có buổi đã tới ngày.
   * Tách khỏi `pending` để phân biệt "đã làm xong" với "không có gì để làm": lớp
   * Dự kiến sĩ số 0/16 chưa khai giảng từng hiện badge xanh "Hoàn tất", trùng nghĩa
   * với badge trạng thái lớp ngay cột bên cạnh (QA vòng 1, BUG-016).
   */
  hasAttendanceWork: boolean;
}

const CLASS_STATUS_LABEL: Record<string, string> = {
  PLANNED: "Dự kiến",
  RECRUITING: "Tuyển sinh",
  PENDING_APPROVAL: "Chờ duyệt",
  ACTIVE: "Đang học",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const CLASS_STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-state-success-soft text-state-success-ink",
  COMPLETED: "bg-state-info-soft text-state-info-ink",
  RECRUITING: "bg-state-warning-soft text-state-warning-ink",
  PENDING_APPROVAL: "bg-state-warning-soft text-state-warning-ink",
  PLANNED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-state-danger-soft text-state-danger-ink",
};

export function ClassStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        CLASS_STATUS_CLASS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {CLASS_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const ALL = "ALL";

export function ClassList({ rows }: { rows: ClassRow[] }) {
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [showCompleted, setShowCompleted] = useState(false);

  const completedCount = useMemo(
    () => rows.filter((r) => r.status === "COMPLETED").length,
    [rows],
  );

  // Cổng "đã hoàn thành" chạy TRƯỚC mọi bộ lọc khác: GV dạy vài khoá là lớp cũ
  // đông hơn lớp đang dạy, để lẫn vào thì lớp còn buổi cần điểm danh bị đẩy
  // xuống cuối bảng.
  const openRows = useMemo(
    () => (showCompleted ? rows : rows.filter((r) => r.status !== "COMPLETED")),
    [rows, showCompleted],
  );

  // Options lọc suy từ chính dữ liệu (khoá học + trạng thái đang có).
  const courseOptions = useMemo<SelectFilter["options"]>(() => {
    const names = [...new Set(rows.map((r) => r.course))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    return [
      { value: ALL, label: "Tất cả khoá học" },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  }, [rows]);

  // Suy từ `openRows` chứ không phải `rows`: nếu vẫn đọc `rows` thì dropdown còn
  // option "Hoàn thành" trong khi ô tick đang ẩn đúng nhóm đó ⇒ chọn vào là bảng
  // rỗng mà không có gì giải thích.
  const statusOptions = useMemo<SelectFilter["options"]>(() => {
    const present = [...new Set(openRows.map((r) => r.status))];
    const ordered = Object.keys(CLASS_STATUS_LABEL).filter((s) =>
      present.includes(s),
    );
    return [
      { value: ALL, label: "Mọi trạng thái" },
      ...ordered.map((s) => ({ value: s, label: CLASS_STATUS_LABEL[s]! })),
    ];
  }, [openRows]);

  // Bỏ tick trong khi đang lọc status=COMPLETED: giá trị đó vừa biến mất khỏi
  // options nên trigger của Base UI Select hiện nhãn RỖNG (nó tra label theo
  // options) và bảng trắng — trả về "Mọi trạng thái" để hai điều khiển không chọi
  // nhau.
  function toggleShowCompleted(next: boolean) {
    setShowCompleted(next);
    if (!next && status === "COMPLETED") setStatus(ALL);
  }

  const filtered = useMemo(() => {
    return openRows.filter((r) => {
      if (course !== ALL && r.course !== course) return false;
      if (status !== ALL && r.status !== status) return false;
      // BỎ DẤU khi so (lib/ui/tim-kiem) — gõ không dấu là cách gõ mặc định.
      return khopBatKy([r.name, r.code, r.course], query);
    });
  }, [openRows, query, course, status]);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo tên lớp, mã lớp, khoá học..."
        filters={[
          { value: course, onChange: setCourse, options: courseOptions },
          { value: status, onChange: setStatus, options: statusOptions },
        ]}
        // Dùng slot `actions` sẵn có thay vì thêm prop cho ListToolbar — 9 màn
        // khác của site GV cũng dựng trên component này, đổi chữ ký là đụng cả 9.
        // GV chưa dạy xong lớp nào thì ô tick không ẩn được gì ⇒ không render.
        actions={
          completedCount > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium whitespace-nowrap text-muted-foreground">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => toggleShowCompleted(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary-ink focus:ring-primary"
              />
              Hiện lớp đã hoàn thành ({completedCount})
            </label>
          ) : undefined
        }
      />

      <div className="t-card overflow-hidden">
        <PhanTrangBang cuonNgang>
          <table className="min-w-[880px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-4 py-3">
                  Lớp
                </th>
                <th scope="col" className="px-4 py-3">
                  Khoá học
                </th>
                <th scope="col" className="px-4 py-3">
                  Lịch học
                </th>
                <th scope="col" className="px-4 py-3">
                  Sĩ số
                </th>
                <th scope="col" className="px-4 py-3">
                  Cần xử lý
                </th>
                <th scope="col" className="px-4 py-3">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">Mở lớp</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-sm text-muted-foreground"
                  >
                    {/* Nói rõ phần đang bị cổng "hoàn thành" chặn, kẻo GV vừa
                        lọc xong thấy bảng trắng lại tưởng mất lớp. */}
                    {!showCompleted && completedCount > 0
                      ? `Không có lớp khớp bộ lọc — ${completedCount} lớp đã hoàn thành đang ẩn.`
                      : "Không có lớp khớp bộ lọc."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3.5">
                      <Link
                        href={`?classId=${r.id}`}
                        className="rounded-sm font-semibold text-foreground outline-none hover:text-primary-ink-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {r.name}
                      </Link>
                      {(r.code || r.center) && (
                        <p className="text-xs text-muted-foreground">
                          {[r.code, r.center].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    {/* KHÔNG whitespace-nowrap: tên khoá dài ("Combo — Full Lộ Trình
                        Luyện Thi") là ô đẩy bảng lên 1108px, vượt khung 958px của
                        laptop 1280 ⇒ phải cuộn ngang mới thấy cột Trạng thái. */}
                    <td className="min-w-[9rem] px-4 py-3.5 text-foreground">
                      {r.course}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground">
                      {r.schedule || "—"}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-foreground">
                      {r.enrolled}/{r.capacity}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {!r.hasAttendanceWork ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : r.pending > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-state-warning-soft px-2.5 py-1 text-xs font-semibold text-state-warning-ink">
                          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                          {r.pending} điểm danh
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-state-success-soft px-2.5 py-1 text-xs font-semibold text-state-success-ink">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Hoàn tất
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <ClassStatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`?classId=${r.id}`}
                        className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary-ink outline-none hover:text-primary-ink-hover focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Mở lớp <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PhanTrangBang>
      </div>
    </>
  );
}

/** Empty state khi GV chưa được phân công lớp — tách để server tái dùng. */
export function ClassListEmpty() {
  return (
    <EmptyState
      icon={ClipboardCheck}
      title="Bạn chưa được phân công lớp nào."
    />
  );
}
