// app/(teacher)/teacher/tai-lieu/_components/lesson-filter-list.tsx
//
// Client: danh sách bài giảng theo buổi (mức b) + BỘ LỌC ĐỊNH DẠNG giáo án.
// Tách khỏi page.tsx (server) để lọc HIỂN THỊ phía client mà không đổi query:
//   - "Tất cả"        → mọi buổi.
//   - "SCORM"         → chỉ buổi có bài giảng SCORM (l.scorm != null).
//   - "PDF (tài liệu)"→ chỉ buổi có Document đính kèm (l.documents.length > 0).
//
// Cam-only (KHÔNG tím). Segmented control theo mẫu ToggleLink ở /teacher/lich.
// Ghi chú: khi SCORM tắt (scormOn=false) mọi buổi có l.scorm=null → nút "SCORM"
// sẽ luôn lọc ra rỗng, nên ta ẨN nút SCORM lúc đó (UX gọn, tránh filter chết).
// Giữ nguyên markup: SCORM viewer link + tài liệu đính kèm + "Bài tập về nhà".
"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileText, List, NotebookPen, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState } from "../../_components/ui/empty-state";

/** Một buổi bài giảng — plain data từ server (page.tsx). */
export type LessonView = {
  id: string;
  order: number;
  title: string;
  objectives: string[];
  homework: string | null;
  scorm: { id: string; name: string; sessionId: string | null } | null;
  documents: { id: string; title: string; fileUrl: string; typeLabel: string }[];
};

type DocFilter = "all" | "scorm" | "pdf";

export function LessonFilterList({
  lessonViews,
  scormOn,
}: {
  lessonViews: LessonView[];
  scormOn: boolean;
}) {
  const [filter, setFilter] = useState<DocFilter>("all");

  // SCORM tắt → ẩn nút SCORM (filter chết) + ép về "all" nếu đang ở "scorm".
  const activeFilter: DocFilter = !scormOn && filter === "scorm" ? "all" : filter;

  const options = useMemo(
    () =>
      [
        { key: "all" as const, label: "Tất cả", icon: List },
        ...(scormOn ? [{ key: "scorm" as const, label: "SCORM", icon: Play }] : []),
        { key: "pdf" as const, label: "PDF (tài liệu)", icon: FileText },
      ] satisfies { key: DocFilter; label: string; icon: typeof List }[],
    [scormOn],
  );

  const filtered = useMemo(() => {
    if (activeFilter === "scorm") return lessonViews.filter((l) => l.scorm != null);
    if (activeFilter === "pdf") return lessonViews.filter((l) => l.documents.length > 0);
    return lessonViews;
  }, [lessonViews, activeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex rounded-lg border border-border bg-muted/50 p-1"
          role="group"
          aria-label="Lọc theo định dạng giáo án"
        >
          {options.map((o) => {
            const Icon = o.icon;
            const active = activeFilter === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setFilter(o.key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-card text-orange-700 shadow-sm dark:text-orange-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {o.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} buổi</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Không có buổi học khớp bộ lọc định dạng." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((l) => (
            <li key={l.id} className="t-card relative overflow-hidden p-4">
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-orange-400 to-orange-600" />
              <div className="space-y-3 pl-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                        {l.order}
                      </span>
                      <h2 className="text-base font-semibold text-foreground">{l.title}</h2>
                    </div>
                    {l.objectives.length > 0 && (
                      <p className="mt-0.5 line-clamp-2 pl-8 text-xs text-muted-foreground">
                        {l.objectives.join(" · ")}
                      </p>
                    )}
                  </div>

                  {scormOn && l.scorm && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300"
                      >
                        Bài giảng SCORM
                      </Badge>
                      <a
                        href={
                          l.scorm.sessionId
                            ? `/teacher/scorm/play/${l.scorm.id}?sessionId=${l.scorm.sessionId}`
                            : `/teacher/scorm/play/${l.scorm.id}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.scorm.name}
                        className="inline-flex items-center gap-1 rounded-md border border-orange-200 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-500/10"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden /> Mở trình chiếu
                      </a>
                    </div>
                  )}
                </div>

                {l.documents.length > 0 ? (
                  <ul className="space-y-1.5 pl-8">
                    {l.documents.map((d) => (
                      <li key={d.id}>
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex max-w-full items-center gap-2 text-sm text-foreground hover:text-orange-700 dark:hover:text-orange-300"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-orange-500" aria-hidden />
                          <span className="truncate font-medium">{d.title}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {d.typeLabel}
                          </Badge>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pl-8 text-xs text-muted-foreground">
                    {scormOn && l.scorm
                      ? "Không có tài liệu đính kèm khác."
                      : "Buổi này chưa có tài liệu."}
                  </p>
                )}

                {l.homework && (
                  <div className="ml-8 rounded-lg border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
                    <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-orange-700 uppercase dark:text-orange-300">
                      <NotebookPen className="h-3.5 w-3.5" aria-hidden /> Bài tập về nhà
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">{l.homework}</p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
