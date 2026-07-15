"use client";

// app/(teacher)/teacher/hoc-ba/_components/report-cards-list.tsx — #06 (L6):
// bảng LIST học bạ site GV + tìm kiếm HV + lọc Khoá học/Trạng thái (client).
//
// Nhận `rows` PLAIN từ server (page.tsx đã scopedDb + gác IDOR + precompute mốc buổi
// và cột tổng quan) → chỉ lọc/hiển thị. KHÔNG đọc DB, KHÔNG contact PH (câu 46: chỉ
// tên + mã HV). Cam-only orange, shadcn/base-ui. Dùng ListToolbar chung của site GV.
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileDown, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";

export type ReportCardStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "RECALLED";

export type MilestoneChip = {
  milestone: number;
  state: "pending" | "missing" | "done";
  text: string;
  label: string;
};

export interface ReportCardRow {
  enrollmentId: string;
  studentName: string;
  studentCode: string | null;
  className: string;
  courseName: string;
  status: ReportCardStatus | null;
  statusLabel: string | null;
  editableByTeacher: boolean;
  attendedSessions: number;
  totalSessions: number;
  /** Điểm TB bài tập đã chấm (thang 10) — null nếu chưa có bài chấm. */
  avgScore: number | null;
  updatedAtLabel: string | null;
  hasCard: boolean;
  milestones: MilestoneChip[];
}

// Màu pill trạng thái — đồng bộ ngữ nghĩa trang admin /admin/report-cards, có biến thể
// Tối để không chìm trên nền tối của site GV.
const STATUS_CLASS: Record<ReportCardStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING_REVIEW: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  RECALLED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const MILESTONE_CLASS: Record<MilestoneChip["state"], string> = {
  pending: "border border-border text-muted-foreground",
  missing: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Mọi trạng thái" },
  { value: "none", label: "Chưa có học bạ" },
  { value: "DRAFT", label: "Nháp" },
  { value: "PENDING_REVIEW", label: "Chờ duyệt" },
  { value: "PUBLISHED", label: "Đã phát hành" },
  { value: "RECALLED", label: "Đã thu hồi" },
];

const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

export function ReportCardsList({ rows }: { rows: ReportCardRow[] }) {
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [status, setStatus] = useState("all");

  const courses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.courseName))).sort((a, b) => a.localeCompare(b, "vi")),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchQ =
        !q ||
        r.studentName.toLowerCase().includes(q) ||
        (r.studentCode?.toLowerCase().includes(q) ?? false);
      const matchCourse = course === "all" || r.courseName === course;
      const matchStatus =
        status === "all" ||
        (status === "none" ? r.status === null : r.status === status);
      return matchQ && matchCourse && matchStatus;
    });
  }, [rows, query, course, status]);

  return (
    <div>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo tên học viên, mã HV..."
        filters={[
          {
            value: course,
            onChange: setCourse,
            options: [
              { value: "all", label: "Tất cả khoá học" },
              ...courses.map((c) => ({ value: c, label: c })),
            ],
          },
          {
            value: status,
            onChange: setStatus,
            options: STATUS_FILTER_OPTIONS,
          },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Không tìm thấy học viên"
          description="Thử đổi từ khoá tìm kiếm hoặc bộ lọc."
        />
      ) : (
        <section className="t-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3">Học viên</th>
                  <th scope="col" className="px-4 py-3">Khoá học</th>
                  <th scope="col" className="px-4 py-3">Chuyên cần</th>
                  <th scope="col" className="px-4 py-3">Điểm TB</th>
                  <th scope="col" className="px-4 py-3">Trạng thái học bạ</th>
                  <th scope="col" className="px-4 py-3">Mốc buổi</th>
                  <th scope="col" className="px-4 py-3">Cập nhật</th>
                  <th scope="col" className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.enrollmentId}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                          {initials(r.studentName)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{r.studentName}</p>
                          {r.studentCode ? (
                            <p className="text-xs text-muted-foreground">{r.studentCode}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{r.courseName}</p>
                      <p className="text-xs text-muted-foreground">{r.className}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.totalSessions > 0 ? (
                        <>
                          <span className="font-semibold text-foreground">
                            {r.attendedSessions}/{r.totalSessions}
                          </span>
                          <span className="text-xs text-muted-foreground"> buổi</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.avgScore != null ? (
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          {r.avgScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={r.status} label={r.statusLabel} />
                        {r.editableByTeacher ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
                          >
                            GV sửa được
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.milestones.map((m) => (
                          <span
                            key={m.milestone}
                            title={m.label}
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${MILESTONE_CLASS[m.state]}`}
                          >
                            {m.text}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {r.updatedAtLabel ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {r.status === "PUBLISHED" && (
                          <a
                            href={`/teacher/hoc-ba/pdf/${r.enrollmentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                          >
                            <FileDown className="h-3.5 w-3.5" aria-hidden /> Xuất học bạ
                          </a>
                        )}
                        {/* href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host
                            giaovien (clean URL /hoc-ba) LẪN localhost (/teacher/hoc-ba). */}
                        <Link
                          href={`?enrollmentId=${r.enrollmentId}`}
                          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700"
                        >
                          {r.hasCard ? "Mở học bạ" : "Nhập học bạ"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status, label }: { status: ReportCardStatus | null; label: string | null }) {
  if (!status || !label) return <span className="text-xs text-muted-foreground">Chưa có</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {label}
    </span>
  );
}
