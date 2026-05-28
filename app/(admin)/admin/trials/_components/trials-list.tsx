"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ChildGrasp, TrialClassStatus } from "@prisma/client";
import {
  TRIAL_STATUS_BADGE,
  ALL_TRIAL_STATUSES,
  CHILD_GRASP_LABEL,
} from "@/lib/trials/status";
import { updateTrialAction, saveTrialFeedbackAction } from "../actions";

type Opt = { id: string; name: string };
type LabelOpt = { id: string; label: string };

type Feedback = {
  childEnjoyed: boolean | null;
  childGrasp: ChildGrasp | null;
  teacherSuggestion: string | null;
  parentFeedback: string | null;
  recommendedCourseId: string | null;
};

export type TrialItem = {
  id: string;
  leadId: string;
  parentName: string;
  phone: string;
  childName: string | null;
  centerName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  roomId: string | null;
  classId: string | null;
  scheduledAt: string;
  status: TrialClassStatus;
  notes: string | null;
  feedback: Feedback | null;
};

interface Props {
  items: TrialItem[];
  teachers: Opt[];
  rooms: LabelOpt[];
  classes: LabelOpt[];
  courses: Opt[];
  canManage: boolean;
  canFeedback: boolean;
  statusFilter: string;
  statusLabels: Record<TrialClassStatus, string>;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function TrialsList({
  items,
  teachers,
  rooms,
  classes,
  courses,
  canManage,
  canFeedback,
  statusFilter,
  statusLabels,
}: Props) {
  return (
    <div>
      {/* Filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip label="Tất cả" href="/trials" active={!statusFilter} />
        {ALL_TRIAL_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={statusLabels[s]}
            href={`/trials?status=${s}`}
            active={statusFilter === s}
          />
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Chưa có buổi học thử nào.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <TrialCard
              key={item.id}
              item={item}
              teachers={teachers}
              rooms={rooms}
              classes={classes}
              courses={courses}
              canManage={canManage}
              canFeedback={canFeedback}
              statusLabels={statusLabels}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-orange-500 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </Link>
  );
}

function TrialCard({
  item,
  teachers,
  rooms,
  classes,
  courses,
  canManage,
  canFeedback,
  statusLabels,
}: {
  item: TrialItem;
  teachers: Opt[];
  rooms: LabelOpt[];
  classes: LabelOpt[];
  courses: Opt[];
  canManage: boolean;
  canFeedback: boolean;
  statusLabels: Record<TrialClassStatus, string>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Manage form state
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(item.scheduledAt));
  const [status, setStatus] = useState<TrialClassStatus>(item.status);
  const [teacherId, setTeacherId] = useState(item.teacherId ?? "");
  const [roomId, setRoomId] = useState(item.roomId ?? "");
  const [classId, setClassId] = useState(item.classId ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  // Feedback form state
  const fb = item.feedback;
  const [childEnjoyed, setChildEnjoyed] = useState<string>(
    fb?.childEnjoyed === true ? "yes" : fb?.childEnjoyed === false ? "no" : "",
  );
  const [childGrasp, setChildGrasp] = useState<string>(fb?.childGrasp ?? "");
  const [teacherSuggestion, setTeacherSuggestion] = useState(
    fb?.teacherSuggestion ?? "",
  );
  const [parentFeedback, setParentFeedback] = useState(fb?.parentFeedback ?? "");
  const [recommendedCourseId, setRecommendedCourseId] = useState(
    fb?.recommendedCourseId ?? "",
  );

  function saveManage() {
    startTransition(async () => {
      const res = await updateTrialAction(item.id, {
        scheduledAt,
        status,
        teacherId: teacherId || null,
        roomId: roomId || null,
        classId: classId || null,
        notes: notes || null,
      });
      if (res.ok) toast.success("Đã cập nhật buổi học thử");
      else toast.error(res.error ?? "Lỗi cập nhật");
    });
  }

  function saveFeedback() {
    startTransition(async () => {
      const res = await saveTrialFeedbackAction(item.id, {
        childEnjoyed:
          childEnjoyed === "yes" ? true : childEnjoyed === "no" ? false : null,
        childGrasp: (childGrasp || null) as ChildGrasp | null,
        teacherSuggestion: teacherSuggestion || null,
        parentFeedback: parentFeedback || null,
        recommendedCourseId: recommendedCourseId || null,
      });
      if (res.ok) toast.success("Đã lưu nhận xét");
      else toast.error(res.error ?? "Lỗi lưu nhận xét");
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{item.parentName}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TRIAL_STATUS_BADGE[item.status]}`}
            >
              {statusLabels[item.status]}
            </span>
            {fb && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                Đã có nhận xét
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {item.childName ? `Con: ${item.childName} · ` : ""}
            {item.phone}
            {item.centerName ? ` · ${item.centerName}` : ""}
            {item.teacherName ? ` · GV: ${item.teacherName}` : ""}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          {new Date(item.scheduledAt).toLocaleString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </button>

      {open && (
        <div className="grid gap-6 border-t border-gray-100 p-4 md:grid-cols-2">
          {/* Manage */}
          <div className={canManage ? "" : "opacity-60"}>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              Xếp lịch & trạng thái
            </h3>
            <div className="space-y-3">
              <Field label="Thời gian">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={!canManage}
                  className={inputCls}
                />
              </Field>
              <Field label="Trạng thái">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TrialClassStatus)}
                  disabled={!canManage}
                  className={inputCls}
                >
                  {ALL_TRIAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Giáo viên">
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  disabled={!canManage}
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
                  disabled={!canManage}
                  className={inputCls}
                >
                  <option value="">— Không —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ghép vào lớp (tùy chọn)">
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  disabled={!canManage}
                  className={inputCls}
                >
                  <option value="">— Không —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ghi chú">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canManage}
                  rows={2}
                  className={inputCls}
                />
              </Field>
              {canManage && (
                <button
                  type="button"
                  onClick={saveManage}
                  disabled={pending}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  Lưu lịch
                </button>
              )}
            </div>
          </div>

          {/* Feedback */}
          <div className={canFeedback ? "" : "opacity-60"}>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              Nhận xét sau buổi học thử
            </h3>
            <div className="space-y-3">
              <Field label="Bé có thích không?">
                <select
                  value={childEnjoyed}
                  onChange={(e) => setChildEnjoyed(e.target.value)}
                  disabled={!canFeedback}
                  className={inputCls}
                >
                  <option value="">—</option>
                  <option value="yes">Có, bé hứng thú</option>
                  <option value="no">Chưa thực sự thích</option>
                </select>
              </Field>
              <Field label="Khả năng tiếp thu">
                <select
                  value={childGrasp}
                  onChange={(e) => setChildGrasp(e.target.value)}
                  disabled={!canFeedback}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {(Object.keys(CHILD_GRASP_LABEL) as ChildGrasp[]).map((g) => (
                    <option key={g} value={g}>
                      {CHILD_GRASP_LABEL[g]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Khoá đề xuất">
                <select
                  value={recommendedCourseId}
                  onChange={(e) => setRecommendedCourseId(e.target.value)}
                  disabled={!canFeedback}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Gợi ý của giáo viên">
                <textarea
                  value={teacherSuggestion}
                  onChange={(e) => setTeacherSuggestion(e.target.value)}
                  disabled={!canFeedback}
                  rows={2}
                  className={inputCls}
                />
              </Field>
              <Field label="Phản hồi của phụ huynh">
                <textarea
                  value={parentFeedback}
                  onChange={(e) => setParentFeedback(e.target.value)}
                  disabled={!canFeedback}
                  rows={2}
                  className={inputCls}
                />
              </Field>
              {canFeedback && (
                <button
                  type="button"
                  onClick={saveFeedback}
                  disabled={pending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Lưu nhận xét
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}
