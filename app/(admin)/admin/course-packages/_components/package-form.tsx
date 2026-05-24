"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { createPackage, updatePackage } from "../_actions";
import {
  JsonArrayEditor,
  type JsonArrayItem,
  type JsonObjectItem,
} from "./json-array-editor";
import { ImageUploader } from "@/components/admin/ImageUploader";

type PackageFormValue = {
  id: string;
  slug: string;
  code: string;
  name: string;
  shortName: string | null;
  subtitle: string | null;
  shortDescription: string | null;
  description: string | null;
  ageGroup: string | null;
  level: string | null;
  lessons: number | null;
  duration: string | null;
  priceOriginal: number | null;
  priceEarlyBird: number | null;
  priceMember: number | null;
  features: Prisma.JsonValue;
  highlights: Prisma.JsonValue;
  curriculum: Prisma.JsonValue;
  badge: string | null;
  color: string | null;
  displayOrder: number;
  isPublished: boolean;
  isFeatured: boolean;
  thumbnail: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  parentCourseSlug: string | null;
};

interface PackageFormProps {
  pkg?: PackageFormValue;
}

type FieldProps = {
  label: string;
  name: string;
  type?: "text" | "number" | "textarea";
  rows?: number;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
};

const LEVEL_OPTIONS = [
  "Nhap mon",
  "So cap",
  "Co ban",
  "Trung cap",
  "Kha",
  "Cao cap",
  "Chuyen binh thi dau",
  "Combo",
];

const COLOR_OPTIONS = ["orange", "purple", "green", "blue", "amber", "indigo", "teal", "red"];
const PARENT_COURSE_OPTIONS = ["laptrinhrobot", "luyenthirobosim"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPrimitive(value: unknown): string | number | boolean | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return String(value ?? "");
}

function normalizeJsonArray(value: Prisma.JsonValue): JsonArrayItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (typeof item === "string") return item;
    if (!isRecord(item)) return String(item ?? "");

    return Object.fromEntries(
      Object.entries(item).map(([key, fieldValue]) => [key, toPrimitive(fieldValue)]),
    ) as JsonObjectItem;
  });
}

