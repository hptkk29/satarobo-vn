import type { RoomStatus } from "@prisma/client";

const LABELS: Record<RoomStatus, string> = {
  ACTIVE: "Hoạt động",
  MAINTENANCE: "Bảo trì",
  INACTIVE: "Tạm ngừng",
};

const COLORS: Record<RoomStatus, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  INACTIVE: "bg-neutral-100 text-neutral-600",
};

export function StatusBadge({ status }: { status: RoomStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}

export const STATUS_LABELS = LABELS;
