"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClass, updateClass } from "../_actions";
import { groupTeachableCourses, type TeachableCourse } from "@/lib/courses/grouped";
import { filterTeachersByCenter } from "@/lib/teachers/center-filter";

export type ClassFormValue = {
  id: string;
  classCode: string | null;
  name: string;
  description: string | null;
  courseId: string;
  orgUnitId: string | null;
  classGroupId: string | null;
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
  status: "PLANNED" | "RECRUITING" | "PENDING_APPROVAL" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  notes: string | null;
};

type CourseOption = TeachableCourse;

interface OrgUnitOption {
  id: string;
  name: string;
  centerId: string | null; // để lọc phòng học theo cơ sở (HO không có cơ sở → null)
}
interface ClassGroupOption {
  id: string;
  displayCode: string;
  name: string | null;
  centerId: string;
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
  centerId: string | null; // R2-RBAC-3 — lọc GV theo cơ sở của đơn vị đang chọn
}
export interface CurriculumOption {
  id: string;
  courseId: string;
  version: number;
  name: string;
}

// "Chờ duyệt" KHÔNG cho chọn tay — chỉ set tự động khi sale "Gửi duyệt".
const STATUS_OPTIONS = [
  { value: "PLANNED", label: "Đang lên KH" },
  { value: "RECRUITING", label: "Tuyển sinh" },
  { value: "ACTIVE", label: "Đang dạy" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CANCELLED", label: "Huỷ" },
] as const;

const PENDING_OPTION = { value: "PENDING_APPROVAL", label: "Chờ duyệt" } as const;

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
  orgUnits,
  classGroups,
  rooms,
  teachers,
  curricula = [],
  canEdit = true,
}: {
  cls?: ClassFormValue;
  courses: CourseOption[];
  orgUnits: OrgUnitOption[];
  classGroups: ClassGroupOption[];
  rooms: RoomOption[];
  teachers: TeacherOption[];
  /** R7-06 — giáo trình ACTIVE (sắp xếp version giảm dần) để chốt version lúc tạo lớp. */
  curricula?: CurriculumOption[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const isEdit = Boolean(cls);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [courseId, setCourseId] = useState<string>(cls?.courseId ?? "");
  const [curriculumId, setCurriculumId] = useState<string>(() => {
    if (!cls?.courseId) return "";
    const list = curricula
      .filter((c) => c.courseId === cls.courseId)
      .sort((a, b) => b.version - a.version);
    return list[0]?.id ?? "";
  });
  const [orgUnitId, setOrgUnitId] = useState<string>(cls?.orgUnitId ?? "");
  const [roomId, setRoomId] = useState<string>(cls?.roomId ?? "");
  const [teacherId, setTeacherId] = useState<string>(cls?.teacherId ?? "");
  const [assistantId, setAssistantId] = useState<string>(cls?.assistantId ?? "");
  const [scheduleDays, setScheduleDays] = useState<number[]>(cls?.scheduleDays ?? []);

  // Cơ sở của đơn vị đang chọn — dùng để lọc phòng học (HO → null → không có phòng cơ sở).
  const selectedCenterId = useMemo(
    () => orgUnits.find((o) => o.id === orgUnitId)?.centerId ?? null,
    [orgUnits, orgUnitId],
  );
  const filteredRooms = useMemo(
    () =>
      orgUnitId && selectedCenterId
        ? rooms.filter((r) => r.centerId === selectedCenterId)
        : orgUnitId
          ? []
          : rooms,
    [rooms, orgUnitId, selectedCenterId],
  );
  // R2-RBAC-3 — GV chính chỉ liệt kê người CÙNG cơ sở với đơn vị đang chọn (cách ly
  // CS1↔CS2). LUÔN giữ GV/TA đang chọn + GV đang gán sẵn của lớp để <Select> không
  // tự rớt value (gốc bug "Lớp học hiện trống"). Dùng helper thuần đã unit-test.
  const filteredTeachers = useMemo(() => {
    if (!orgUnitId) return teachers; // chưa chọn đơn vị → hiện tất (sẽ lọc sau khi chọn)
    return filterTeachersByCenter(teachers, selectedCenterId, [
      teacherId,
      assistantId,
      cls?.teacherId,
      cls?.assistantId,
    ]);
  }, [teachers, orgUnitId, selectedCenterId, teacherId, assistantId, cls]);
  const filteredAssistants = useMemo(
    () => filteredTeachers.filter((t) => t.id !== teacherId),
    [filteredTeachers, teacherId],
  );
  const courseCurricula = useMemo(
    () =>
      curricula
        .filter((c) => c.courseId === courseId)
        .sort((a, b) => b.version - a.version),
    [curricula, courseId],
  );

  function onCourseChange(value: string) {
    setCourseId(value);
    const latest = curricula
      .filter((c) => c.courseId === value)
      .sort((a, b) => b.version - a.version)[0];
    setCurriculumId(latest?.id ?? "");
  }

  // Dùng onSubmit + preventDefault thay cho <form action> để React 19 KHÔNG tự
  // reset các field khi submit lỗi validation (#7 Đợt 4). Thành công → toast +
  // client điều hướng (QA 20/07 Vấn đề 4 — trước đây redirect âm thầm).
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.delete("scheduleDays");
    for (const d of scheduleDays) formData.append("scheduleDays", String(d));

    const res = isEdit
      ? await updateClass(cls!.id, formData)
      : await createClass(formData);
    if (res?.error) {
      setError(res.error);
      setPending(false);
      return;
    }
    toast.success(isEdit ? "Đã cập nhật lớp học" : "Đã tạo lớp học mới");
    router.push("/classes");
  }

  function toggleDay(d: number, checked: boolean) {
    setScheduleDays((prev) =>
      checked
        ? Array.from(new Set([...prev, d])).sort((a, b) => a - b)
        : prev.filter((x) => x !== d),
    );
  }

  function onOrgUnitChange(value: string) {
    setOrgUnitId(value);
    // Reset phòng học nếu không thuộc cơ sở của đơn vị mới.
    const newCenterId = orgUnits.find((o) => o.id === value)?.centerId ?? null;
    if (roomId && !rooms.some((r) => r.id === roomId && r.centerId === newCenterId)) {
      setRoomId("");
    }
    // R2-RBAC-3 — đổi cơ sở thì GV/TA cũ (khác cơ sở) không còn hợp lệ → reset.
    const inNewCenter = (id: string) =>
      newCenterId != null && teachers.some((t) => t.id === id && t.centerId === newCenterId);
    if (teacherId && !inNewCenter(teacherId)) setTeacherId("");
    if (assistantId && !inNewCenter(assistantId)) setAssistantId("");
  }

  function onTeacherChange(value: string) {
    setTeacherId(value);
    if (assistantId && assistantId === value) setAssistantId("");
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <fieldset disabled={!canEdit} className="space-y-6 border-0 p-0 m-0">
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
              value={courseId}
              onChange={onCourseChange}
              required
              options={[{ value: "", label: "— Chọn khoá cụ thể —" }]}
              groups={groupTeachableCourses(courses)}
            />
            <SelectField
              label="Đơn vị"
              name="orgUnitId"
              value={orgUnitId}
              onChange={onOrgUnitChange}
              required
              options={[
                { value: "", label: "— Chọn đơn vị —" },
                ...orgUnits.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <SelectField
              label="Trạng thái"
              name="status"
              defaultValue={cls?.status ?? "PLANNED"}
              required
              options={
                cls?.status === "PENDING_APPROVAL"
                  ? [PENDING_OPTION, ...STATUS_OPTIONS]
                  : [...STATUS_OPTIONS]
              }
            />
          </Grid>

          <SelectField
            label="Nhóm lớp cố định (tuỳ chọn)"
            name="classGroupId"
            defaultValue={cls?.classGroupId ?? ""}
            options={[
              { value: "", label: "— Không gán nhóm —" },
              ...classGroups.map((g) => ({
                value: g.id,
                label: `${g.displayCode}${g.name ? ` · ${g.name}` : ""}`,
              })),
            ]}
            helper="Nếu chọn, lớp sẽ kế thừa cơ sở của nhóm. Dùng cho lộ trình tăng khoá Sata3 → 4 → 5…"
          />

          <Field
            label="Mô tả ngắn"
            name="description"
            type="textarea"
            rows={2}
            defaultValue={cls?.description ?? undefined}
            placeholder="Mô tả lớp học (có thể hiển thị public)"
          />

          {/* R7-06 — chốt version giáo trình lúc tạo lớp (chỉ khi tạo mới). */}
          {!isEdit && (
            <div>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-neutral-700">
                  Giáo trình áp dụng
                  <span className="ml-1 text-red-500">*</span>
                </span>
                <select
                  name="curriculumId"
                  value={curriculumId}
                  onChange={(e) => setCurriculumId(e.target.value)}
                  disabled={!courseId || courseCurricula.length === 0}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 disabled:bg-neutral-100"
                >
                  {courseCurricula.length === 0 ? (
                    <option value="">— Khoá chưa có giáo trình ACTIVE —</option>
                  ) : (
                    courseCurricula.map((c) => (
                      <option key={c.id} value={c.id}>
                        v{c.version} · {c.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {courseId && courseCurricula.length === 0 ? (
                <span className="mt-1 block text-xs text-red-600">
                  Khoá học chưa có giáo trình đang áp dụng (ACTIVE) — không thể tạo
                  lớp. Hãy kích hoạt giáo trình trước.
                </span>
              ) : (
                <span className="mt-1 block text-xs text-neutral-500">
                  Mặc định = version ACTIVE mới nhất. Version được chốt (snapshot)
                  vào lớp và sinh kế hoạch buổi.
                </span>
              )}
            </div>
          )}
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
                orgUnitId
                  ? "Chỉ hiển thị phòng của cơ sở thuộc đơn vị đã chọn"
                  : "Chọn đơn vị để lọc phòng"
              }
            />
            <SelectField
              label="GV chính"
              name="teacherId"
              value={teacherId}
              onChange={onTeacherChange}
              options={[
                { value: "", label: "— Chưa phân GV —" },
                ...filteredTeachers.map((t) => ({ value: t.id, label: t.name })),
              ]}
              helper={
                orgUnitId
                  ? "Chỉ hiển thị GV của cơ sở thuộc đơn vị đã chọn"
                  : "Chọn đơn vị để lọc GV theo cơ sở"
              }
            />
            <SelectField
              label="Trợ giảng"
              name="assistantId"
              value={assistantId}
              onChange={setAssistantId}
              options={[
                { value: "", label: "— Chưa phân TA —" },
                ...filteredAssistants.map((t) => ({ value: t.id, label: t.name })),
              ]}
              helper="Lọc: Trợ giảng (không trùng GV chính)"
            />
          </Grid>

          <Grid cols={3}>
            <Field
              label="Ngày khai giảng"
              name="startDate"
              type="date"
              defaultValue={toDateInput(cls?.startDate ?? null)}
              required
            />
            <Field
              label="Ngày bế giảng (tuỳ chọn)"
              name="endDate"
              type="date"
              defaultValue={toDateInput(cls?.endDate ?? null)}
            />
            <div>
              <span className="mb-2 block text-sm font-semibold text-neutral-700">
                Lịch học trong tuần
                <span className="ml-1 text-red-500">*</span>
              </span>
              <div className="flex flex-wrap gap-x-3 gap-y-2 rounded-lg border border-neutral-200 bg-neutral-50/50 p-2.5">
                {WEEKDAY_OPTIONS.map((opt) => {
                  const checked = scheduleDays.includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-1.5 text-sm font-medium text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={(e) => toggleDay(opt.value, e.target.checked)}
                        aria-label={`Lịch học ${opt.label}`}
                        className="rounded border-neutral-300 text-[#7C3AED] focus:ring-[#7C3AED]"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </Grid>

          <Grid cols={3}>
            <Field
              label="Giờ bắt đầu"
              name="startTime"
              type="time"
              defaultValue={cls?.startTime ?? undefined}
              required
            />
            <Field
              label="Giờ kết thúc"
              name="endTime"
              type="time"
              defaultValue={cls?.endTime ?? undefined}
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
      </fieldset>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        {canEdit && <SubmitButton isEdit={isEdit} pending={pending} />}
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

function SubmitButton({ isEdit, pending }: { isEdit: boolean; pending: boolean }) {
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

type SelectOption = { value: string; label: string };
type SelectFieldProps = {
  label: string;
  name: string;
  options: readonly SelectOption[];
  /** Nếu có → render <optgroup> thay cho options phẳng (giữ option đầu của options làm placeholder). */
  groups?: readonly { label: string; options: readonly SelectOption[] }[];
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
  groups,
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
        {groups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {helper && <span className="mt-1 block text-xs text-neutral-500">{helper}</span>}
    </label>
  );
}
