"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  X,
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
  WR_CATEGORIES,
  WR_KIND_LABEL,
  WR_STATUS_LABEL,
  isClassKind,
  isRangeKind,
  isSingleKind,
  wrCategoryOf,
  type WorkRequestKindV,
  type WorkRequestStatusV,
} from "@/lib/work-request";
import { submitWorkRequest } from "../_actions";
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
const inputCls =
  "w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary-soft focus:ring-2 focus:ring-primary-soft dark:focus:ring-primary";

export function DonTuClient({
  rows,
  myClasses,
  otherTeachers,
  myShifts,
  presetKind,
  presetSwap,
}: {
  rows: WorkRequestRow[];
  myClasses: { id: string; name: string }[];
  otherTeachers: { id: string; name: string }[];
  myShifts: { id: string; label: string }[];
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
          preset={preset ?? "CLASS_CHANGE"}
          presetSwap={presetSwap}
          myClasses={myClasses}
          otherTeachers={otherTeachers}
          myShifts={myShifts}
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

function RequestForm({
  preset,
  presetSwap,
  myClasses,
  otherTeachers,
  myShifts,
  onClose,
}: {
  preset: WorkRequestKindV;
  presetSwap: string | null;
  myClasses: { id: string; name: string }[];
  otherTeachers: { id: string; name: string }[];
  myShifts: { id: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<WorkRequestKindV>(preset);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hours, setHours] = useState("");
  const [lateType, setLateType] = useState("Đi muộn");
  const [destination, setDestination] = useState("");
  const [classId, setClassId] = useState("");
  const [targetShiftId, setTargetShiftId] = useState(presetSwap ?? "");
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");

  const isClass = isClassKind(kind);
  const single = isSingleKind(kind);
  const range = isRangeKind(kind);

  function submit() {
    if (!reason.trim()) return toast.error("Nhập lý do");
    if (isClass && (!classId || !fromDate))
      return toast.error("Chọn lớp và ngày buổi dạy");
    if (single && !fromDate) return toast.error("Chọn ngày");
    if (range && !fromDate) return toast.error("Chọn từ ngày");

    const className = isClass
      ? (myClasses.find((c) => c.id === classId)?.name ?? null)
      : null;
    let detail: string | null = null;
    if (kind === "BUSINESS_TRIP" && destination)
      detail = `Nơi đến: ${destination}`;
    if (kind === "LATE_EARLY") detail = lateType;
    if (kind === "SUB_TEACH") {
      const who = otherTeachers.find((t) => t.id === targetUserId)?.name;
      detail = who ? `Người dạy thay: ${who}` : null;
    }
    if (kind === "SHIFT_SWAP") {
      const sh = myShifts.find((s) => s.id === targetShiftId)?.label;
      const who = otherTeachers.find((t) => t.id === targetUserId)?.name;
      detail =
        [sh, who ? `Người nhận: ${who}` : ""].filter(Boolean).join(" · ") ||
        null;
    }

    start(async () => {
      const res = await submitWorkRequest({
        kind,
        fromDate: fromDate || null,
        toDate: range ? toDate || null : null,
        startTime: startTime || null,
        endTime: endTime || null,
        hours: kind === "TIMESHEET_FIX" && hours ? Number(hours) : null,
        className,
        classId: isClass ? classId || null : null,
        targetUserId:
          kind === "SUB_TEACH" || kind === "SHIFT_SWAP"
            ? targetUserId || null
            : null,
        targetShiftId: kind === "SHIFT_SWAP" ? targetShiftId || null : null,
        detail,
        reason: reason.trim(),
      });
      if (res.ok) {
        toast.success("Đã gửi đơn — chờ quản lý duyệt");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="t-card mb-5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Tạo đơn mới
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Chọn loại đơn — 3 nhóm */}
      <div className="mb-5 space-y-3">
        {WR_CATEGORIES.map((cat) => (
          <div key={cat.key}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cat.label}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {cat.kinds.map((k) => {
                const Icon = KIND_ICON[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                      active
                        ? "border-primary-soft bg-primary-soft text-primary-ink dark:bg-primary-soft dark:text-primary-ink"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{WR_KIND_LABEL[k]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {isClass ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Lớp">
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className={inputCls}
              >
                <option value="">- Chọn lớp -</option>
                {myClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày buổi dạy">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            {kind === "SUB_TEACH" && (
              <Field label="Người dạy thay (tuỳ chọn)">
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">- Chưa chỉ định -</option>
                  {otherTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        ) : kind === "SHIFT_SWAP" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ca muốn đổi">
              <select
                value={targetShiftId}
                onChange={(e) => setTargetShiftId(e.target.value)}
                className={inputCls}
              >
                <option value="">- Chọn ca -</option>
                {myShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Người nhận ca (tuỳ chọn)">
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className={inputCls}
              >
                <option value="">- Chưa chỉ định -</option>
                {otherTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : single ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ngày">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            {kind === "LATE_EARLY" && (
              <Field label="Hình thức">
                <select
                  value={lateType}
                  onChange={(e) => setLateType(e.target.value)}
                  className={inputCls}
                >
                  <option>Đi muộn</option>
                  <option>Về sớm</option>
                </select>
              </Field>
            )}
            {kind === "OT" && (
              <Field label="Từ giờ - Đến giờ">
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={inputCls}
                  />
                  <span className="text-muted-foreground">-</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </Field>
            )}
            {kind === "LATE_EARLY" && (
              <Field label="Giờ">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputCls}
                />
              </Field>
            )}
            {kind === "TIMESHEET_FIX" && (
              <Field label="Số giờ chỉnh">
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="VD: 2"
                  className={inputCls}
                />
              </Field>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Từ ngày">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Đến ngày">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            {kind === "BUSINESS_TRIP" && (
              <Field label="Nơi đến">
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="VD: Cơ sở Thủ Đức"
                  className={inputCls}
                />
              </Field>
            )}
          </div>
        )}

        <Field label="Lý do">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Nhập lý do..."
            className={cn(inputCls, "resize-y")}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />{" "}
            {pending ? "Đang gửi…" : "Gửi đơn"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
