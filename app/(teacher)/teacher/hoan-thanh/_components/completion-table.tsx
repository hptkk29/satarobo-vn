"use client";

// Bảng học viên của 1 lớp ở màn "Hoàn thành khoá" — TÁCH client cho ô tìm kiếm.
// Server (page.tsx) giữ nguyên scopedDb + computeAttendanceSummary rồi truyền
// rows PLAIN xuống đây; component chỉ render + lọc theo tên (client).
// ⚠️ Câu 46: payload chỉ TÊN học viên — KHÔNG SĐT/email/tên phụ huynh.

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "../../_components/ui/list-toolbar";

export type CompletionTableRow = {
  /** enrollment id — key ổn định. */
  id: string;
  name: string;
  attended: number;
  absent: number;
  needMakeup: number;
  /** có CourseCompletion (đã xác nhận hoàn thành). */
  passed: boolean;
  certificateCode: string | null;
  /** ngày hoàn thành đã format sẵn trên server (tránh truyền Date/format ở client). */
  completedAtLabel: string | null;
};

/** Initials avatar (đồng bộ hoc-ba — không thêm dependency). */
const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

export function CompletionTable({
  rows,
  completedSessions,
}: {
  rows: CompletionTableRow[];
  /** số buổi đã dạy của lớp — mẫu số hiển thị chuyên cần. */
  completedSessions: number;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo tên học viên..."
      />

      <section className="t-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3">Học viên</th>
                <th scope="col" className="px-4 py-3">Chuyên cần</th>
                <th scope="col" className="px-4 py-3">Kết quả</th>
                <th scope="col" className="px-4 py-3">Hoàn thành khoá</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Không tìm thấy học viên phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                          {initials(r.name)}
                        </span>
                        <span className="font-medium text-foreground">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {completedSessions === 0 ? (
                        <span className="text-xs text-muted-foreground">Chưa có buổi nào</span>
                      ) : (
                        <div>
                          <p className="font-medium text-foreground">
                            {r.attended}/{completedSessions} buổi
                          </p>
                          {r.absent > 0 || r.needMakeup > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Vắng {r.absent}
                              {r.needMakeup > 0 ? ` · chờ bù ${r.needMakeup}` : ""}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.passed ? (
                        <Badge
                          variant="outline"
                          className="w-fit border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                        >
                          Đạt
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.passed ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge
                            variant="outline"
                            className="w-fit border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                          >
                            Đã hoàn thành · {r.certificateCode}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {r.completedAtLabel}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa hoàn thành</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
