"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createEnrollment, updateEnrollment } from "../_actions";

export type EnrollmentFormValue = {
  id: string;
  studentId: string;
  classId: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  tuition: number | null;
  paidAt: Date | null;
  startDate: Date | null;
  endDate: Date | null;
};

export interface StudentOption {
  id: string;
  name: string;
  phone: string | null;
}

export interface ClassOption {
  id: string;
  name: string;
  courseName: string;
  centerName: string | null;
}

interface Props {
  enrollment?: EnrollmentFormValue;
  students: StudentOption[];
  classes: ClassOption[];
}

const STATUS_OPTIONS: { value: EnrollmentFormValue["status"]; label: string }[] = [
  { value: "ACTIVE", label: "Đang học" },
  { value: "PAUSED", label: "Tạm ngừng" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CANCELLED", label: "Đã huỷ" },
];

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

export function EnrollmentForm({ enrollment, students, classes }: Props) {
  const router = useRouter();
  const isEdit = Boolean(enrollment);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = isEdit
      ? await updateEnrollment(enrollment!.id, formData)
      : await createEnrollment(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Section title="Học viên & Lớp">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Học viên <span className="ml-1 text-red-500">*</span>
          </span>
          <select
            name="studentId"
            defaultValue={enrollment?.studentId ?? ""}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          >
            <option value="">— Chọn học viên —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.phone && ` · ${s.phone}`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            Học viên + Lớp là khóa duy nhất — không thể đăng ký 1 HV vào cùng 1 lớp 2 lần.
          </p>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Lớp <span className="ml-1 text-red-500">*</span>
          </span>
          <select
            name="classId"
            defaultValue={enrollment?.classId ?? ""}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          >
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.courseName}
                {c.centerName && ` · ${c.centerName}`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            Course tự suy ra từ lớp (Class.courseId).
          </p>
        </label>
      </Section>

      <Section title="Trạng thái & Học phí">
        <Grid cols={2}>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-neutral-700">Trạng thái</span>
            <select
              name="status"
              defaultValue={enrollment?.status ?? "ACTIVE"}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Học phí (VND)"
            name="tuition"
            type="number"
            defaultValue={enrollment?.tuition ?? undefined}
            placeholder="2400000"
          />
        </Grid>

        <Grid cols={3}>
          <DateField
            label="Ngày đóng học phí"
            name="paidAt"
            defaultValue={toDateInput(enrollment?.paidAt ?? null)}
          />
          <DateField
            label="Ngày bắt đầu"
            name="startDate"
            defaultValue={toDateInput(enrollment?.startDate ?? null)}
          />
          <DateField
            label="Ngày kết thúc"
            name="endDate"
            defaultValue={toDateInput(enrollment?.endDate ?? null)}
          />
        </Grid>
      </Section>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/admin/enrollments")}
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
      className="rounded-xl bg-orange-500 px-6 py-3 font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-60"
    >
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo đăng ký"}
    </button>
  );
}

// ============== Form primitives ==============

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
  type?: "text" | "number" | "email";
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
};

function Field({ label, name, type = "text", defaultValue, placeholder, required }: FieldProps) {
  const value = defaultValue ?? "";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
      />
    </label>
  );
}

function DateField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
      />
    </label>
  );
}
