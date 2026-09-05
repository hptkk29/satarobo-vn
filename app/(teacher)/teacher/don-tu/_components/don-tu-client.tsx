"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Briefcase,
  CalendarOff,
  Clock,
  FilePen,
  Home,
  Inbox,
  Plus,
  Repeat,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ListToolbar,
  type SelectFilter,
} from "../../_components/ui/list-toolbar";
import { EmptyState } from "../../_components/ui/empty-state";
import {
  WORK_REQUEST_KINDS,
  WR_KIND_LABEL,
  WR_STATUS_LABEL,
  wrCategoryOf,
  type WorkRequestKindV,
  type WorkRequestStatusV,
} from "@/lib/work-request";
import { RequestForm } from "@/components/cham-cong/request-form";
import type { RequestFormOptions } from "@/lib/cham-cong/request-form-data";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export interface WorkRequestRow {
  id: string;
  kind: WorkRequestKindV;
  status: WorkRequestStatusV;
  fromLabel: string | null;
  toLabel: string | null;
  startTime: string | null;
  endTime: string | null;
  hours: number | null;
  className: string | null;
  detail: string | null;
  reason: string;
  reviewNote: string | null;
  createdAtLabel: string;
}

// Icon + badge theo loại đơn, màu lấy từ token trạng thái.
const KIND_ICON: Record<WorkRequestKindV, LucideIcon> = {
  CLASS_CHANGE: ArrowLeftRight,
  SUB_TEACH: Users,
  CLASS_OFF: CalendarOff,
  SHIFT_SWAP: Repeat,
  OT: Timer,
  LATE_EARLY: Clock,
  TIMESHEET_FIX: FilePen,
  LEAVE: CalendarOff,
  REMOTE: Home,
  BUSINESS_TRIP: Briefcase,
};
const CAT_BADGE: Record<string, string> = {
  class: "bg-primary-soft text-primary-ink",
  shift: "bg-state-info-soft text-state-info-ink",
  leave: "bg-state-success-soft text-state-success-ink",
};
const STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING:
    "border-state-warning-soft bg-state-warning-soft text-state-warning-ink dark:border-state-warning",
  APPROVED:
    "border-state-success-soft bg-state-success-soft text-state-success-ink dark:border-state-success",
  REJECTED:
    "border-state-danger-soft bg-state-danger-soft text-state-danger-ink dark:border-state-danger",
};

const ALL = "ALL";

export function DonTuClient({
  rows,
  options,
  presetKind,
  presetSwap,
}: {
  rows: WorkRequestRow[];
  options: RequestFormOptions;
  presetKind: string | null;
  presetSwap: string | null;
}) {
  const preset = (WORK_REQUEST_KINDS as readonly string[]).includes(
    presetKind ?? "",
  )
    ? (presetKind as WorkRequestKindV)
    : presetSwap
      ? "SHIFT_SWAP"
      : null;
  const [open, setOpen] = useState(Boolean(preset));
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const kindOptions: SelectFilter["options"] = [
    { value: ALL, label: "Mọi loại đơn" },
    ...WORK_REQUEST_KINDS.map((k) => ({ value: k, label: WR_KIND_LABEL[k] })),
  ];
  const statusOptions: SelectFilter["options"] = [
    { value: ALL, label: "Mọi trạng thái" },
    { value: "PENDING", label: "Chờ duyệt" },
    { value: "APPROVED", label: "Đã duyệt" },
    { value: "REJECTED", label: "Từ chối" },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== ALL && r.kind !== kindFilter) return false;
      if (statusFilter !== ALL && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.reason.toLowerCase().includes(q) ||
        WR_KIND_LABEL[r.kind].toLowerCase().includes(q) ||
        (r.className ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, kindFilter, statusFilter]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Đơn từ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gửi và theo dõi đơn theo nhóm: lớp học (đổi lớp dạy, dạy thay…), ca
            làm (đổi ca, OT…), nghỉ phép &amp; khác. Quản lý cơ sở duyệt đơn.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setOpen((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Tạo đơn
        </Button>
      </div>

      {open && (
        <RequestForm
          className="mb-5"
          options={options}
          preset={preset ?? "CLASS_OFF"}
          onClose={() => setOpen(false)}
        />
      )}

      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm theo lý do, loại đơn, lớp..."
        filters={[
          { value: kindFilter, onChange: setKindFilter, options: kindOptions },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            options: statusOptions,
          },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Chưa có đơn nào"
          description="Bấm “Tạo đơn” để gửi đơn mới."
        />
      ) : (
        <div className="t-card overflow-hidden">
          <PhanTrangBang cuonNgang>
            <table className="min-w-[770px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-3">
                    Loại đơn
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Nhóm
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Thời gian
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Nội dung
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Ngày gửi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <RequestRow key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        </div>
      )}
    </div>
  );
}

function RequestRow({ r }: { r: WorkRequestRow }) {
  const Icon = KIND_ICON[r.kind];
  const cat = wrCategoryOf(r.kind);
  const period =
    r.fromLabel && r.toLabel && r.fromLabel !== r.toLabel
      ? `${r.fromLabel} → ${r.toLabel}`
      : (r.fromLabel ?? r.toLabel ?? "—");
  const time =
    r.startTime && r.endTime
      ? `${r.startTime}-${r.endTime}`
      : r.startTime
        ? r.startTime
        : null;
  return (
    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              CAT_BADGE[cat.key],
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              {WR_KIND_LABEL[r.kind]}
            </p>
            {r.className && (
              <p className="text-xs text-muted-foreground">Lớp {r.className}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className="text-xs font-medium text-muted-foreground">
          {cat.label}
        </span>
      </td>
      <td className="px-5 py-3.5 whitespace-nowrap text-foreground">
        <p>{period}</p>
        {(time || r.hours != null) && (
          <p className="text-xs text-muted-foreground">
            {time ?? ""}
            {r.hours != null ? `${time ? " · " : ""}${r.hours}h` : ""}
          </p>
        )}
      </td>
      <td className="max-w-xs px-5 py-3.5">
        <p className="text-foreground">{r.reason}</p>
        {r.detail && (
          <p className="text-xs text-muted-foreground">{r.detail}</p>
        )}
        {r.status === "REJECTED" && r.reviewNote && (
          <p className="text-xs text-state-danger-ink">
            Lý do từ chối: {r.reviewNote}
          </p>
        )}
      </td>
      <td className="px-5 py-3.5">
        <Badge variant="outline" className={STATUS_CLS[r.status]}>
          {WR_STATUS_LABEL[r.status]}
        </Badge>
      </td>
      <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
        {r.createdAtLabel}
      </td>
    </tr>
  );
}
