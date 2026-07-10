import * as React from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

/**
 * Bảng dữ liệu generic — port từ TeachUI.
 *
 * Khác bản gốc ở chỗ ràng buộc `T extends { id?: ... }` thay vì
 * `Record<string, any>` (repo bật TS strict, cấm `any`). Cột không có `render`
 * đọc `row[key]` qua một phép ép kiểu hẹp và chỉ chấp nhận giá trị render được.
 */
type Cell = React.ReactNode;

export function DataTable<T extends object>({
  columns,
  data,
  emptyMessage = "Không có dữ liệu.",
}: {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
}) {
  return (
    <div className="t-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-5 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-5 py-3.5 whitespace-nowrap text-foreground",
                        col.className,
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : ((row as Record<string, unknown>)[col.key] as Cell)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function rowKey(row: object, i: number): React.Key {
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? id : i;
}
