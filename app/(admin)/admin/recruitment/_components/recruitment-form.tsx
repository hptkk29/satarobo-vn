"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createRecruitment, updateRecruitment } from "../_actions";
import { StringArrayEditor } from "./string-array-editor";

export type RecruitmentFormValue = {
  id: string;
  slug: string;
  title: string;
  department: string;
  location: string;
  workingHours: string | null;
  salaryRange: string | null;
  jobType: string;
  experienceLevel: string | null;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  contactEmail: string;
  contactPhone: string;
  isPublished: boolean;
  isFeatured: boolean;
  displayOrder: number;
};

const JOB_TYPE_OPTIONS = [
  "Full-time",
  "Full-time / Part-time",
  "Part-time",
  "Internship",
  "Contract",
];

const DEPT_OPTIONS = [
  "Phòng Kinh doanh",
  "Phòng Marketing",
  "Phòng Đào tạo",
  "Phòng Kế toán - HCNS",
  "Phòng IT",
  "Phòng Sản phẩm",
  "Ban Giám đốc",
];

export function RecruitmentForm({ position }: { position?: RecruitmentFormValue }) {
  const router = useRouter();
  const isEdit = Boolean(position);

  const [responsibilities, setResponsibilities] = useState<string[]>(
    position?.responsibilities ?? [],
  );
  const [requirements, setRequirements] = useState<string[]>(position?.requirements ?? []);
  const [benefits, setBenefits] = useState<string[]>(position?.benefits ?? []);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    formData.set("responsibilities", JSON.stringify(responsibilities));
    formData.set("requirements", JSON.stringify(requirements));
    formData.set("benefits", JSON.stringify(benefits));

    const res = isEdit
      ? await updateRecruitment(position!.id, formData)
      : await createRecruitment(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-5xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Section title="Thông tin vị trí">
        <Field label="Chức danh" name="title" defaultValue={position?.title} required />
        <Field
          label="Slug"
          name="slug"
          defaultValue={position?.slug}
          placeholder="auto từ chức danh nếu để trống"
        />
        <Grid cols={2}>
          <SelectField
            label="Phòng ban"
            name="department"
            defaultValue={position?.department}
            options={DEPT_OPTIONS}
            allowFreeText
            required
          />
          <SelectField
            label="Hình thức"
            name="jobType"
            defaultValue={position?.jobType}
            options={JOB_TYPE_OPTIONS}
            allowFreeText
            required
          />
        </Grid>
        <Field
          label="Địa điểm làm việc"
          name="location"
          defaultValue={position?.location}
          placeholder="258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng"
          required
        />
        <Grid cols={2}>
          <Field
            label="Giờ làm việc"
            name="workingHours"
            defaultValue={position?.workingHours ?? undefined}
            placeholder="T2 - T7: 8:00 - 17:00"
          />
          <Field
            label="Mức lương"
            name="salaryRange"
            defaultValue={position?.salaryRange ?? undefined}
            placeholder="Theo SR.QD.200 + thưởng KPI"
          />
        </Grid>
        <Field
          label="Kinh nghiệm"
          name="experienceLevel"
          defaultValue={position?.experienceLevel ?? undefined}
          placeholder="Junior - Senior"
        />
        <Field
          label="Mô tả tổng quan"
          name="summary"
          defaultValue={position?.summary}
          type="textarea"
          rows={3}
          required
        />
      </Section>

      <Section title="Trách nhiệm chính">
        <StringArrayEditor
          value={responsibilities}
          onChange={setResponsibilities}
          placeholder="Ví dụ: Tư vấn tuyển sinh trực tiếp..."
        />
      </Section>

      <Section title="Yêu cầu">
        <StringArrayEditor
          value={requirements}
          onChange={setRequirements}
          placeholder="Ví dụ: Tốt nghiệp ĐH chuyên ngành..."
        />
      </Section>

      <Section title="Quyền lợi">
        <StringArrayEditor
          value={benefits}
          onChange={setBenefits}
          placeholder="Ví dụ: BHXH/BHYT/BHTN đầy đủ..."
        />
      </Section>

      <Section title="Liên hệ HR">
        <Grid cols={2}>
          <Field
            label="Email HR"
            name="contactEmail"
            defaultValue={position?.contactEmail ?? "tuyendung@satarobo.vn"}
            placeholder="tuyendung@satarobo.vn"
            required
          />
          <Field
            label="SĐT HR"
            name="contactPhone"
            defaultValue={position?.contactPhone ?? "0818.823.720"}
            placeholder="0818.823.720"
            required
          />
        </Grid>
      </Section>

      <Section title="Trạng thái">
        <div className="flex flex-wrap items-center gap-6">
          <CheckboxField
            label="Published (hiển thị công khai)"
            name="isPublished"
            defaultChecked={position?.isPublished ?? true}
          />
          <CheckboxField
            label="Featured (vị trí nổi bật)"
            name="isFeatured"
            defaultChecked={position?.isFeatured}
          />
          <Field
            label="Display Order"
            name="displayOrder"
            type="number"
            defaultValue={position?.displayOrder ?? 0}
          />
        </div>
      </Section>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/admin/recruitment")}
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo vị trí"}
    </button>
  );
}

// ============== Form primitives (shared with News) ==============

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
  type?: "text" | "number" | "textarea" | "email";
  rows?: number;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
};

function Field({
  label,
  name,
  type = "text",
  rows = 3,
  defaultValue,
  placeholder,
  required,
}: FieldProps) {
  const value = defaultValue ?? "";
  const baseClass =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

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
          className={baseClass + " resize-y"}
        />
      ) : (
        <input
          type={type}
          name={name}
          defaultValue={value}
          placeholder={placeholder}
          required={required}
          className={baseClass}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  allowFreeText,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: string[];
  allowFreeText?: boolean;
  required?: boolean;
}) {
  // If allowFreeText, render as input with datalist; otherwise plain select
  if (allowFreeText) {
    const listId = `dl-${name}`;
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-neutral-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </span>
        <input
          type="text"
          name={name}
          defaultValue={defaultValue}
          required={required}
          list={listId}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
      >
        <option value="">— Chọn —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-neutral-300 text-orange-500 focus:ring-2 focus:ring-orange-500/30"
      />
      <span className="text-sm font-semibold text-neutral-700">{label}</span>
    </label>
  );
}
