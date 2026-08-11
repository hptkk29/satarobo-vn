"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleCheck, ClipboardCheck } from "lucide-react";
import {
  ListToolbar,
  type SelectFilter,
} from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";

/** 1 buổi đã diễn ra (plain — câu 46: chỉ metadata + đếm). */
export interface AttendanceRow {
  id: string;
  classId: string;
  className: string;
  date: string; // đã format
  time: string; // "08:00-10:00" | ""
  topic: string;
  done: boolean;
  present: number;
  roster: number;
}

const ALL = "ALL";

export function AttendanceOverview({ rows }: { rows: AttendanceRow[] }) {
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState(ALL);
  const [state, setState] = useState(ALL);

  const classOptions = useMemo<SelectFilter["options"]>(() => {
    const names = [...new Set(rows.map((r) => r.className))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    return [
      { value: ALL, label: "Tất cả lớp" },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  }, [rows]);

  const stateOptions: SelectFilter["options"] = [
    { value: ALL, label: "Mọi tình trạng" },
    { value: "pending", label: "Chưa điểm danh" },
    { value: "done", label: "Đã điểm danh" },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (cls !== ALL && r.className !== cls) return false;
      if (state === "done" && !r.done) return false;
      if (state === "pending" && r.done) return false;
      if (!q) return true;
      return (
        r.topic.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q)
      );
    });
  }, [rows, query, cls, state]);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo lớp, chủ đề..."
        filters={[
          { value: cls, onChange: setCls, options: classOptions },
          { value: state, onChange: setState, options: stateOptions },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Không tìm thấy buổi học"
          description="Thử đổi từ khoá hoặc bộ lọc."
        />
      ) : (
        <div className="t-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[770px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-3">
                    Buổi học
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Lớp
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Ngày
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Có mặt
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Điểm danh
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    <span className="sr-only">Mở</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-foreground">{r.topic}</p>
                      {r.time && (
                        <p className="text-xs text-muted-foreground">
                          {r.time}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
                      {r.className}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
                      {r.date}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-foreground">
                      {r.done ? `${r.present}/${r.roster}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {r.done ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-state-success-soft px-2.5 py-1 text-xs font-semibold text-state-success-ink">
                          <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Đã
                          xong
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-state-warning-soft px-2.5 py-1 text-xs font-semibold text-state-warning-ink">
                          Chưa điểm danh
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`/teacher/lop?classId=${r.classId}&sessionId=${r.id}`}
                        className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary-ink outline-none hover:text-primary-ink-hover focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {r.done ? "Xem" : "Điểm danh"}
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
