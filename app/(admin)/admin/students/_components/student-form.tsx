"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { StringArrayEditor } from "@/app/(admin)/admin/kits/_components/string-array-editor";
import { createStudent, updateStudent } from "../_actions";

export type StudentFormValue = {
  id: string;
  name: string;
  studentCode: string | null;
  dateOfBirth: Date | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  currentGrade: number | null;
  school: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  parentRelation: string | null;
  parent2Name: string | null;
  parent2Phone: string | null;
  parent2Relation: string | null;
  address: string | null;
  ward: string | null;
  district: string | null;
  city: string | null;
  bloodType: string | null;
  allergies: string[];
  healthNotes: string | null;
  enrollmentDate: Date | null;
  preferredCenterId: string | null;
  notes: string | null;
  status: "ACTIVE" | "PAUSED" | "GRADUATED" | "INACTIVE";
  centerId: string | null;
};

interface CenterOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Đang học" },
  { value: "PAUSED", label: "Bảo lưu" },
  { value: "GRADUATED", label: "Hoàn thành" },
  { value: "INACTIVE", label: "Nghỉ học" },
] as const;

const GENDER_OPTIONS = [
  { value: "MALE", label: "Nam" },
  { value: "FEMALE", label: "Nữ" },
  { value: "OTHER", label: "Khác" },
] as const;

