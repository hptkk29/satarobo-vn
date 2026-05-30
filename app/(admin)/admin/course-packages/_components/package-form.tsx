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
import { FaqEditor, type FaqItem } from "./faq-editor";

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
  // Phase TD-1 — Detail content
  audienceTag: string | null;
  audienceDescription: string | null;
  mission: string | null;
  outcomesJson: Prisma.JsonValue;
  methodsJson: Prisma.JsonValue;
  conditionsJson: Prisma.JsonValue;
  noteForParents: string | null;
  faqsJson: Prisma.JsonValue;
};

function normalizeStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function normalizeFaqArray(value: Prisma.JsonValue): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is { question: string; answer: string } =>
        typeof v === "object" &&
        v !== null &&
        !Array.isArray(v) &&
        "question" in v &&
        "answer" in v &&
        typeof (v as Record<string, unknown>).question === "string" &&
        typeof (v as Record<string, unknown>).answer === "string",
    )
    .map((v) => ({ question: v.question, answer: v.answer }));
}

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
  // Phase TD-1 — Detail content state
  const [outcomes, setOutcomes] = useState<JsonArrayItem[]>(
    normalizeStringArray(pkg?.outcomesJson ?? []),
  );
  const [methods, setMethods] = useState<JsonArrayItem[]>(
    normalizeStringArray(pkg?.methodsJson ?? []),
  );
  const [conditions, setConditions] = useState<JsonArrayItem[]>(
    normalizeStringArray(pkg?.conditionsJson ?? []),
  );
  const [faqs, setFaqs] = useState<FaqItem[]>(
    normalizeFaqArray(pkg?.faqsJson ?? []),
  );

  const action = async (formData: FormData) => {
    setError(null);
    formData.set("features", JSON.stringify(features));
    formData.set("highlights", JSON.stringify(highlights));
    formData.set("curriculum", JSON.stringify(curriculum));
    formData.set("outcomesJson", JSON.stringify(outcomes));
    formData.set("methodsJson", JSON.stringify(methods));
    formData.set("conditionsJson", JSON.stringify(conditions));
    formData.set(
      "faqsJson",
      JSON.stringify(
        faqs.filter((f) => f.question.trim() && f.answer.trim()),
      ),
    );

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

      <Section title="Thông tin cơ bản">
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
            placeholder="Tự tạo từ mã"
          />
        </Grid>

        <Field label="Tên" name="name" defaultValue={pkg?.name} required />
        <Field label="Tên ngắn" name="shortName" defaultValue={pkg?.shortName} />
        <Field label="Phụ đề" name="subtitle" defaultValue={pkg?.subtitle} />
        <Field
          label="Mô tả ngắn"
          name="shortDescription"
          type="textarea"
          rows={2}
          defaultValue={pkg?.shortDescription}
        />
        <Field
          label="Mô tả"
          name="description"
          type="textarea"
          rows={6}
          defaultValue={pkg?.description}
        />
      </Section>

      <Section title="Đối tượng và cấp độ">
        <Grid cols={2}>
          <Field
            label="Nhóm tuổi"
            name="ageGroup"
            defaultValue={pkg?.ageGroup}
            placeholder="Lớp 1-8"
          />
          <SelectField label="Cấp độ" name="level" defaultValue={pkg?.level} options={LEVEL_OPTIONS} />
        </Grid>
      </Section>

      <Section title="Lịch và giá">
        <Grid cols={2}>
          <Field label="Số buổi" name="lessons" type="number" defaultValue={pkg?.lessons} />
          <Field
            label="Thời lượng"
            name="duration"
            defaultValue={pkg?.duration}
            placeholder="2 tháng"
          />
        </Grid>
        <Grid cols={3}>
          <Field
            label="Giá niêm yết (VND)"
            name="priceOriginal"
            type="number"
            defaultValue={pkg?.priceOriginal}
          />
          <Field
            label="Giá ưu đãi sớm (VND)"
            name="priceEarlyBird"
            type="number"
            defaultValue={pkg?.priceEarlyBird}
          />
          <Field
            label="Giá hội viên (VND)"
            name="priceMember"
            type="number"
            defaultValue={pkg?.priceMember}
          />
        </Grid>
      </Section>

      <Section title="Tính năng (JSON)">
        <JsonArrayEditor
          value={features}
          onChange={setFeatures}
          template={{ icon: "", title: "", desc: "" }}
          placeholder="Bấm Thêm để thêm tính năng"
        />
      </Section>

      <Section title="Điểm nổi bật (JSON)">
        <JsonArrayEditor
          value={highlights}
          onChange={setHighlights}
          template=""
          type="string"
          placeholder="Bấm Thêm để thêm điểm nổi bật"
        />
      </Section>

      <Section title="Giáo trình (JSON)">
        <JsonArrayEditor
          value={curriculum}
          onChange={setCurriculum}
          template={{ topic: "", lessons: 0 }}
          placeholder="Bấm Thêm để thêm chủ đề"
        />
      </Section>

      <Section title="Hiển thị">
        <Grid cols={3}>
          <Field label="Badge" name="badge" defaultValue={pkg?.badge} />
          <SelectField label="Màu" name="color" defaultValue={pkg?.color} options={COLOR_OPTIONS} />
          <Field
            label="Thứ tự hiển thị"
            name="displayOrder"
            type="number"
            defaultValue={pkg?.displayOrder ?? 0}
          />
        </Grid>
        <div className="flex flex-wrap gap-6">
          <CheckboxField label="Đã đăng" name="isPublished" defaultChecked={pkg?.isPublished} />
          <CheckboxField label="Nổi bật" name="isFeatured" defaultChecked={pkg?.isFeatured} />
        </div>
      </Section>

      <Section title="Hình ảnh">
        <ImageUploader
          label="Ảnh đại diện"
          value={thumbnail}
          onChange={setThumbnail}
          prefix="uploads/courses"
          aspect="video"
        />
        <input type="hidden" name="thumbnail" value={thumbnail ?? ""} />
      </Section>

      <Section title="SEO">
        <Field label="Tiêu đề SEO" name="seoTitle" defaultValue={pkg?.seoTitle} />
        <Field
          label="Mô tả SEO"
          name="seoDescription"
          type="textarea"
          rows={2}
          defaultValue={pkg?.seoDescription}
        />
      </Section>

      <Section title="Khoá cha">
        <SelectField
          label="Slug khoá cha"
          name="parentCourseSlug"
          defaultValue={pkg?.parentCourseSlug}
          options={PARENT_COURSE_OPTIONS}
        />
      </Section>

      {/* Phase TD-1 — Detail content cho /khoa-hoc/[slug] */}
      <Section title="Nội dung trang chi tiết khóa học">
        <Field
          label="Đối tượng (badge ngắn — VD: Học sinh Lớp 1-8)"
          name="audienceTag"
          defaultValue={pkg?.audienceTag}
          placeholder="VD: Học sinh Lớp 1-8"
        />
        <Field
          label="Mô tả đối tượng (1-2 câu)"
          name="audienceDescription"
          type="textarea"
          rows={2}
          defaultValue={pkg?.audienceDescription}
          placeholder="VD: Dành cho học sinh chuẩn bị thi vòng loại Robotics 2026..."
        />
        <Field
          label="Sứ mệnh khóa học (2-4 đoạn)"
          name="mission"
          type="textarea"
          rows={6}
          defaultValue={pkg?.mission}
          placeholder="Mô tả mục đích, đối tượng, giá trị mang lại..."
        />

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            Kết quả đạt được sau khi hoàn thành
          </label>
          <JsonArrayEditor
            value={outcomes}
            onChange={setOutcomes}
            template=""
            type="string"
            placeholder="Chưa có outcome nào"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            Phương pháp đào tạo (tuỳ chọn — cho khóa luyện thi)
          </label>
          <JsonArrayEditor
            value={methods}
            onChange={setMethods}
            template=""
            type="string"
            placeholder="Chưa có phương pháp nào"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            Điều kiện đặc biệt (tuỳ chọn — VD Sata8 cam kết hoàn tiền)
          </label>
          <JsonArrayEditor
            value={conditions}
            onChange={setConditions}
            template=""
            type="string"
            placeholder="Chưa có điều kiện nào"
          />
        </div>

        <Field
          label="Lưu ý cho phụ huynh (yellow alert)"
          name="noteForParents"
          type="textarea"
          rows={3}
          defaultValue={pkg?.noteForParents}
          placeholder="VD: Khóa này nên kết hợp với Sata2..."
        />

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            FAQ riêng cho khóa này
          </label>
          <FaqEditor value={faqs} onChange={setFaqs} />
          <p className="mt-1 text-xs text-gray-500">
            Mỗi FAQ là 1 cặp question/answer. Sẽ render trong section "Câu hỏi
            thường gặp" trên trang chi tiết.
          </p>
        </div>
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo mới"}
    </button>
  );
}
