"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { ListToolbar, type SelectFilter } from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";

/** Một hàng bài tập đã giao — plain data từ server. */
export interface AssignmentRow {
  id: string;
  title: string;
  /** Lớp của bài — dùng link sang trang lớp (/teacher/lop?classId=…). */
  classId: string;
  className: string;
  /** true = có câu hỏi (trắc nghiệm/kiểm tra); false = bài tập tự luận/nộp tệp. */
  isTest: boolean;
  /** true = giao từ template thư viện admin; false = GV tự tạo trực tiếp. */
  fromAdmin: boolean;
  due: string | null;
  submitted: number;
  total: number;
  /** AssignmentStatus: PUBLISHED | CLOSED (chỉ hiện bài ĐÃ GIAO). */
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Đang mở",
  CLOSED: "Đã đóng",
};
const STATUS_CLASS: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  CLOSED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
};

const ALL = "ALL";

export function AssignmentList({ rows }: { rows: AssignmentRow[] }) {
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState(ALL);
  const [kind, setKind] = useState(ALL); // ALL | test | homework
  const [status, setStatus] = useState(ALL);

  const classOptions = useMemo<SelectFilter["options"]>(() => {
    const names = [...new Set(rows.map((r) => r.className))].sort((a, b) => a.localeCompare(b, "vi"));
    return [{ value: ALL, label: "Tất cả lớp" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [rows]);

  const kindOptions: SelectFilter["options"] = [
    { value: ALL, label: "Mọi hình thức" },
    { value: "test", label: "Kiểm tra" },
    { value: "homework", label: "Bài tập" },
  ];

  const statusOptions = useMemo<SelectFilter["options"]>(() => {
    const present = [...new Set(rows.map((r) => r.status))];
    const ordered = Object.keys(STATUS_LABEL).filter((s) => present.includes(s));
    return [
      { value: ALL, label: "Mọi trạng thái" },
      ...ordered.map((s) => ({ value: s, label: STATUS_LABEL[s]! })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (cls !== ALL && r.className !== cls) return false;
      if (kind === "test" && !r.isTest) return false;
      if (kind === "homework" && r.isTest) return false;
      if (status !== ALL && r.status !== status) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || r.className.toLowerCase().includes(q);
    });
  }, [rows, query, cls, kind, status]);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo tên bài, lớp..."
        filters={[
          { value: cls, onChange: setCls, options: classOptions },
          { value: kind, onChange: setKind, options: kindOptions },
          { value: status, onChange: setStatus, options: statusOptions },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={PencilLine} title="Chưa có bài tập nào được giao ở lớp bạn phụ trách." />
      ) : (
        <div className="t-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-3">Nội dung</th>
                  <th scope="col" className="px-5 py-3">Lớp</th>
                  <th scope="col" className="px-5 py-3">Hình thức</th>
                  <th scope="col" className="px-5 py-3">Nguồn</th>
                  <th scope="col" className="px-5 py-3">Hạn nộp</th>
                  <th scope="col" className="px-5 py-3">Đã nộp</th>
                  <th scope="col" className="px-5 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Không có bài tập khớp bộ lọc.
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
                          href={`?assignmentId=${r.id}`}
                          className="rounded-sm font-medium text-foreground outline-none hover:text-orange-600 focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-orange-400"
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Link
                          href={`/teacher/lop?classId=${r.classId}`}
                          className="rounded-sm font-medium text-orange-600 outline-none hover:text-orange-700 hover:underline focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400 dark:hover:text-orange-300"
                        >
                          {r.className}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {r.isTest ? (
                          <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                            Kiểm tra
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                            Bài tập
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          {r.fromAdmin ? (
                            <>
                              <BookMarked className="h-4 w-4" aria-hidden />
                              Admin
                            </>
                          ) : (
                            <>
                              <PencilLine className="h-4 w-4" aria-hidden />
                              Tự tạo
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
                        {r.due ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
                        {r.submitted}/{r.total}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                            STATUS_CLASS[r.status] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
