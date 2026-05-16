"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createKit, updateKit } from "../_actions";
import { StringArrayEditor } from "./string-array-editor";
import { SpecsEditor } from "./specs-editor";
import { ImageUploader } from "@/components/admin/ImageUploader";

export type KitFormValue = {
  id: string;
  slug: string;
  brand: string;
  series: string;
  code: string | null;
  title: string;
  subtitle: string;
  shortDescription: string;
  description: string;
  priceDisplay: string;
  isAvailable: boolean;
  specs: Record<string, string>;
  features: string[];
  highlights: string[];
  mainImage: string;
  galleryImages: string[];
  sourceUrl: string | null;
  displayOrder: number;
  isPublished: boolean;
};

export function KitForm({ kit }: { kit?: KitFormValue }) {
  const router = useRouter();
  const isEdit = Boolean(kit);

  const [specs, setSpecs] = useState<Record<string, string>>(kit?.specs ?? {});
  const [features, setFeatures] = useState<string[]>(kit?.features ?? []);
  const [highlights, setHighlights] = useState<string[]>(kit?.highlights ?? []);
  const [mainImage, setMainImage] = useState<string | null>(kit?.mainImage || null);
  const [galleryImages, setGalleryImages] = useState<string[]>(kit?.galleryImages ?? []);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    formData.set("specs", JSON.stringify(specs));
    formData.set("features", JSON.stringify(features));
    formData.set("highlights", JSON.stringify(highlights));
    formData.set("galleryImages", JSON.stringify(galleryImages));

    const res = isEdit ? await updateKit(kit!.id, formData) : await createKit(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-5xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Section title="Thông tin sản phẩm">
        <Grid cols={2}>
          <Field label="Tiêu đề (Title)" name="title" defaultValue={kit?.title} required />
          <Field
            label="Slug"
            name="slug"
            defaultValue={kit?.slug}
            placeholder="auto từ brand-title nếu để trống"
          />
        </Grid>
        <Field
          label="Subtitle"
          name="subtitle"
          defaultValue={kit?.subtitle}
          placeholder="Bộ NHẬP MÔN cho trẻ từ 6 tuổi"
          required
        />
        <Grid cols={3}>
          <Field label="Brand" name="brand" defaultValue={kit?.brand ?? "ZMROBO"} required />
          <Field
            label="Series"
            name="series"
            defaultValue={kit?.series}
            placeholder="A-Series, B-Series, ..."
            required
          />
          <Field
            label="Code"
            name="code"
            defaultValue={kit?.code ?? undefined}
            placeholder="Mã sản phẩm (tuỳ chọn)"
          />
        </Grid>
        <Field
          label="Mô tả ngắn (shortDescription)"
          name="shortDescription"
          defaultValue={kit?.shortDescription}
          type="textarea"
          rows={2}
          required
        />
        <Field
          label="Mô tả đầy đủ (description)"
          name="description"
          defaultValue={kit?.description}
          type="textarea"
          rows={5}
          required
        />
        <Grid cols={2}>
          <Field
            label="Giá hiển thị (priceDisplay)"
            name="priceDisplay"
            defaultValue={kit?.priceDisplay ?? "Liên hệ tư vấn"}
            required
          />
          <Field
            label="Source URL (link gốc, tuỳ chọn)"
            name="sourceUrl"
            defaultValue={kit?.sourceUrl ?? undefined}
            placeholder="https://zmrobo.com/..."
          />
        </Grid>
      </Section>

      <Section title="Thông số kỹ thuật (specs)">
        <SpecsEditor value={specs} onChange={setSpecs} />
      </Section>

      <Section title="Đặc điểm chính (features)">
        <StringArrayEditor
          value={features}
          onChange={setFeatures}
          placeholder="Vd: Lập trình không cần máy tính qua thẻ lệnh OID"
        />
      </Section>

      <Section title="Điểm nổi bật (highlights)">
        <StringArrayEditor
          value={highlights}
          onChange={setHighlights}
          placeholder="Vd: 7 cảm biến — robot có thể 'cảm nhận' môi trường"
        />
      </Section>

      <Section title="Hình ảnh">
        <div>
          <ImageUploader
            label="Ảnh chính (mainImage)"
            value={mainImage}
            onChange={setMainImage}
            prefix="uploads/kits"
            aspect="square"
            required
          />
          <input type="hidden" name="mainImage" value={mainImage ?? ""} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-neutral-700">
            Gallery (URLs ảnh phụ)
          </label>
          <p className="mb-2 text-xs text-neutral-500">
            Tạm thời nhập URL — gallery uploader sẽ thêm ở Phase B.
          </p>
          <StringArrayEditor
            value={galleryImages}
            onChange={setGalleryImages}
            placeholder="URL ảnh phụ — gallery uploader sẽ thêm ở Phase B"
          />
        </div>
      </Section>

      <Section title="Trạng thái">
        <div className="flex flex-wrap items-center gap-6">
          <CheckboxField
            label="Published (hiển thị trên /hoc-cu)"
            name="isPublished"
            defaultChecked={kit?.isPublished ?? true}
          />
          <CheckboxField
            label="Available (còn hàng)"
            name="isAvailable"
            defaultChecked={kit?.isAvailable ?? true}
          />
          <Field
            label="Display Order"
            name="displayOrder"
            type="number"
            defaultValue={kit?.displayOrder ?? 0}
          />
        </div>
      </Section>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/admin/kits")}
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo Kit"}
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
  type?: "text" | "number" | "textarea";
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
