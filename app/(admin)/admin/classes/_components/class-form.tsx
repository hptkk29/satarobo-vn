"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createClass, updateClass } from "../_actions";

export type ClassFormValue = {
  id: string;
  classCode: string | null;
  name: string;
  description: string | null;
  courseId: string;
  centerId: string | null;
  roomId: string | null;
  teacherId: string | null;
  assistantId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  scheduleDays: number[];
  startTime: string | null;
  endTime: string | null;
  maxStudents: number;
  minStudents: number;
  status: "PLANNED" | "RECRUITING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  notes: string | null;
};

interface CourseOption {
  id: string;
  name: string;
}
interface CenterOption {
  id: string;
  name: string;
}
interface RoomOption {
  id: string;
  code: string;
  name: string;
  centerId: string;
}
interface TeacherOption {
  id: string;
  name: string;
  role: string;
}

const STATUS_OPTIONS = [
  { value: "PLANNED", label: "Đang lên KH" },
  { value: "RECRUITING", label: "Tuyển sinh" },
  { value: "ACTIVE", label: "Đang dạy" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CANCELLED", label: "Huỷ" },
] as const;

const WEEKDAY_OPTIONS = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 0, label: "CN" },
] as const;

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function ClassForm({
  cls,
  courses,
  centers,
  rooms,
  teachers,
}: {
  cls?: ClassFormValue;
  courses: CourseOption[];
  centers: CenterOption[];
  rooms: RoomOption[];
  teachers: TeacherOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(cls);
  const [error, setError] = useState<string | null>(null);

  const [centerId, setCenterId] = useState<string>(cls?.centerId ?? "");
  const [roomId, setRoomId] = useState<string>(cls?.roomId ?? "");
  const [teacherId, setTeacherId] = useState<string>(cls?.teacherId ?? "");
  const [assistantId, setAssistantId] = useState<string>(cls?.assistantId ?? "");
  const [scheduleDays, setScheduleDays] = useState<number[]>(cls?.scheduleDays ?? []);

  const filteredRooms = useMemo(
    () => (centerId ? rooms.filter((r) => r.centerId === centerId) : rooms),
    [rooms, centerId],
  );
  const filteredAssistants = useMemo(
    () => teachers.filter((t) => t.id !== teacherId),
    [teachers, teacherId],
  );

  async function action(formData: FormData) {
    setError(null);
    // Replace scheduleDays entries with our state, in case checkboxes were
    // toggled but the controlled state is canonical.
    formData.delete("scheduleDays");
    for (const d of scheduleDays) formData.append("scheduleDays", String(d));

    const res = isEdit
      ? await updateClass(cls!.id, formData)
      : await createClass(formData);
    if (res?.error) setError(res.error);
  }

  function toggleDay(d: number, checked: boolean) {
    setScheduleDays((prev) =>
      checked
        ? Array.from(new Set([...prev, d])).sort((a, b) => a - b)
        : prev.filter((x) => x !== d),
    );
  }

  function onCenterChange(value: string) {
    setCenterId(value);
    // Reset room if it doesn't belong to the new center
    if (roomId && !rooms.some((r) => r.id === roomId && r.centerId === value)) {
      setRoomId("");
    }
  }

  function onTeacherChange(value: string) {
    setTeacherId(value);
    if (assistantId && assistantId === value) setAssistantId("");
  }

  return (
    <form action={action} className="max-w-4xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1. Identity */}
      <Section title="Thông tin lớp học">
        <Grid cols={2}>
          <Field
            label="Tên lớp"
            name="name"
            defaultValue={cls?.name}
            placeholder="Lập trình Robot K1 - Đà Nẵng"
            required
          />
          <Field
            label="Mã lớp"
            name="classCode"
            defaultValue={cls?.classCode ?? undefined}
            placeholder="SR-LR-2026-01"
            helper="Tuỳ chọn — duy nhất toàn hệ thống nếu có"
          />
        </Grid>

        <Grid cols={3}>
          <SelectField
            label="Khoá học"
            name="courseId"
            defaultValue={cls?.courseId ?? ""}
            required
            options={[
              { value: "", label: "— Chọn khoá học —" },
              ...courses.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <SelectField
            label="Cơ sở"
            name="centerId"
            value={centerId}
            onChange={onCenterChange}
            required
            options={[
              { value: "", label: "— Chọn cơ sở —" },
              ...centers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <SelectField
            label="Trạng thái"
            name="status"
            defaultValue={cls?.status ?? "PLANNED"}
            required
            options={[...STATUS_OPTIONS]}
          />
        </Grid>

        <Field
          label="Mô tả ngắn"
          name="description"
          type="textarea"
          rows={2}
          defaultValue={cls?.description ?? undefined}
          placeholder="Mô tả lớp học (có thể hiển thị public)"
        />
      </Section>

      {/* 2. Assignment */}
      <Section title="Phân công">
        <Grid cols={3}>
          <SelectField
            label="Phòng học"
            name="roomId"
            value={roomId}
            onChange={setRoomId}
            options={[
              { value: "", label: "— Chưa phân —" },
              ...filteredRooms.map((r) => ({
                value: r.id,
                label: `${r.code} — ${r.name}`,
              })),
            ]}
            helper={
              centerId
                ? "Chỉ hiển thị phòng của cơ sở đã chọn"
                : "Chọn cơ sở để lọc phòng"
            }
          />
          <SelectField
            label="GV chính"
            name="teacherId"
            value={teacherId}
            onChange={onTeacherChange}
            options={[
              { value: "", label: "— Chưa phân —" },
              ...teachers.map((t) => ({
                value: t.id,
                label: `${t.name}${t.role === "MANAGER" ? " (QL)" : ""}`,
              })),
            ]}
          />
          <SelectField
            label="GV phụ"
            name="assistantId"
            value={assistantId}
            onChange={setAssistantId}
            options={[
              { value: "", label: "— Không có —" },
              ...filteredAssistants.map((t) => ({
                value: t.id,
                label: t.name,
              })),
            ]}
            helper="GV phụ không được trùng GV chính"
          />
        </Grid>
      </Section>

      {/* 3. Schedule */}
      <Section title="Lịch học">
        <Grid cols={2}>
          <Field
            label="Ngày khai giảng"
            name="startDate"
            type="date"
            defaultValue={toDateInput(cls?.startDate ?? null)}
          />
          <Field
            label="Ngày kết thúc dự kiến"
            name="endDate"
            type="date"
            defaultValue={toDateInput(cls?.endDate ?? null)}
          />
        </Grid>

        <div>
          <label className="mb-2 block text-sm font-semibold text-neutral-700">
            Các thứ học trong tuần
          </label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((day) => {
              const active = scheduleDays.includes(day.value);
              return (
                <label
                  key={day.value}
                  className={
                    "cursor-pointer select-none rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-orange-300")
                  }
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => toggleDay(day.value, e.target.checked)}
                    className="hidden"
                  />
                  {day.label}
                </label>
              );
            })}
          </div>
        </div>

        <Grid cols={2}>
          <Field
            label="Giờ bắt đầu"
            name="startTime"
            type="time"
            defaultValue={cls?.startTime ?? undefined}
          />
          <Field
            label="Giờ kết thúc"
            name="endTime"
            type="time"
            defaultValue={cls?.endTime ?? undefined}
          />
        </Grid>
      </Section>

      {/* 4. Capacity + Notes */}
      <Section title="Sức chứa & Ghi chú">
        <Grid cols={2}>
          <Field
            label="Số HS tối thiểu"
            name="minStudents"
            type="number"
            min={1}
            defaultValue={cls?.minStudents ?? 5}
            required
          />
          <Field
            label="Số HS tối đa"
            name="maxStudents"
            type="number"
            min={1}
            defaultValue={cls?.maxStudents ?? 20}
            required
          />
        </Grid>

        <Field
          label="Ghi chú nội bộ"
          name="notes"
          type="textarea"
          rows={3}
          defaultValue={cls?.notes ?? undefined}
          placeholder="Note cho admin (không hiển thị public)"
        />
      </Section>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/classes")}
          className="rounded-xl border-2 border-neutral-200 bg-white px-6 py-3 font-bold text-neutral-700 hover:bg-neutral-50"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-[#7C3AED] px-6 py-3 font-bold text-white shadow-md hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo lớp"}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-neutral-700">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  const grid = cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return <div className={`grid grid-cols-1 ${grid} gap-4`}>{children}</div>;
}

type FieldProps = {
  label: string;
  name: string;
  type?: "text" | "number" | "email" | "textarea" | "date" | "time";
  rows?: number;
  min?: number;
  max?: number;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  helper?: string;
};

function Field({
  label,
  name,
  type = "text",
  rows = 3,
  min,
  max,
  defaultValue,
  placeholder,
  required,
  helper,
}: FieldProps) {
  const value = defaultValue ?? "";
  const baseClass =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {type === "textarea" ? (
        <textarea
          name={name}
          rows={rows}
          defaultValue={value}
          placeholder={placeholder}
          required={required}
          className={`${baseClass} resize-y`}
        />
      ) : (
        <input
          type={type}
          name={name}
          min={min}
          max={max}
          defaultValue={value}
          placeholder={placeholder}
          required={required}
          className={baseClass}
        />
      )}
      {helper && <span className="mt-1 block text-xs text-neutral-500">{helper}</span>}
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  helper?: string;
};

function SelectField({
  label,
  name,
  options,
  defaultValue,
  value,
  onChange,
  required,
  helper,
}: SelectFieldProps) {
  const isControlled = value !== undefined;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <select
        name={name}
        {...(isControlled
          ? { value, onChange: (e) => onChange?.(e.target.value) }
          : { defaultValue: defaultValue ?? "" })}
        required={required}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helper && <span className="mt-1 block text-xs text-neutral-500">{helper}</span>}
    </label>
  );
}
