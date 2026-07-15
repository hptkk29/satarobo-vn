"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ListToolbar, type SelectFilter } from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";

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
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  COMPLETED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  RECRUITING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PLANNED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
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

  // Options lọc suy từ chính dữ liệu (khoá học + trạng thái đang có).
  const courseOptions = useMemo<SelectFilter["options"]>(() => {
    const names = [...new Set(rows.map((r) => r.course))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    return [{ value: ALL, label: "Tất cả khoá học" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [rows]);

  const statusOptions = useMemo<SelectFilter["options"]>(() => {
    const present = [...new Set(rows.map((r) => r.status))];
    const ordered = Object.keys(CLASS_STATUS_LABEL).filter((s) => present.includes(s));
    return [
      { value: ALL, label: "Mọi trạng thái" },
      ...ordered.map((s) => ({ value: s, label: CLASS_STATUS_LABEL[s]! })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (course !== ALL && r.course !== course) return false;
      if (status !== ALL && r.status !== status) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.code?.toLowerCase().includes(q) ?? false) ||
        r.course.toLowerCase().includes(q)
      );
    });
  }, [rows, query, course, status]);

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
      />

      <div className="t-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-5 py-3">
                  Lớp
                </th>
                <th scope="col" className="px-5 py-3">
                  Khoá học
                </th>
                <th scope="col" className="px-5 py-3">
                  Lịch học
                </th>
                <th scope="col" className="px-5 py-3">
                  Sĩ số
                </th>
                <th scope="col" className="px-5 py-3">
                  Cần xử lý
                </th>
                <th scope="col" className="px-5 py-3">
                  Trạng thái
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  <span className="sr-only">Mở lớp</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không có lớp khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`?classId=${r.id}`}
                        className="rounded-sm font-semibold text-foreground outline-none hover:text-orange-700 hover:underline focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-orange-300"
                      >
                        {r.name}
                      </Link>
                      {(r.code || r.center) && (
                        <p className="text-xs text-muted-foreground">
                          {[r.code, r.center].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-foreground">{r.course}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
                      {r.schedule || "—"}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
                      {r.enrolled}/{r.capacity}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {r.pending > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                          {r.pending} điểm danh
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Hoàn tất
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <ClassStatusPill status={r.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`?classId=${r.id}`}
                        className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-orange-600 outline-none hover:text-orange-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
                      >
                        Mở lớp <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Empty state khi GV chưa được phân công lớp — tách để server tái dùng. */
export function ClassListEmpty() {
  return <EmptyState icon={ClipboardCheck} title="Bạn chưa được phân công lớp nào." />;
}
