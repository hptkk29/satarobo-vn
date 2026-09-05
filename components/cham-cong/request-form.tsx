"use client";

// components/cham-cong/request-form.tsx — FORM ĐƠN TỪ dùng chung cho MỌI nhân sự (site admin lẫn
// site GV mount cùng một component — L5). Chỉ shadcn + Tailwind (không Magic UI) để admin dùng được.
// Nhóm đơn: lớp (GV) · ca & chấm công · nghỉ & khác. Với người Hội sở, ô "Cơ sở nhận đơn" bắt buộc.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WR_CATEGORIES, WR_KIND_LABEL, isClassKind, isRangeKind, isSingleKind, type WorkRequestKindV } from "@/lib/work-request";
import { submitRequestAction } from "@/lib/cham-cong/request-actions";
import type { RequestFormOptions } from "@/lib/cham-cong/request-form-data";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

export function RequestForm({ options, preset, onClose, className }: { options: RequestFormOptions; preset?: WorkRequestKindV | null; onClose: () => void; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const showClass = options.myClasses.length > 0;
  const categories = WR_CATEGORIES.filter((c) => c.key !== "class" || showClass);
  const [kind, setKind] = useState<WorkRequestKindV>(preset ?? (showClass ? "CLASS_OFF" : "LEAVE"));
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [lateType, setLateType] = useState("Đi muộn");
  const [destination, setDestination] = useState("");
  const [classId, setClassId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [targetTemplateId, setTargetTemplateId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState(options.leaveTypes[0]?.id ?? "");
  const [inAt, setInAt] = useState("");
  const [outAt, setOutAt] = useState("");
  const [centerId, setCenterId] = useState(options.defaultCenter?.id ?? "");
  const [reason, setReason] = useState("");

  const isClass = isClassKind(kind);
  const single = isSingleKind(kind);
  const range = isRangeKind(kind);
  const needsCenterPick = !options.defaultCenter;
  const teachersOnly = options.colleagues.filter((c) => c.isTeacher);

  function submit() {
    if (!reason.trim()) return toast.error("Nhập lý do");
    if (isClass && (!classId || !fromDate)) return toast.error("Chọn lớp và ngày buổi dạy");
    if ((single || kind === "SHIFT_SWAP") && !fromDate) return toast.error("Chọn ngày");
    if (range && !fromDate) return toast.error("Chọn từ ngày");
    if (kind === "SHIFT_SWAP" && !newTemplateId) return toast.error("Chọn mã ca mới");
    if (kind === "TIMESHEET_FIX" && !inAt && !outAt) return toast.error("Nhập giờ vào hoặc giờ ra đề nghị");
    if (needsCenterPick && !centerId) return toast.error("Chọn cơ sở nhận đơn");

    let detail: string | null = null;
    if (kind === "BUSINESS_TRIP" && destination) detail = `Nơi đến: ${destination}`;
    if (kind === "LATE_EARLY") detail = lateType;
    const who = options.colleagues.find((t) => t.id === targetUserId)?.name;
    if (kind === "SUB_TEACH") detail = who ? `Người dạy thay: ${who}` : null;
    if (kind === "SHIFT_SWAP") {
      const code = options.templates.find((t) => t.id === newTemplateId)?.code;
      detail = [code ? `Ca mới: ${code}` : "", who ? `Người nhận: ${who}` : ""].filter(Boolean).join(" · ") || null;
    }
    if (kind === "LEAVE" && who) detail = `Người làm thay: ${who}`;

    start(async () => {
      const res = await submitRequestAction({
        kind,
        fromDate: fromDate || null,
        toDate: range ? toDate || null : null,
        startTime: startTime || null,
        endTime: endTime || null,
        className: isClass ? (options.myClasses.find((c) => c.id === classId)?.name ?? null) : null,
        classId: isClass ? classId || null : null,
        targetUserId: kind === "SUB_TEACH" || kind === "SHIFT_SWAP" || kind === "LEAVE" ? targetUserId || null : null,
        requesterNewTemplateId: kind === "SHIFT_SWAP" ? newTemplateId || null : null,
        targetNewTemplateId: (kind === "SHIFT_SWAP" || kind === "LEAVE") && targetUserId ? targetTemplateId || null : null,
        leaveTypeId: kind === "LEAVE" ? leaveTypeId || null : null,
        requestedInAt: kind === "TIMESHEET_FIX" ? inAt || null : null,
        requestedOutAt: kind === "TIMESHEET_FIX" ? outAt || null : null,
        chosenCenterId: needsCenterPick ? centerId || null : null,
        detail,
        reason: reason.trim(),
      });
      if (res.ok) {
        toast.success(res.note ? `Đã gửi đơn — ${res.note}` : "Đã gửi đơn — chờ quản lý duyệt");
        onClose();
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Tạo đơn mới</h3>
        <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      {options.timesheetExempt && <p className="mb-3 rounded-lg bg-state-warning-soft p-2 text-xs text-state-warning-ink">Bạn thuộc diện miễn chấm công — chỉ nộp được đơn liên quan lớp học.</p>}

      <div className="mb-5 space-y-3">
        {categories.map((cat) => (
          <div key={cat.key}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {cat.kinds.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors", kind === k ? "border-primary bg-primary text-white" : "border-border bg-card text-muted-foreground hover:bg-muted/50")}>
                  {WR_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {needsCenterPick && (
          <Field label="Cơ sở nhận đơn (bạn thuộc Hội sở — Quản lý cơ sở nào sẽ duyệt?)">
            <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className={inputCls}>
              <option value="">- Chọn cơ sở -</option>
              {options.centers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        )}
        {!needsCenterPick && <p className="text-xs text-muted-foreground">Đơn gửi tới: <strong>{options.defaultCenter?.label}</strong> (theo ca ngày áp dụng / cơ sở nhà). Nộp trước ít nhất {options.noticeDays} ngày; nộp muộn vẫn được nhưng có cờ.</p>}

        {isClass ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Lớp"><select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputCls}><option value="">- Chọn lớp -</option>{options.myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Ngày buổi dạy"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
            {kind === "SUB_TEACH" && <Field label="Người dạy thay (tuỳ chọn)"><select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className={inputCls}><option value="">- Chưa chỉ định -</option>{teachersOnly.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
          </div>
        ) : kind === "SHIFT_SWAP" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ngày đổi ca"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Mã ca mới của tôi"><select value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)} className={inputCls}><option value="">- Chọn mã ca -</option>{options.templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}</select></Field>
            <Field label="Người nhận ca (tuỳ chọn)"><select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className={inputCls}><option value="">- Không có -</option>{options.colleagues.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            {targetUserId && <Field label="Mã ca của người nhận"><select value={targetTemplateId} onChange={(e) => setTargetTemplateId(e.target.value)} className={inputCls}><option value="">- Giữ nguyên -</option>{options.templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}</select></Field>}
          </div>
        ) : single ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ngày"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
            {kind === "LATE_EARLY" && <Field label="Hình thức"><select value={lateType} onChange={(e) => setLateType(e.target.value)} className={inputCls}><option>Đi muộn</option><option>Về sớm</option></select></Field>}
            {kind === "LATE_EARLY" && <Field label="Giờ"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} /></Field>}
            {kind === "OT" && <Field label="Từ giờ – đến giờ"><div className="flex items-center gap-2"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} /><span>–</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} /></div></Field>}
            {kind === "TIMESHEET_FIX" && (
              <>
                <Field label="Giờ vào đề nghị"><input type="time" value={inAt} onChange={(e) => setInAt(e.target.value)} className={inputCls} /></Field>
                <Field label="Giờ ra đề nghị"><input type="time" value={outAt} onChange={(e) => setOutAt(e.target.value)} className={inputCls} /></Field>
                <p className="text-xs text-muted-foreground sm:col-span-2">Quên quét thì điền mốc bị thiếu. Duyệt xong hệ thống ghi mốc "chỉnh tay" và tính lại công ngày đó — lượt quét thật vẫn giữ nguyên để đối chiếu.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Từ ngày"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Đến ngày"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
            {kind === "LEAVE" && <Field label="Loại nghỉ"><select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className={inputCls}>{options.leaveTypes.map((l) => <option key={l.id} value={l.id}>{l.name}{l.paidRatio === 0 ? " (không lương)" : ""}</option>)}</select></Field>}
            {kind === "LEAVE" && <Field label="Người làm thay (tuỳ chọn)"><select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className={inputCls}><option value="">- Không có -</option>{options.colleagues.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
            {kind === "LEAVE" && targetUserId && <Field label="Mã ca người làm thay (ngày đầu)"><select value={targetTemplateId} onChange={(e) => setTargetTemplateId(e.target.value)} className={inputCls}><option value="">- Giữ nguyên -</option>{options.templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}</select></Field>}
            {kind === "BUSINESS_TRIP" && <Field label="Nơi đến"><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="VD: Cơ sở 2" className={inputCls} /></Field>}
          </div>
        )}

        <Field label="Lý do"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Nhập lý do…" className={cn(inputCls, "resize-y")} /></Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" disabled={pending} onClick={onClose}>Huỷ</Button>
          <Button onClick={submit} disabled={pending}><Plus className="mr-1.5 h-4 w-4" aria-hidden /> {pending ? "Đang gửi…" : "Gửi đơn"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}
