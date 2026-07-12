"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardPen, Clock, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ListToolbar, type SelectFilter } from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";

/** Học viên Trial (plain — câu 46: KHÔNG có phụ huynh). */
export interface TrialStudentView {
  enrollmentId: string;
  studentName: string;
  birthYear: number | null;
  courseName: string | null;
  status: string; // ACTIVE | COMPLETED | WITHDRAWN
}

/** Một buổi Trial (slot) — plain data từ server (date đã format sẵn). */
export interface TrialSlotView {
  sessionId: string;
  trialClassName: string;
  dateKey: string; // YYYY-MM-DD — nhóm theo ngày
  dateLabel: string; // "Chủ Nhật, 05/07/2026"
  timeLabel: string; // "09:00-10:30"
  status: string; // SCHEDULED | COMPLETED
  students: TrialStudentView[];
}

const SESSION_STATUS: Record<string, { label: string; cls: string }> = {
  SCHEDULED: {
    label: "Đã hẹn",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  COMPLETED: {
    label: "Đã dạy",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  },
};

const ALL = "ALL";

export function TrialList({ slots }: { slots: TrialSlotView[] }) {
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const slotOptions = useMemo<SelectFilter["options"]>(() => {
    const times = [...new Set(slots.map((s) => s.timeLabel))].sort();
    return [{ value: ALL, label: "Tất cả khung giờ" }, ...times.map((t) => ({ value: t, label: t }))];
  }, [slots]);

  const statusOptions: SelectFilter["options"] = [
    { value: ALL, label: "Mọi tình trạng" },
    { value: "SCHEDULED", label: "Đã hẹn" },
    { value: "COMPLETED", label: "Đã dạy" },
  ];

  // Lọc slot theo khung giờ + tình trạng; lọc HV trong slot theo từ khoá tên.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return slots
      .filter((s) => (slot === ALL || s.timeLabel === slot) && (status === ALL || s.status === status))
      .map((s) => ({
        ...s,
        students: q
          ? s.students.filter((st) => st.studentName.toLowerCase().includes(q))
          : s.students,
      }))
      .filter((s) => !q || s.students.length > 0);
  }, [slots, query, slot, status]);

  // Nhóm theo ngày (giữ thứ tự đã sort của server).
  const byDate = useMemo(() => {
    const m = new Map<string, { dateLabel: string; slots: typeof filtered }>();
    for (const s of filtered) {
      const g = m.get(s.dateKey) ?? { dateLabel: s.dateLabel, slots: [] };
      g.slots.push(s);
      m.set(s.dateKey, g);
    }
    return [...m.values()];
  }, [filtered]);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo tên học viên..."
        filters={[
          { value: slot, onChange: setSlot, options: slotOptions },
          { value: status, onChange: setStatus, options: statusOptions },
        ]}
      />

      {slots.length === 0 ? (
        <EmptyState icon={Sparkles} title="Bạn chưa phụ trách buổi Trial nào." />
      ) : byDate.length === 0 ? (
        <EmptyState icon={Sparkles} title="Không có buổi Trial khớp bộ lọc." />
      ) : (
        <div className="space-y-6">
          {byDate.map((day) => (
            <section key={day.dateLabel} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">
                  {day.dateLabel}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {day.slots.reduce((n, s) => n + s.students.length, 0)} học viên
                </span>
              </div>

              {day.slots.map((s) => {
                const st = SESSION_STATUS[s.status] ?? {
                  label: s.status,
                  cls: "bg-muted text-muted-foreground",
                };
                return (
                  <div key={s.sessionId} className="t-card overflow-hidden">
                    <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-5 py-3">
                      <Clock className="h-4 w-4 text-orange-500" aria-hidden />
                      <span className="text-sm font-bold text-foreground">{s.timeLabel}</span>
                      <span className="text-sm text-muted-foreground">· {s.trialClassName}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {s.students.length} học viên
                      </span>
                      <span
                        className={cn(
                          "ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                          st.cls,
                        )}
                      >
                        {st.label}
                      </span>
                    </header>

                    {s.students.length === 0 ? (
                      <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                        Buổi chưa xếp học viên nào.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-border text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                              <th scope="col" className="px-5 py-2.5">Học viên</th>
                              <th scope="col" className="px-5 py-2.5">Khóa học</th>
                              <th scope="col" className="px-5 py-2.5 text-right">Đánh giá</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.students.map((st2) => (
                              <tr
                                key={st2.enrollmentId}
                                className="border-b border-border/60 last:border-0"
                              >
                                <td className="px-5 py-3">
                                  <p className="font-medium text-foreground">{st2.studentName}</p>
                                  {st2.birthYear && (
                                    <p className="text-xs text-muted-foreground">{st2.birthYear}</p>
                                  )}
                                </td>
                                <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                                  {st2.courseName ?? "—"}
                                </td>
                                <td className="px-5 py-3 text-right whitespace-nowrap">
                                  <Link
                                    href={`?sessionId=${s.sessionId}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <ClipboardPen className="h-3.5 w-3.5" aria-hidden /> Nhập phiếu
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
