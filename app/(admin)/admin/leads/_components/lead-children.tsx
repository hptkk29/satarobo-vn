"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, X, Check, Baby } from "lucide-react";
import { toast } from "sonner";
import { addLeadChild, updateLeadChild, deleteLeadChild } from "../actions";
import {
  groupTeachableCourses,
  type CourseOptGroup,
  type TeachableCourse,
} from "@/lib/courses/grouped";

export type Option = { id: string; name: string };

export type ChildDraft = {
  fullName: string;
  dob: string; // yyyy-mm-dd hoặc ""
  ageYears: string;
  gender: string;
  schoolName: string;
  gradeLevel: string;
  interestedCourseId: string;
  interestedCenterId: string;
  note: string;
};

export type ChildView = {
  id: string;
  fullName: string;
  dob: string | null; // ISO date
  ageYears: number | null;
  gender: string | null;
  schoolName: string | null;
  gradeLevel: string | null;
  interestedCourseId: string | null;
  interestedCenterId: string | null;
  note: string | null;
  trialStatus: string;
  // FL-R2 (item 6/TR-4) — lịch sử đã từng học thử (giữ kể cả khi lead quay lại pipeline).
  trialHistory?: {
    className: string;
    attendedCount: number;
    totalSessions: number;
    lastAttendedAt: string | null; // ISO
    outcome: string | null;
  }[];
};

