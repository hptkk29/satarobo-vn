"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createCenter, updateCenter } from "../_actions";

export type CenterFormValue = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

export function CenterForm({ center }: { center?: CenterFormValue }) {
  const router = useRouter();
  const isEdit = Boolean(center);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = isEdit
      ? await updateCenter(center!.id, formData)
      : await createCenter(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Section title="Thông tin cơ sở">
        <Field label="Tên cơ sở" name="name" defaultValue={center?.name} required />
        <Field
          label="Địa chỉ"
          name="address"
          defaultValue={center?.address}
          placeholder="258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng"
          required
        />
        <Grid cols={2}>
          <Field
            label="Số điện thoại"
            name="phone"
            defaultValue={center?.phone ?? undefined}
            placeholder="0818823720"
          />
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={center?.email ?? undefined}
            placeholder="thongtin@satarobo.vn"
          />
        </Grid>
      </Section>

      <Section title="Trạng thái">
        <CheckboxField
          label="Đang hoạt động"
          name="isActive"
          defaultChecked={center?.isActive ?? true}
        />
        <p className="mt-1 text-xs text-neutral-500">
          Cơ sở chưa hoạt động sẽ không hiển thị trên trang công khai và Footer.
        </p>
      </Section>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/admin/centers")}
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo cơ sở"}
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
  type?: "text" | "number" | "email" | "textarea";
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
