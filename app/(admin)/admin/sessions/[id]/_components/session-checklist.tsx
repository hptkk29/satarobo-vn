"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, Play, Save } from "lucide-react";
import type { SessionStatus } from "@prisma/client";
import { updateSessionChecklist, startSession, completeSession } from "../_actions";

const STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang diễn ra",
  COMPLETED: "Đã hoàn tất",
};
const STATUS_COLOR: Record<SessionStatus, string> = {
  SCHEDULED: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

export function SessionChecklist({
  sessionId,
  status,
  lessonLinked,
  derived,
  stored,
  canEdit,
}: {
  sessionId: string;
  status: SessionStatus;
  lessonLinked: boolean;
  derived: { ckAttendance: boolean; ckFeedback: boolean };
  stored: {
    ckClean: boolean;
    ckEquipment: boolean;
    ckKit: boolean;
    ckLessonConfirmed: boolean;
    ckMedia: boolean;
    ckHomework: boolean;
    ckIncident: boolean;
    incidentNote: string;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ckClean, setClean] = useState(stored.ckClean);
  const [ckEquipment, setEquipment] = useState(stored.ckEquipment);
  const [ckKit, setKit] = useState(stored.ckKit);
  const [ckLessonConfirmed, setLesson] = useState(stored.ckLessonConfirmed);
  const [ckMedia, setMedia] = useState(stored.ckMedia);
  const [ckHomework, setHomework] = useState(stored.ckHomework);
  const [ckIncident, setIncident] = useState(stored.ckIncident);
  const [incidentNote, setIncidentNote] = useState(stored.incidentNote);

  function saveProgress() {
    startTransition(async () => {
      const res = await updateSessionChecklist({
        sessionId,
        ckClean,
        ckEquipment,
        ckKit,
        ckLessonConfirmed,
        ckMedia,
        ckHomework,
        ckIncident,
        incidentNote: incidentNote.trim(),
      });
      if (res.ok) {
        toast.success("Đã lưu tiến trình");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function doStart() {
    startTransition(async () => {
      const res = await startSession(sessionId);
      if (res.ok) {
        toast.success("Đã bắt đầu buổi học");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function doComplete() {
    startTransition(async () => {
      const res = await completeSession(sessionId);
      if (res.ok) {
        toast.success("Đã hoàn tất buổi học");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const canComplete = derived.ckAttendance && ckLessonConfirmed && derived.ckFeedback;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Quy trình sau buổi (checklist)
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Chuẩn bị</p>
      <ul className="mb-3 space-y-2">
        <ToggleStep n={1} checked={ckClean} onChange={setClean} disabled={!canEdit || pending} label="Vệ sinh phòng học" hint="Phòng sạch trước buổi" />
        <ToggleStep n={2} checked={ckEquipment} onChange={setEquipment} disabled={!canEdit || pending} label="Thiết bị dạy học OK" hint="Máy chiếu/màn/điện" />
        <ToggleStep n={3} checked={ckKit} onChange={setKit} disabled={!canEdit || pending} label="Học cụ / kit đủ cho buổi" hint="Đủ bộ kit cho HS" />
      </ul>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Trong / sau buổi</p>
      <ul className="space-y-2">
        <AutoStep n={4} done={derived.ckAttendance} label="Điểm danh xong" hint="Tự động khi có điểm danh" required />
        <ToggleStep
          n={5}
          checked={ckLessonConfirmed}
          onChange={setLesson}
          disabled={!canEdit || pending}
          label="Xác nhận bài đã dạy"
          hint={lessonLinked ? "Đã gắn bài giảng" : "Chưa gắn bài — vào 'Sửa buổi' để gắn lessonId"}
          required
        />
        <AutoStep
          n={6}
          done={derived.ckFeedback}
          label="Nhận xét từng HS có mặt"
          hint="Tự động khi mọi HS có mặt đã được nhận xét (mục trên)"
          required
        />
        <ToggleStep n={7} checked={ckMedia} onChange={setMedia} disabled={!canEdit || pending} label="Upload + tag ảnh lớp" hint="Tuỳ chọn" />
        <ToggleStep n={8} checked={ckHomework} onChange={setHomework} disabled={!canEdit || pending} label="Giao bài tập (hoặc không có)" hint="Tuỳ chọn" />
        <ToggleStep n={9} checked={ckIncident} onChange={setIncident} disabled={!canEdit || pending} label="Ghi chú sự cố (hoặc không có)" hint="Tuỳ chọn" />
      </ul>

      {ckIncident && (
        <textarea
          value={incidentNote}
          onChange={(e) => setIncidentNote(e.target.value)}
          disabled={!canEdit || pending}
          rows={2}
          placeholder="Mô tả sự cố trong buổi (nếu có)…"
          className="mt-3 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none disabled:bg-gray-50"
        />
      )}

      {canEdit && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={saveProgress}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Lưu tiến trình
          </button>
          {status === "SCHEDULED" && (
            <button
              type="button"
              onClick={doStart}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Bắt đầu buổi
            </button>
          )}
          {status !== "COMPLETED" && (
            <button
              type="button"
              onClick={doComplete}
              disabled={pending || !canComplete}
              title={canComplete ? "" : "Cần xong bước (1)(2)(3)"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Hoàn tất buổi học
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AutoStep({ n, done, label, hint, required }: { n: number; done: boolean; label: string; hint: string; required?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
      ) : (
        <Circle className={`mt-0.5 h-5 w-5 shrink-0 ${required ? "text-rose-400" : "text-gray-300"}`} />
      )}
      <div>
        <div className="text-sm font-medium text-gray-800">
          {n}. {label} {required && <span className="text-rose-500">*</span>}
        </div>
        <div className="text-xs text-gray-400">{hint}</div>
      </div>
    </li>
  );
}

function ToggleStep({
  n,
  checked,
  onChange,
  disabled,
  label,
  hint,
  required,
}: {
  n: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  label: string;
  hint: string;
  required?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="mt-0.5 shrink-0 disabled:opacity-50"
        aria-pressed={checked}
        aria-label={label}
      >
        {checked ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <Circle className={`h-5 w-5 ${required ? "text-rose-400" : "text-gray-300"}`} />
        )}
      </button>
      <div>
        <div className="text-sm font-medium text-gray-800">
          {n}. {label} {required && <span className="text-rose-500">*</span>}
        </div>
        <div className="text-xs text-gray-400">{hint}</div>
      </div>
    </li>
  );
}
