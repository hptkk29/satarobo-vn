import type { HolidayType } from "@prisma/client";

export const TYPE_LABELS: Record<HolidayType, string> = {
  HOLIDAY: "Ngày lễ",
  MAINTENANCE: "Bảo trì",
  EVENT: "Sự kiện",
  OTHER: "Khác",
};

const TYPE_COLORS: Record<HolidayType, string> = {
  HOLIDAY: "bg-red-100 text-red-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  EVENT: "bg-purple-100 text-purple-700",
  OTHER: "bg-neutral-100 text-neutral-700",
};

export function TypeBadge({ type }: { type: HolidayType }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  );
}

export function ScopeBadge({ center }: { center: { name: string } | null }) {
  if (!center) {
    return (
      <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
        Toàn hệ thống
      </span>
    );
  }
  return (
    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-700">
      {center.name}
    </span>
  );
}

function fmtDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function DateRange({
  date,
  endDate,
}: {
  date: Date;
  endDate: Date | null;
}) {
  if (!endDate || endDate.getTime() === date.getTime()) {
    return <span className="font-mono">{fmtDate(date)}</span>;
  }
  return (
    <span className="font-mono">
      {fmtDate(date)} → {fmtDate(endDate)}
    </span>
  );
}

export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}
