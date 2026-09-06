"use client";

// components/cham-cong/request-form.tsx — FORM NỘP ĐƠN dùng chung cho MỌI nhân sự.
//
// Vì sao file này tồn tại: site admin (`/don-tu/cua-toi`) và site giáo viên (`/teacher/don-tu`)
// nộp CÙNG 10 loại đơn qua CÙNG một Server Action. Hai bản form riêng là hai bộ luật client lệch
// nhau — người này nộp được, người kia bị chặn, mà không ai biết vì sao.
//
// DỄ VỠ:
// 1. File này site GV mount ⇒ KHÔNG import `components/admin/**`, và CHỈ dùng token `:root`
//    (`.teacher-root` không có `--primary-soft`; `--primary-ink` ở `:root` là màu CAM, không tím).
// 2. Lỗi phải hiện TẠI Ô (`aria-invalid` + dòng chữ dưới ô), không chỉ bằng toast: toast biến mất
//    sau vài giây và người dùng còn lại một form không nói chỗ nào sai.
// 3. Payload gửi `submitRequestAction` giữ nguyên từng khoá — server suy `detail`/cơ sở nhận đơn
//    từ đúng bộ khoá này.
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WR_CATEGORIES,
  WR_KIND_LABEL,
  isClassKind,
  isRangeKind,
  isSingleKind,
  type WorkRequestKindV,
} from "@/lib/work-request";
import { submitRequestAction } from "@/lib/cham-cong/request-actions";
import type { RequestFormOptions } from "@/lib/cham-cong/request-form-data";

/** Ô nhập cao 44px — form này chạy trên điện thoại của giáo viên, không chỉ trên máy bàn. */
const FIELD =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-state-danger";
const BTN_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50";
const BTN_OUTLINE =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

/** Khoá ô có thể báo lỗi. Thứ tự mảng = thứ tự ưu tiên khi cuộn/đọc lỗi đầu tiên. */
const ERROR_ORDER = ["reason", "classId", "fromDate", "newTemplateId", "inAt", "centerId"] as const;
type ErrorKey = (typeof ERROR_ORDER)[number];
type Errors = Partial<Record<ErrorKey, string>>;

