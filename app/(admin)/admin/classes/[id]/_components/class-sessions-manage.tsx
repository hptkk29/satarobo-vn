"use client";

// R7-06 — Quản lý buổi học của lớp: huỷ buổi (lý do bắt buộc) + điều chỉnh
// ngày/GV/phòng. Buổi CANCELLED hiển thị rõ (không ẩn) với nhãn "Đã hủy".
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, Ban, Pencil } from "lucide-react";
import { cancelSessionAction, adjustSessionAction } from "../_curriculum-actions";

export type SessionRow = {
  id: string;
  date: string; // ISO
  topic: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
};

export type Option = { id: string; label: string };

const STATUS_LABEL: Record<SessionRow["status"], { label: string; cls: string }> = {
  SCHEDULED: { label: "Đã lên lịch", cls: "bg-gray-100 text-gray-600" },
  IN_PROGRESS: { label: "Đang diễn ra", cls: "bg-amber-100 text-amber-700" },
  COMPLETED: { label: "Hoàn thành", cls: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Đã hủy", cls: "bg-red-100 text-red-700" },
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ClassSessionsManage({
  sessions,
  teachers,
  rooms,
  canEdit,
}: {
  sessions: SessionRow[];
  teachers: Option[];
  rooms: Option[];
  canEdit: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
        <CalendarRange className="h-4 w-4" /> Quản lý buổi học
      </h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-400">
          Chưa có buổi học nào. Dùng &quot;Sinh buổi học&quot; ở mục lịch phía trên.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              teachers={teachers}
              rooms={rooms}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionItem({
  session,
  teachers,
  rooms,
  canEdit,
}: {
  session: SessionRow;
  teachers: Option[];
  rooms: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "adjust" | "cancel">("none");
  const [date, setDate] = useState(session.date.slice(0, 10));
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [reason, setReason] = useState("");

  const cancelled = session.status === "CANCELLED";
  const badge = STATUS_LABEL[session.status];

  function doAdjust() {
    startTransition(async () => {
      const res = await adjustSessionAction(session.id, {
        date: date || null,
        teacherId: teacherId || null,
        roomId: roomId || null,
      });
      if (res.ok) {
        toast.success("Đã điều chỉnh buổi học");
        setMode("none");
        router.refresh();
      } else {
        toast.error(res.error ?? "Không điều chỉnh được");
      }
    });
  }

  function doCancel() {
    if (reason.trim().length < 5) {
      toast.error("Nhập lý do huỷ (≥5 ký tự)");
      return;
    }
    startTransition(async () => {
      const res = await cancelSessionAction(session.id, reason.trim());
      if (res.ok) {
        toast.success("Đã huỷ buổi học");
        setMode("none");
        setReason("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Không huỷ được buổi");
      }
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`text-sm font-semibold tabular-nums ${
              cancelled ? "text-gray-400 line-through" : "text-gray-900"
            }`}
          >
            {fmt(session.date)}
          </span>
          <span className="ml-2 text-sm text-gray-500">
            {session.topic ?? "Buổi học"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}
          >
            {badge.label}
          </span>
          {canEdit && !cancelled && (
            <>
              <button
                type="button"
                onClick={() => setMode(mode === "adjust" ? "none" : "adjust")}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Điều chỉnh
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === "cancel" ? "none" : "cancel")}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                <Ban className="h-3.5 w-3.5" /> Huỷ
              </button>
            </>
          )}
        </div>
      </div>

      {mode === "adjust" && (
        <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">
                Ngày
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">
                GV chính
              </span>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
              >
                <option value="">— Giữ nguyên —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">
                Phòng
              </span>
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
              >
                <option value="">— Giữ nguyên —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={doAdjust}
            disabled={pending}
            className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : "Lưu điều chỉnh"}
          </button>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-2 space-y-2 rounded-lg bg-red-50 p-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do huỷ buổi (bắt buộc, ≥5 ký tự)"
            className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            Buổi sẽ chuyển trạng thái &quot;Đã hủy&quot; (không xoá). Buổi bù được
            xử lý theo lịch.
          </p>
          <button
            type="button"
            onClick={doCancel}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Đang huỷ…" : "Xác nhận huỷ buổi"}
          </button>
        </div>
      )}
    </li>
  );
}
