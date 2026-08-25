"use client";

// app/(admin)/admin/lop-trial/_components/booking-list.tsx — GĐ2.
//
// Mặt phẳng V1: các buổi hẹn học thử 1-1 gắn thẳng vào lead. Mỗi buổi là một thẻ
// đóng/mở; mở ra mới hiện form sửa để danh sách dài vẫn đọc lướt được ở 375px.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { TRIAL_STATUS_LABEL, TRIAL_STATUS_BADGE } from "@/lib/trials/status";
import {
  updateBookingLopTrialAction,
  deleteBookingLopTrialAction,
} from "../_actions";
import type { BookingRow, BookingStatus, Option } from "../_lib/types";

/** Bảy trạng thái buổi hẹn, theo đúng thứ tự phễu. */
const CAC_TRANG_THAI: readonly BookingStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "ATTENDED",
  "MISSED",
  "POSTPONED",
  "ENROLLED",
  "REJECTED",
];

/**
 * "YYYY-MM-DDTHH:mm" → "HH:mm dd/MM/yyyy", thuần chuỗi.
 *
 * ⚠️ TUYỆT ĐỐI không `new Date(chuỗi)` rồi format lại: chuỗi này đã là ĐỒNG HỒ VN do
 * server quy đổi. Parse lại ở client là diễn giải nó theo múi giờ của máy người dùng —
 * đúng cái bug mà `scheduledAtVn` sinh ra để vá. Chuỗi lạ thì trả nguyên văn, thà hiện
 * thô còn hơn hiện một giờ sai mà trông rất thật.
 */
export function gioHenNguoiDoc(scheduledAtVn: string): string {
  const [ngay, gio] = scheduledAtVn.split("T");
  const phan = ngay?.split("-");
  if (!gio || !phan || phan.length !== 3) return scheduledAtVn;
  const [y, m, d] = phan;
  return `${gio} ${d}/${m}/${y}`;
}

export function BookingList({
  bookings,
  teachers,
  rooms,
  classes,
  canManage,
}: {
  bookings: BookingRow[];
  teachers: Option[];
  rooms: Option[];
  classes: Option[];
  canManage: boolean;
}) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Không có buổi hẹn nào.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <BookingCard
          key={b.id}
          booking={b}
          teachers={teachers}
          rooms={rooms}
          classes={classes}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function BookingCard({
  booking,
  teachers,
  rooms,
  classes,
  canManage,
}: {
  booking: BookingRow;
  teachers: Option[];
  rooms: Option[];
  classes: Option[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // State form khởi tạo từ props. `scheduledAtVn` đi thẳng vào input rồi đi thẳng về
  // server, không qua một phép đổi kiểu nào — xem comment ở `gioHenNguoiDoc`.
  const [scheduledAtVn, setScheduledAtVn] = useState(booking.scheduledAtVn);
  const [status, setStatus] = useState<BookingStatus>(booking.status);
  const [teacherId, setTeacherId] = useState(booking.teacherId ?? "");
  const [roomId, setRoomId] = useState(booking.roomId ?? "");
  const [classId, setClassId] = useState(booking.classId ?? "");
  const [notes, setNotes] = useState(booking.notes ?? "");

  function onSave() {
    startTransition(async () => {
      const res = await updateBookingLopTrialAction(booking.id, {
        scheduledAtVn,
        status,
        // Ô trống nghĩa là "bỏ gán", phải thành null; chuỗi rỗng sẽ trượt Zod.
        teacherId: teacherId || null,
        roomId: roomId || null,
        classId: classId || null,
        notes: notes || null,
      });
      if (res.ok) {
        toast.success("Đã cập nhật buổi hẹn");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi cập nhật");
      }
    });
  }

  function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteBookingLopTrialAction(booking.id);
      if (res.ok) {
        toast.success("Đã xoá buổi hẹn");
        router.refresh();
      } else {
        // Server từ chối buổi đã có kết quả (đã học / đã chốt / có nhận xét) và nói rõ
        // lý do — hiện nguyên văn, đừng thay bằng câu chung chung.
        toast.error(res.error ?? "Lỗi xoá");
        setConfirmDelete(false);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start gap-2 p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              {booking.parentName ?? "—"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TRIAL_STATUS_BADGE[booking.status]}`}
            >
              {TRIAL_STATUS_LABEL[booking.status]}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {booking.childName ? `Con: ${booking.childName} · ` : ""}
            {booking.phone ?? "—"}
            {booking.centerName ? ` · ${booking.centerName}` : ""}
            {booking.teacherName ? ` · GV: ${booking.teacherName}` : ""}
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          <span className="text-muted-foreground">
            {gioHenNguoiDoc(booking.scheduledAtVn)}
          </span>
          {/* Link nằm NGOÀI nút mở/đóng: lồng thẻ bấm được vào nhau là HTML sai và
              bấm "Mở lead" sẽ vừa điều hướng vừa gập thẻ. */}
          <Link
            href={`/leads/${booking.leadId}`}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Mở lead
          </Link>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Xếp lịch &amp; trạng thái
          </h3>

          {!canManage ? (
            <dl className="space-y-2 text-sm">
              <ReadRow label="Thời gian" value={gioHenNguoiDoc(booking.scheduledAtVn)} />
              <ReadRow label="Trạng thái" value={TRIAL_STATUS_LABEL[booking.status]} />
              <ReadRow label="Giáo viên" value={booking.teacherName ?? "— Chưa phân công —"} />
              <ReadRow
                label="Phòng"
                value={rooms.find((r) => r.id === booking.roomId)?.name ?? "—"}
              />
              <ReadRow
                label="Lớp chính thức"
                value={classes.find((c) => c.id === booking.classId)?.name ?? "—"}
              />
              <ReadRow label="Ghi chú" value={booking.notes ?? "—"} />
            </dl>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Thời gian">
                <input
                  type="datetime-local"
                  value={scheduledAtVn}
                  onChange={(e) => setScheduledAtVn(e.target.value)}
                  disabled={pending}
                  className={inputCls}
                />
              </Field>

              <Field label="Trạng thái">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BookingStatus)}
                  disabled={pending}
                  className={inputCls}
                >
                  {CAC_TRANG_THAI.map((s) => (
                    <option key={s} value={s}>
                      {TRIAL_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Giáo viên">
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  disabled={pending}
                  className={inputCls}
                >
                  <option value="">— Chưa phân công —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Phòng">
                <select
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  disabled={pending}
                  className={inputCls}
                >
                  <option value="">— Không —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Lớp chính thức">
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  disabled={pending}
                  className={inputCls}
                >
                  <option value="">— Không —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ghi chú">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={pending}
                  rows={2}
                  className={inputCls}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={pending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {pending ? "Đang lưu…" : "Lưu lịch"}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  // Rời khỏi nút là quên trạng thái "đã hỏi" — tránh nhịp xác nhận treo
                  // lơ lửng rồi cú bấm sau đó xoá thật.
                  onBlur={() => setConfirmDelete(false)}
                  disabled={pending}
                  className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                    confirmDelete
                      ? "bg-state-danger-ink text-white hover:bg-state-danger-ink-hover"
                      : "border border-state-danger text-state-danger-ink hover:bg-state-danger-soft"
                  }`}
                >
                  {confirmDelete ? "Bấm lần nữa để xoá" : "Xoá"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-muted";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="min-w-[7rem] text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