export function RequestForm({
  options,
  preset,
  presetDate,
  onClose,
  className,
}: {
  options: RequestFormOptions;
  preset?: WorkRequestKindV | null;
  /** `?date=` từ lịch ca: mở form là ngày đã điền sẵn, đỡ một lần gõ và đỡ chọn nhầm ngày. */
  presetDate?: string | null;
  onClose: () => void;
  className?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const showClass = options.myClasses.length > 0;
  const categories = WR_CATEGORIES.filter((c) => c.key !== "class" || showClass);
  const [kind, setKind] = useState<WorkRequestKindV>(preset ?? (showClass ? "CLASS_OFF" : "LEAVE"));
  const [fromDate, setFromDate] = useState(presetDate ?? "");
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
  const [errors, setErrors] = useState<Errors>({});

  const isClass = isClassKind(kind);
  const single = isSingleKind(kind);
  const range = isRangeKind(kind);
  const needsCenterPick = !options.defaultCenter;
  const teachersOnly = options.colleagues.filter((c) => c.isTeacher);
  const idOf = (k: ErrorKey | string) => `${uid}-${k}`;

  /** Đổi loại đơn thì xoá lỗi cũ — ô báo đỏ của loại vừa rời khỏi không còn nghĩa gì. */
  function pickKind(k: WorkRequestKindV) {
    setKind(k);
    setErrors({});
  }

  /** Cùng bộ luật với bản cũ, chỉ khác là trả về THEO Ô để hiện lỗi tại chỗ. */
  function validate(): Errors {
    const e: Errors = {};
    if (isClass && !classId) e.classId = "Chọn lớp";
    if (isClass && !fromDate) e.fromDate = "Chọn ngày buổi dạy";
    if ((single || kind === "SHIFT_SWAP") && !fromDate) e.fromDate = "Chọn ngày";
    if (range && !fromDate) e.fromDate = "Chọn từ ngày";
    if (kind === "SHIFT_SWAP" && !newTemplateId) e.newTemplateId = "Chọn mã ca mới";
    if (kind === "TIMESHEET_FIX" && !inAt && !outAt) e.inAt = "Nhập giờ vào hoặc giờ ra đề nghị";
    if (needsCenterPick && !centerId) e.centerId = "Chọn cơ sở nhận đơn";
    if (!reason.trim()) e.reason = "Nhập lý do";
    return e;
  }

  function submit() {
    const found = validate();
    setErrors(found);
    const firstKey = ERROR_ORDER.find((k) => found[k]);
    if (firstKey) {
      toast.error(found[firstKey]!);
      document.getElementById(idOf(firstKey))?.focus();
      return;
    }

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
    // `@container`: form này sống trong panel bên phải (Sheet) ở admin lẫn site GV, mà bề ngang
    // panel KHÔNG liên quan gì tới bề ngang cửa sổ. Dùng `sm:` ở đây là đo nhầm thước — cửa sổ
    // rộng nên `sm:` luôn bật, lưới cứ chia 14rem + phần còn lại kể cả khi panel chỉ có 384px,
    // và cột phải teo tới mức không bấm nổi (chủ dự án báo 06/09, đã dựng lại được trên test).
    // Từ đây mọi ngưỡng bên trong đo theo CHÍNH KHỐI NÀY: @md ≈ 448px, @lg ≈ 512px.
    <div className={cn("@container rounded-xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Tạo đơn mới</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng form tạo đơn"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {options.timesheetExempt && (
        <p className="mb-4 rounded-lg bg-state-warning-soft p-2.5 text-xs text-state-warning-ink">
          Bạn thuộc diện miễn chấm công — chỉ nộp được đơn liên quan lớp học.
        </p>
      )}

      <div className="grid gap-6 @md:grid-cols-[13rem_1fr]">
        {/* Cột trái: chọn loại đơn. `radiogroup` chứ không phải một mớ nút rời — trình đọc màn
            hình phải nghe được "đang chọn 1 trong N", và bàn phím đi được giữa các lựa chọn. */}
        <div role="radiogroup" aria-label="Loại đơn" className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.key}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {cat.label}
              </p>
              <div className="space-y-1.5">
                {cat.kinds.map((k) => {
                  const on = kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickKind(k)}
                      className={cn(
                        "h-11 w-full rounded-lg border px-3 text-left text-sm font-semibold transition-colors",
                        on
                          ? "border-primary bg-card text-foreground ring-1 ring-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {WR_KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Cột phải: chỉ những ô của loại đang chọn.
            `@container` ĐẶT Ở ĐÂY chứ không chỉ ở vỏ ngoài: các lưới hai cột bên dưới phải đo
            CHÍNH CỘT NÀY. Đo vỏ ngoài là lặp lại đúng cái sai vừa vá, chỉ đổi thước — vỏ 534px
            thì `@lg` bật, trong khi cột phải chỉ còn 534 − 208 (rail) − 24 (gap) ≈ 302px, mỗi ô
            date/select rơi xuống ~140px.
            `min-w-0`: ô lưới mặc định `min-width:auto` nên cột này không chịu co, rail bị đẩy.
            Ngưỡng dưới là `@md` (448px) chứ không `@lg` (512px): ở panel rộng nhất (3xl = 768px)
            cột phải chỉ còn ≈ 496px, đặt `@lg` là hai cột KHÔNG BAO GIỜ bật. */}
        <div className="@container min-w-0 space-y-4">
          {needsCenterPick ? (
            <Field
              id={idOf("centerId")}
              label="Cơ sở nhận đơn"
              hint="Bạn thuộc Hội sở — chọn Quản lý cơ sở nào sẽ duyệt."
              required
              error={errors.centerId}
            >
              <select
                id={idOf("centerId")}
                value={centerId}
                onChange={(e) => setCenterId(e.target.value)}
                required
                aria-invalid={errors.centerId ? true : undefined}
                className={FIELD}
              >
                <option value="">- Chọn cơ sở -</option>
                {options.centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-xs text-muted-foreground">
              Đơn gửi tới: <strong className="text-foreground">{options.defaultCenter?.label}</strong> (theo ca ngày áp
              dụng / cơ sở nhà). Nộp trước ít nhất {options.noticeDays} ngày; nộp muộn vẫn được nhưng có cờ.
            </p>
          )}

          {isClass ? (
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
              <Field id={idOf("classId")} label="Lớp" required error={errors.classId}>
                <select
                  id={idOf("classId")}
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  required
                  aria-invalid={errors.classId ? true : undefined}
                  className={FIELD}
                >
                  <option value="">- Chọn lớp -</option>
                  {options.myClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={idOf("fromDate")} label="Ngày buổi dạy" required error={errors.fromDate}>
                <input
                  id={idOf("fromDate")}
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  required
                  aria-invalid={errors.fromDate ? true : undefined}
                  className={FIELD}
                />
              </Field>
              {kind === "SUB_TEACH" && (
                <Field id={idOf("subTeacher")} label="Người dạy thay (tuỳ chọn)">
                  <select
                    id={idOf("subTeacher")}
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className={FIELD}
                  >
                    <option value="">- Chưa chỉ định -</option>
                    {teachersOnly.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          ) : kind === "SHIFT_SWAP" ? (
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
              <Field id={idOf("fromDate")} label="Ngày đổi ca" required error={errors.fromDate}>
                <input
                  id={idOf("fromDate")}
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  required
                  aria-invalid={errors.fromDate ? true : undefined}
                  className={FIELD}
                />
              </Field>
              <Field id={idOf("newTemplateId")} label="Mã ca mới của tôi" required error={errors.newTemplateId}>
                <select
                  id={idOf("newTemplateId")}
                  value={newTemplateId}
                  onChange={(e) => setNewTemplateId(e.target.value)}
                  required
                  aria-invalid={errors.newTemplateId ? true : undefined}
                  className={FIELD}
                >
                  <option value="">- Chọn mã ca -</option>
                  {options.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={idOf("swapTarget")} label="Người nhận ca (tuỳ chọn)">
                <select
                  id={idOf("swapTarget")}
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className={FIELD}
                >
                  <option value="">- Không có -</option>
                  {options.colleagues.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              {targetUserId && (
                <Field id={idOf("swapTargetTemplate")} label="Mã ca của người nhận">
                  <select
                    id={idOf("swapTargetTemplate")}
                    value={targetTemplateId}
                    onChange={(e) => setTargetTemplateId(e.target.value)}
                    className={FIELD}
                  >
                    <option value="">- Giữ nguyên -</option>
                    {options.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          ) : single ? (
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
              <Field id={idOf("fromDate")} label="Ngày" required error={errors.fromDate}>
                <input
                  id={idOf("fromDate")}
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  required
                  aria-invalid={errors.fromDate ? true : undefined}
                  className={FIELD}
                />
              </Field>
              {kind === "LATE_EARLY" && (
                <Field id={idOf("lateType")} label="Hình thức">
                  <select
                    id={idOf("lateType")}
                    value={lateType}
                    onChange={(e) => setLateType(e.target.value)}
                    className={FIELD}
                  >
                    <option>Đi muộn</option>
                    <option>Về sớm</option>
                  </select>
                </Field>
              )}
              {kind === "LATE_EARLY" && (
                <Field id={idOf("lateAt")} label="Giờ">
                  <input
                    id={idOf("lateAt")}
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={FIELD}
                  />
                </Field>
              )}
              {kind === "OT" && (
                <Field id={idOf("otFrom")} label="Từ giờ – đến giờ">
                  <div className="flex items-center gap-2">
                    <input
                      id={idOf("otFrom")}
                      type="time"
                      aria-label="Từ giờ"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={FIELD}
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="time"
                      aria-label="Đến giờ"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className={FIELD}
                    />
                  </div>
                </Field>
              )}
              {kind === "TIMESHEET_FIX" && (
                <>
                  <Field id={idOf("inAt")} label="Giờ vào đề nghị" error={errors.inAt}>
                    <input
                      id={idOf("inAt")}
                      type="time"
                      value={inAt}
                      onChange={(e) => setInAt(e.target.value)}
                      aria-invalid={errors.inAt ? true : undefined}
                      className={FIELD}
                    />
                  </Field>
                  <Field id={idOf("outAt")} label="Giờ ra đề nghị">
                    <input
                      id={idOf("outAt")}
                      type="time"
                      value={outAt}
                      onChange={(e) => setOutAt(e.target.value)}
                      className={FIELD}
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Quên quét thì điền mốc bị thiếu. Duyệt xong hệ thống ghi mốc &ldquo;chỉnh tay&rdquo; và tính lại
                    công ngày đó — lượt quét thật vẫn giữ nguyên để đối chiếu.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
              <Field id={idOf("fromDate")} label="Từ ngày" required error={errors.fromDate}>
                <input
                  id={idOf("fromDate")}
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  required
                  aria-invalid={errors.fromDate ? true : undefined}
                  className={FIELD}
                />
              </Field>
              <Field id={idOf("toDate")} label="Đến ngày">
                {/* `min` = ngày bắt đầu: bộ chọn ngày của trình duyệt tự chặn khoảng ngược,
                    đỡ một vòng gửi lên rồi bị server trả lỗi. */}
                <input
                  id={idOf("toDate")}
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  className={FIELD}
                />
              </Field>
              {kind === "LEAVE" && (
                <Field id={idOf("leaveTypeId")} label="Loại nghỉ">
                  <select
                    id={idOf("leaveTypeId")}
                    value={leaveTypeId}
                    onChange={(e) => setLeaveTypeId(e.target.value)}
                    className={FIELD}
                  >
                    {options.leaveTypes.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {l.paidRatio === 0 ? " (không lương)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {kind === "LEAVE" && (
                <Field id={idOf("leaveTarget")} label="Người làm thay (tuỳ chọn)">
                  <select
                    id={idOf("leaveTarget")}
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className={FIELD}
                  >
                    <option value="">- Không có -</option>
                    {options.colleagues.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {kind === "LEAVE" && targetUserId && (
                <Field id={idOf("leaveTargetTemplate")} label="Mã ca người làm thay (ngày đầu)">
                  <select
                    id={idOf("leaveTargetTemplate")}
                    value={targetTemplateId}
                    onChange={(e) => setTargetTemplateId(e.target.value)}
                    className={FIELD}
                  >
                    <option value="">- Giữ nguyên -</option>
                    {options.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {kind === "BUSINESS_TRIP" && (
                <Field id={idOf("destination")} label="Nơi đến">
                  <input
                    id={idOf("destination")}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="VD: Cơ sở 2"
                    className={FIELD}
                  />
                </Field>
              )}
            </div>
          )}

          <Field id={idOf("reason")} label="Lý do" required error={errors.reason}>
            <textarea
              id={idOf("reason")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Nhập lý do…"
              required
              aria-invalid={errors.reason ? true : undefined}
              className={cn(FIELD, "h-auto resize-y py-2")}
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" className={BTN_OUTLINE} disabled={pending} onClick={onClose}>
              Huỷ
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={pending}>
              <Plus className="h-4 w-4" aria-hidden /> {pending ? "Đang gửi…" : "Gửi đơn"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Nhãn + ô + dòng lỗi. Lỗi nằm NGAY DƯỚI ô nó nói tới — đó là điểm khác bản cũ (chỉ có toast). */
function Field({
  id,
  label,
  hint,
  required,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-foreground">
        {label}
        {required && (
          <span className="text-state-danger-ink" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {hint && <p className="mb-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="mt-1 text-xs text-state-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