const BLOOD_OPTIONS = [
  { value: "A_POS", label: "A+" },
  { value: "A_NEG", label: "A−" },
  { value: "B_POS", label: "B+" },
  { value: "B_NEG", label: "B−" },
  { value: "O_POS", label: "O+" },
  { value: "O_NEG", label: "O−" },
  { value: "AB_POS", label: "AB+" },
  { value: "AB_NEG", label: "AB−" },
  { value: "UNKNOWN", label: "Chưa biết" },
] as const;

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function StudentForm({
  student,
  centers,
}: {
  student?: StudentFormValue;
  centers: CenterOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(student);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(student?.avatarUrl ?? null);
  const [allergies, setAllergies] = useState<string[]>(student?.allergies ?? []);

  async function action(formData: FormData) {
    setError(null);
    formData.set("avatarUrl", avatarUrl ?? "");
    formData.set("allergies", JSON.stringify(allergies));
    const res = isEdit
      ? await updateStudent(student!.id, formData)
      : await createStudent(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-4xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1. Identity */}
      <Section title="Thông tin học viên">
        <div>
          <ImageUploader
            label="Ảnh đại diện"
            value={avatarUrl}
            onChange={setAvatarUrl}
            prefix="uploads/students"
            aspect="square"
            helperText="Ảnh chân dung 200×200px hoặc lớn hơn"
          />
        </div>

        <Grid cols={2}>
          <Field label="Họ và tên" name="name" defaultValue={student?.name} required />
          <Field
            label="Mã học viên"
            name="studentCode"
            defaultValue={student?.studentCode ?? undefined}
            placeholder="VD: SR.HV.001"
            helper="Tuỳ chọn — nếu điền, phải duy nhất toàn hệ thống"
          />
        </Grid>

        <Grid cols={3}>
          <Field
            label="Ngày sinh"
            name="dateOfBirth"
            type="date"
            defaultValue={toDateInput(student?.dateOfBirth ?? null)}
          />
          <SelectField
            label="Giới tính"
            name="gender"
            defaultValue={student?.gender ?? ""}
            options={[
              { value: "", label: "— Không chọn —" },
              ...GENDER_OPTIONS,
            ]}
          />
          <SelectField
            label="Trạng thái"
            name="status"
            defaultValue={student?.status ?? "ACTIVE"}
            options={[...STATUS_OPTIONS]}
            required
          />
        </Grid>

        <Grid cols={2}>
          <Field
            label="SĐT học viên (nếu có)"
            name="phone"
            defaultValue={student?.phone ?? undefined}
          />
          <Field
            label="Email học viên (nếu có)"
            name="email"
            type="email"
            defaultValue={student?.email ?? undefined}
          />
        </Grid>
      </Section>

      {/* 2. School */}
      <Section title="Học vấn">
        <Grid cols={2}>
          <Field
            label="Lớp hiện tại"
            name="currentGrade"
            type="number"
            min={1}
            max={12}
            defaultValue={student?.currentGrade ?? undefined}
            placeholder="VD: 5"
          />
          <Field
            label="Trường đang học"
            name="school"
            defaultValue={student?.school ?? undefined}
            placeholder="VD: Tiểu học Trần Văn Ơn"
          />
        </Grid>
      </Section>

      {/* 3. Parent */}
      <Section title="Phụ huynh">
        <Grid cols={3}>
          <Field
            label="Họ tên PH chính"
            name="parentName"
            defaultValue={student?.parentName ?? undefined}
            required
          />
          <Field
            label="SĐT PH chính"
            name="parentPhone"
            defaultValue={student?.parentPhone ?? undefined}
            placeholder="0901234567"
            required
          />
          <Field
            label="Quan hệ"
            name="parentRelation"
            defaultValue={student?.parentRelation ?? undefined}
            placeholder="Mẹ / Bố / Ông / Bà"
          />
        </Grid>

        <Field
          label="Email PH chính"
          name="parentEmail"
          type="email"
          defaultValue={student?.parentEmail ?? undefined}
        />

        <details className="border-t border-neutral-200 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Thêm phụ huynh thứ hai (tuỳ chọn)
          </summary>
          <div className="mt-3">
            <Grid cols={3}>
              <Field
                label="Họ tên PH 2"
                name="parent2Name"
                defaultValue={student?.parent2Name ?? undefined}
              />
              <Field
                label="SĐT PH 2"
                name="parent2Phone"
                defaultValue={student?.parent2Phone ?? undefined}
              />
              <Field
                label="Quan hệ"
                name="parent2Relation"
                defaultValue={student?.parent2Relation ?? undefined}
              />
            </Grid>
          </div>
        </details>
      </Section>

      {/* 4. Address */}
      <Section title="Địa chỉ">
        <Field
          label="Số nhà, đường"
          name="address"
          defaultValue={student?.address ?? undefined}
        />
        <Grid cols={3}>
          <Field
            label="Phường"
            name="ward"
            defaultValue={student?.ward ?? undefined}
          />
          <Field
            label="Quận / Huyện"
            name="district"
            defaultValue={student?.district ?? undefined}
          />
          <Field
            label="Tỉnh / TP"
            name="city"
            defaultValue={student?.city ?? undefined}
          />
        </Grid>
      </Section>

      {/* 5. Sata Robo */}
      <Section title="Thông tin Sata Robo">
        <Grid cols={2}>
          <Field
            label="Ngày đăng ký lần đầu"
            name="enrollmentDate"
            type="date"
            defaultValue={toDateInput(student?.enrollmentDate ?? null)}
          />
          <SelectField
            label="Cơ sở mong muốn"
            name="preferredCenterId"
            defaultValue={student?.preferredCenterId ?? ""}
            options={[
              { value: "", label: "— Chưa chọn —" },
              ...centers.map((c) => ({ value: c.id, label: c.name })),
            ]}
            helper="Cơ sở gần nhà — gợi ý xếp lớp khi enrollment"
          />
        </Grid>
        <SelectField
          label="Cơ sở đang học (legacy)"
          name="centerId"
          defaultValue={student?.centerId ?? ""}
          options={[
            { value: "", label: "— Chưa gắn —" },
            ...centers.map((c) => ({ value: c.id, label: c.name })),
          ]}
          helper="Field cũ từ trước D1; quan hệ học sinh ↔ cơ sở qua Class sẽ thay thế ở D3."
        />
        <Field
          label="Ghi chú nội bộ"
          name="notes"
          type="textarea"
          rows={3}
          defaultValue={student?.notes ?? undefined}
          placeholder="Note cho admin, không hiển thị public"
        />
      </Section>

      {/* 6. Health (collapsed by default — sensitive) */}
      <details className="rounded-xl border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-6 py-4 text-sm font-bold uppercase tracking-wider text-neutral-700">
          Sức khoẻ (tuỳ chọn)
        </summary>
        <div className="space-y-4 px-6 pb-6 pt-2">
          <SelectField
            label="Nhóm máu"
            name="bloodType"
            defaultValue={student?.bloodType ?? ""}
            options={[
              { value: "", label: "— Không khai —" },
              ...BLOOD_OPTIONS,
            ]}
          />

          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">
              Dị ứng
            </label>
            <StringArrayEditor
              value={allergies}
              onChange={setAllergies}
              placeholder="VD: Tôm, sữa, phấn hoa..."
            />
          </div>

          <Field
            label="Ghi chú sức khoẻ"
            name="healthNotes"
            type="textarea"
            rows={3}
            defaultValue={student?.healthNotes ?? undefined}
            placeholder="Bệnh nền, lưu ý đặc biệt để GV chăm sóc đúng cách"
          />
        </div>
      </details>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/students")}
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo học viên"}
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
  type?: "text" | "number" | "email" | "textarea" | "date";
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

function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  helper,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | null;
  required?: boolean;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
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