/** "Đã học thử (ngày…) · n/N buổi" cho 1 dòng lịch sử. */
function formatTrialHistory(h: NonNullable<ChildView["trialHistory"]>[number]): string {
  const date = h.lastAttendedAt
    ? new Date(h.lastAttendedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : null;
  const parts = [`Đã học thử${date ? ` (${date})` : ""}`, `${h.attendedCount}/${h.totalSessions} buổi`, h.className];
  return parts.filter(Boolean).join(" · ");
}

export const emptyChild: ChildDraft = {
  fullName: "",
  dob: "",
  ageYears: "",
  gender: "",
  schoolName: "",
  gradeLevel: "",
  interestedCourseId: "",
  interestedCenterId: "",
  note: "",
};

const GENDERS = ["Nam", "Nữ", "Khác"];

const TRIAL_LABEL: Record<string, string> = {
  NONE: "Chưa học thử",
  SCHEDULED: "Đã hẹn học thử",
  IN_PROGRESS: "Đang học thử",
  ATTENDED: "Đã học thử",
};

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none";

/** Chuyển draft (string) → payload gửi server (bỏ field rỗng). */
export function childDraftToPayload(d: ChildDraft): Record<string, unknown> {
  return {
    fullName: d.fullName.trim(),
    dob: d.dob || undefined,
    ageYears: d.ageYears ? Number(d.ageYears) : undefined,
    gender: d.gender || undefined,
    schoolName: d.schoolName.trim() || undefined,
    gradeLevel: d.gradeLevel.trim() || undefined,
    interestedCourseId: d.interestedCourseId || undefined,
    interestedCenterId: d.interestedCenterId || undefined,
    note: d.note.trim() || undefined,
  };
}

function viewToDraft(c: ChildView): ChildDraft {
  return {
    fullName: c.fullName,
    dob: c.dob ? c.dob.slice(0, 10) : "",
    ageYears: c.ageYears != null ? String(c.ageYears) : "",
    gender: c.gender ?? "",
    schoolName: c.schoolName ?? "",
    gradeLevel: c.gradeLevel ?? "",
    interestedCourseId: c.interestedCourseId ?? "",
    interestedCenterId: c.interestedCenterId ?? "",
    note: c.note ?? "",
  };
}

/** Bộ field cho 1 con — dùng chung cho form tạo lead (nháp) và quản lý chi tiết. */
export function ChildFields({
  value,
  onChange,
  centers,
  courseGroups,
}: {
  value: ChildDraft;
  onChange: (patch: Partial<ChildDraft>) => void;
  centers: Option[];
  courseGroups: CourseOptGroup[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-gray-500">Họ tên con *</span>
        <input
          value={value.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Ngày sinh</span>
        <input
          type="date"
          value={value.dob}
          onChange={(e) => onChange({ dob: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Tuổi</span>
        <input
          type="number"
          min={3}
          max={18}
          value={value.ageYears}
          onChange={(e) => onChange({ ageYears: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Giới tính</span>
        <select
          value={value.gender}
          onChange={(e) => onChange({ gender: e.target.value })}
          className={inputCls}
        >
          <option value="">—</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Lớp/Khối</span>
        <input
          value={value.gradeLevel}
          onChange={(e) => onChange({ gradeLevel: e.target.value })}
          className={inputCls}
          placeholder="VD: Lớp 4"
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-gray-500">Trường</span>
        <input
          value={value.schoolName}
          onChange={(e) => onChange({ schoolName: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Khoá quan tâm</span>
        <select
          value={value.interestedCourseId}
          onChange={(e) => onChange({ interestedCourseId: e.target.value })}
          className={inputCls}
        >
          <option value="">— Chưa chọn —</option>
          {courseGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Cơ sở quan tâm</span>
        <select
          value={value.interestedCenterId}
          onChange={(e) => onChange({ interestedCenterId: e.target.value })}
          className={inputCls}
        >
          <option value="">— Chưa chọn —</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-gray-500">Ghi chú</span>
        <textarea
          value={value.note}
          onChange={(e) => onChange({ note: e.target.value })}
          rows={2}
          className={inputCls}
        />
      </label>
    </div>
  );
}

/**
 * Quản lý danh sách con đã lưu của 1 lead (trang chi tiết / sửa). Mỗi thao tác
 * gọi server action ngay (addLeadChild / updateLeadChild / deleteLeadChild) trong
 * useTransition rồi router.refresh().
 *
 * - `readOnly` (lead LOST/đã chốt…): chỉ hiển thị, không cho sửa.
 * - Field phẳng cũ (childName/childAge) hiển thị read-only + nút "Tạo LeadChild mới".
 */
export function LeadChildrenManager({
  leadId,
  childrenList,
  centers,
  courses,
  readOnly = false,
  legacyChildName,
  legacyChildAge,
}: {
  leadId: string;
  childrenList: ChildView[];
  centers: Option[];
  courses: TeachableCourse[];
  readOnly?: boolean;
  legacyChildName?: string | null;
  legacyChildAge?: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const courseGroups = groupTeachableCourses(courses);
  const courseName = (id: string | null) =>
    id ? courses.find((c) => c.id === id)?.name ?? null : null;
  const centerName = (id: string | null) =>
    id ? centers.find((c) => c.id === id)?.name ?? null : null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ChildDraft>(emptyChild);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const patch = (p: Partial<ChildDraft>) => setForm((f) => ({ ...f, ...p }));

  function startAdd(prefill?: Partial<ChildDraft>) {
    setEditingId(null);
    setDeleteId(null);
    setForm({ ...emptyChild, ...prefill });
    setAdding(true);
  }
  function startEdit(c: ChildView) {
    setAdding(false);
    setDeleteId(null);
    setForm(viewToDraft(c));
    setEditingId(c.id);
  }
  function cancel() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyChild);
  }

  function save() {
    if (!form.fullName.trim()) {
      toast.error("Nhập họ tên con");
      return;
    }
    const payload = childDraftToPayload(form);
    startTransition(async () => {
      const res = editingId
        ? await updateLeadChild(editingId, payload)
        : await addLeadChild({ leadId, ...payload });
      if (res.ok) {
        toast.success(editingId ? "Đã lưu thông tin con" : "Đã thêm con");
        cancel();
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  function remove(id: string) {
    if (deleteId !== id) {
      setDeleteId(id);
      return;
    }
    startTransition(async () => {
      const res = await deleteLeadChild(id);
      if (res.ok) {
        toast.success("Đã xoá con");
        setDeleteId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  const showLegacy = !!legacyChildName || legacyChildAge != null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <Baby size={16} /> Con của phụ huynh ({childrenList.length})
        </h2>
        {!readOnly && !adding && editingId === null && (
          <button
            type="button"
            onClick={() => startAdd()}
            className="inline-flex items-center gap-1 rounded-lg border-2 border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft"
          >
            <Plus size={14} /> Thêm con
          </button>
        )}
      </div>

      {/* Field phẳng cũ (read-only) + nút tạo LeadChild từ dữ liệu cũ */}
      {showLegacy && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-gray-700">Thông tin con (cũ):</span>{" "}
            {legacyChildName || "—"}
            {legacyChildAge != null && <span> · {legacyChildAge} tuổi</span>}
          </p>
          {!readOnly && (
            <button
              type="button"
              onClick={() =>
                startAdd({
                  fullName: legacyChildName ?? "",
                  ageYears: legacyChildAge != null ? String(legacyChildAge) : "",
                })
              }
              className="inline-flex items-center gap-1 rounded-md border border-primary px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary-soft"
            >
              <Plus size={12} /> Tạo LeadChild mới
            </button>
          )}
        </div>
      )}

      {/* Danh sách con đã lưu */}
      {childrenList.length === 0 && !adding && (
        <p className="py-4 text-center text-sm text-gray-400">Chưa có con nào.</p>
      )}

      <ul className="space-y-2">
        {childrenList.map((c) =>
          editingId === c.id ? (
            <li key={c.id} className="rounded-lg border border-primary-soft bg-primary-soft/40 p-3">
              <ChildFields
                value={form}
                onChange={patch}
                centers={centers}
                courseGroups={courseGroups}
              />
              <EditorButtons isPending={isPending} onSave={save} onCancel={cancel} />
            </li>
          ) : (
            <li
              key={c.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{c.fullName}</span>
                  {c.ageYears != null && (
                    <span className="text-xs text-gray-500">{c.ageYears} tuổi</span>
                  )}
                  {c.gender && <span className="text-xs text-gray-500">· {c.gender}</span>}
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                    {TRIAL_LABEL[c.trialStatus] ?? c.trialStatus}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {[
                    c.gradeLevel,
                    c.schoolName,
                    courseName(c.interestedCourseId),
                    centerName(c.interestedCenterId),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
                {c.note && <p className="mt-1 text-xs text-gray-600">{c.note}</p>}
                {c.trialHistory && c.trialHistory.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {c.trialHistory.map((h, i) => (
                      <p key={i} className="text-[11px] font-medium text-primary">
                        {formatTrialHistory(h)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              {!readOnly && (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-50"
                  >
                    <Pencil size={12} /> Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    disabled={isPending}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50 ${ deleteId === c.id ? "border-state-danger bg-state-danger text-white" : "border-state-danger text-state-danger-ink hover:bg-state-danger-soft" }`}
                  >
                    <Trash2 size={12} /> {deleteId === c.id ? "Xác nhận" : "Xoá"}
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>

      {/* Form thêm con */}
      {adding && (
        <div className="mt-2 rounded-lg border border-primary-soft bg-primary-soft/40 p-3">
          <ChildFields
            value={form}
            onChange={patch}
            centers={centers}
            courseGroups={courseGroups}
          />
          <EditorButtons isPending={isPending} onSave={save} onCancel={cancel} />
        </div>
      )}
    </div>
  );
}

function EditorButtons({
  isPending,
  onSave,
  onCancel,
}: {
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onSave}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        <Check size={14} /> {isPending ? "Đang lưu…" : "Lưu"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        <X size={14} /> Huỷ
      </button>
    </div>
  );
}
