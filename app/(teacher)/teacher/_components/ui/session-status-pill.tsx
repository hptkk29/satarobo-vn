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
  SCHEDULED: "bg-state-info-soft text-state-info-ink",
  IN_PROGRESS: "bg-state-warning-soft text-state-warning-ink",
  COMPLETED: "bg-state-success-soft text-state-success-ink",
  CANCELLED: "bg-state-danger-soft text-state-danger-ink",
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
