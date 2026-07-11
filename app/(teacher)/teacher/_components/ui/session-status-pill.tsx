import { cn } from "@/lib/utils";

/**
 * Pill trạng thái BUỔI HỌC (ClassSession.status).
 *
 * Cố ý KHÔNG dùng `StatusPill` dùng chung: ở đó `completed` nghĩa là "Hoàn thành"
 * (khoá học), còn với buổi học nghĩa là "Đã dạy". Trộn hai từ điển vào một map sẽ
 * sai nghĩa ở một trong hai chỗ.
 */
export const SESSION_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Đã lên lịch",
  IN_PROGRESS: "Đang diễn ra",
  COMPLETED: "Đã dạy",
  CANCELLED: "Đã hủy",
};

const SESSION_STATUS_CLASS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export function SessionStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        SESSION_STATUS_CLASS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {SESSION_STATUS_LABEL[status] ?? status}
    </span>
  );
}
