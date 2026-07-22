import { cn } from "@/lib/utils";

/**
 * Pill trạng thái — port từ TeachUI, map mã trạng thái sang nhãn tiếng Việt.
 *
 * `brand` (cam) chỉ dành cho trạng thái MỞ ĐẦU (Trial / Mới) — nó là tone hành
 * động, không phải "tốt". Trạng thái tốt dùng `success` (emerald).
 *
 * Bảng map nhận cả mã của TeachUI (chữ thường) lẫn enum Prisma của repo (CHỮ
 * HOA) — tra không phân biệt hoa thường để trang nào truyền thẳng enum DB cũng
 * ra đúng nhãn, không phải map tay ở từng call site.
 */
type PillColor = "success" | "amber" | "blue" | "brand" | "red" | "muted";

const colorClass: Record<PillColor, string> = {
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  brand:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  muted: "bg-muted text-muted-foreground",
};

const map: Record<string, { label: string; color: PillColor }> = {
  // Học viên / lớp
  active: { label: "Đang học", color: "success" },
  inactive: { label: "Tạm nghỉ", color: "muted" },
  pending: { label: "Chờ xử lý", color: "amber" },
  completed: { label: "Hoàn thành", color: "blue" },
  trial: { label: "Trial", color: "brand" },
  // Phễu Trial
  new: { label: "Mới", color: "brand" },
  scheduled: { label: "Đã hẹn", color: "blue" },
  attended: { label: "Đã Trial", color: "amber" },
  converted: { label: "Đã chuyển đổi", color: "success" },
  lost: { label: "Out", color: "red" },
  // Buổi học
  done: { label: "Đã dạy", color: "success" },
  cancelled: { label: "Đã huỷ", color: "red" },
  in_progress: { label: "Đang diễn ra", color: "amber" },
  // Chung
  approved: { label: "Đã duyệt", color: "success" },
  rejected: { label: "Từ chối", color: "red" },
  draft: { label: "Nháp", color: "muted" },
  published: { label: "Đã đăng", color: "success" },
  // Bài nộp (enum SubmissionStatus)
  not_submitted: { label: "Chưa nộp", color: "muted" },
  submitted: { label: "Đã nộp", color: "amber" },
  graded: { label: "Đã chấm", color: "success" },
  late: { label: "Nộp muộn", color: "amber" },
  // Điểm danh (enum AttendanceStatus)
  present: { label: "Có mặt", color: "success" },
  absent: { label: "Vắng", color: "red" },
  excused: { label: "Có phép", color: "blue" },
};

export function StatusPill({ status }: { status: string }) {
  const cfg = map[status.toLowerCase()] ?? {
    label: status,
    color: "muted" as PillColor,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        colorClass[cfg.color],
      )}
    >
      {cfg.label}
    </span>
  );
}