export function PackageForm({ pkg }: PackageFormProps) {
  const router = useRouter();
  const isEdit = Boolean(pkg);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<JsonArrayItem[]>(
    normalizeJsonArray(pkg?.features ?? []),
  );
  const [highlights, setHighlights] = useState<JsonArrayItem[]>(
    normalizeJsonArray(pkg?.highlights ?? []),
  );
  const [curriculum, setCurriculum] = useState<JsonArrayItem[]>(
    normalizeJsonArray(pkg?.curriculum ?? []),
  );
  const [thumbnail, setThumbnail] = useState<string | null>(pkg?.thumbnail ?? null);

  const action = async (formData: FormData) => {
    setError(null);
    formData.set("features", JSON.stringify(features));
    formData.set("highlights", JSON.stringify(highlights));
    formData.set("curriculum", JSON.stringify(curriculum));

    const result = pkg
      ? await updatePackage(pkg.id, formData)
      : await createPackage(formData);

    if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <form action={action} className="max-w-4xl space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <Section title="Thong tin co ban">
        <Grid cols={2}>
          <Field
            label="Code (Sata1, Sata2, ...)"
            name="code"
            defaultValue={pkg?.code}
            required
            readOnly={isEdit}
          />
          <Field
            label="Slug"
            name="slug"
            defaultValue={pkg?.slug}
            placeholder="auto-generate from code"
          />
        </Grid>

        <Field label="Ten" name="name" defaultValue={pkg?.name} required />
        <Field label="Ten ngan" name="shortName" defaultValue={pkg?.shortName} />
        <Field label="Subtitle" name="subtitle" defaultValue={pkg?.subtitle} />
        <Field
          label="Short Description"
          name="shortDescription"
          type="textarea"
          rows={2}
          defaultValue={pkg?.shortDescription}
        />
        <Field
          label="Description"
          name="description"
          type="textarea"
          rows={6}
          defaultValue={pkg?.description}
        />
      </Section>

      <Section title="Doi tuong va cap do">
        <Grid cols={2}>
          <Field
            label="Age Group"
            name="ageGroup"
            defaultValue={pkg?.ageGroup}
            placeholder="Lop 1-8"
          />
          <SelectField label="Level" name="level" defaultValue={pkg?.level} options={LEVEL_OPTIONS} />
        </Grid>
      </Section>

      <Section title="Lich va gia">
        <Grid cols={2}>
          <Field label="So buoi" name="lessons" type="number" defaultValue={pkg?.lessons} />
          <Field
            label="Duration"
            name="duration"
            defaultValue={pkg?.duration}
            placeholder="2 thang"
          />
        </Grid>
        <Grid cols={3}>
          <Field
            label="Gia niem yet (VND)"
            name="priceOriginal"
            type="number"
            defaultValue={pkg?.priceOriginal}
          />
          <Field
            label="Early Bird (VND)"
            name="priceEarlyBird"
            type="number"
            defaultValue={pkg?.priceEarlyBird}
          />
          <Field
            label="Member (VND)"
            name="priceMember"
            type="number"
            defaultValue={pkg?.priceMember}
          />
        </Grid>
      </Section>

      <Section title="Features (JSON)">
        <JsonArrayEditor
          value={features}
          onChange={setFeatures}
          template={{ icon: "", title: "", desc: "" }}
          placeholder="Click Them de them feature"
        />
      </Section>

      <Section title="Highlights (JSON)">
        <JsonArrayEditor
          value={highlights}
          onChange={setHighlights}
          template=""
          type="string"
          placeholder="Click Them de them highlight"
        />
      </Section>

      <Section title="Curriculum (JSON)">
        <JsonArrayEditor
          value={curriculum}
          onChange={setCurriculum}
          template={{ topic: "", lessons: 0 }}
          placeholder="Click Them de them topic"
        />
      </Section>

      <Section title="Hien thi">
        <Grid cols={3}>
          <Field label="Badge" name="badge" defaultValue={pkg?.badge} />
          <SelectField label="Color" name="color" defaultValue={pkg?.color} options={COLOR_OPTIONS} />
          <Field
            label="Display Order"
            name="displayOrder"
            type="number"
            defaultValue={pkg?.displayOrder ?? 0}
          />
        </Grid>
        <div className="flex flex-wrap gap-6">
          <CheckboxField label="Published" name="isPublished" defaultChecked={pkg?.isPublished} />
          <CheckboxField label="Featured" name="isFeatured" defaultChecked={pkg?.isFeatured} />
        </div>
      </Section>

      <Section title="Image">
        <ImageUploader
          label="Thumbnail"
          value={thumbnail}
          onChange={setThumbnail}
          prefix="uploads/courses"
          aspect="video"
        />
        <input type="hidden" name="thumbnail" value={thumbnail ?? ""} />
      </Section>

      <Section title="SEO">
        <Field label="SEO Title" name="seoTitle" defaultValue={pkg?.seoTitle} />
        <Field
          label="SEO Description"
          name="seoDescription"
          type="textarea"
          rows={2}
          defaultValue={pkg?.seoDescription}
        />
      </Section>

      <Section title="Parent Course">
        <SelectField
          label="Parent Course Slug"
          name="parentCourseSlug"
          defaultValue={pkg?.parentCourseSlug}
          options={PARENT_COURSE_OPTIONS}
        />
      </Section>

      <div className="flex gap-3 border-t border-gray-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/course-packages")}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Huy
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="border-b border-gray-100 pb-3 text-base font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  const classes = cols === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2";
  return <div className={`grid ${classes} gap-4`}>{children}</div>;
}

function Field({
  label,
  name,
  type = "text",
  rows,
  defaultValue,
  ...props
}: FieldProps) {
  const inputClasses =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F7941D] focus:ring-2 focus:ring-[#F7941D]/20 disabled:bg-gray-50";

  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {type === "textarea" ? (
        <textarea
          name={name}
          rows={rows || 3}
          defaultValue={defaultValue ?? ""}
          className={inputClasses}
          {...props}
        />
      ) : (
        <input
          type={type}
          name={name}
          defaultValue={defaultValue ?? ""}
          className={inputClasses}
          {...props}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string | null;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F7941D] focus:ring-2 focus:ring-[#F7941D]/20"
      >
        <option value="">-- Chon --</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
        className="h-5 w-5 rounded border-gray-300 text-[#F7941D] focus:ring-[#F7941D]"
      />
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[#F7941D] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#e58510] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Dang luu..." : isEdit ? "Cap nhat" : "Tao moi"}
    </button>
  );
}
