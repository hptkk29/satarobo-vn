"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { ENROLLMENT_STATUS } from "@/lib/labels/registry";
import {
  ListToolbar,
  type SelectFilter,
} from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";
import { initialsOf } from "@/lib/ui/initials";

/** 1 học viên gộp các lớp mình phụ trách (câu 46: KHÔNG contact PH). */
export interface StudentRow {
  id: string;
  name: string;
  studentCode: string | null;
  classes: string[];
  status: string; // EnrollmentStatus
}

const ALL = "ALL";

export function StudentList({ rows }: { rows: StudentRow[] }) {
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState(ALL);

  const classOptions = useMemo<SelectFilter["options"]>(() => {
    const names = [...new Set(rows.flatMap((r) => r.classes))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    return [
      { value: ALL, label: "Tất cả lớp" },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (cls !== ALL && !r.classes.includes(cls)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.studentCode?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, cls]);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo tên hoặc mã học viên..."
        filters={[{ value: cls, onChange: setCls, options: classOptions }]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Không tìm thấy học viên"
          description="Thử đổi từ khoá tìm kiếm hoặc bộ lọc lớp."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Link
              key={s.id}
              href={`?s=${s.id}`}
              className="t-card t-card-hover flex items-center gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink">
                {initialsOf(s.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {s.name}
                  {s.studentCode ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({s.studentCode})
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.classes.join(" · ")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {ENROLLMENT_STATUS.label(s.status)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
