"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createHoliday, updateHoliday } from "../_actions";
import { TYPE_LABELS, toDateInput } from "./helpers";

export type HolidayFormValue = {
  id: string;
  name: string;
  date: Date;
  endDate: Date | null;
  centerId: string | null;
  type: "HOLIDAY" | "MAINTENANCE" | "EVENT" | "OTHER";
  note: string | null;
};

export type CenterOption = {
  id: string;
  name: string;
};

export function HolidayForm({
  holiday,
  centers,
}: {
  holiday?: HolidayFormValue;
  centers: CenterOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(holiday);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(toDateInput(holiday?.date) || "");
  const [endDate, setEndDate] = useState<string>(toDateInput(holiday?.endDate));

  async function action(formData: FormData) {
    setError(null);
    if (endDate && date && endDate < date) {
      setError("Ngày kết thúc phải >= ngày bắt đầu");
      return;
    }
    formData.set("date", date);
    formData.set("endDate", endDate);
    const res = isEdit
      ? await updateHoliday(holiday!.id, formData)
      : await createHoliday(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Section title="Thông tin ngày nghỉ">
        <Field
          label="Tên ngày nghỉ"
          name="name"
          defaultValue={holiday?.name}
          placeholder="VD: Tết Nguyên Đán 2026"
          required
        />
        <Grid cols={2}>
          <DateInput
            label="Ngày bắt đầu"
            value={date}
            onChange={setDate}
            required
          />
          <DateInput
            label="Ngày kết thúc"
            value={endDate}
            onChange={setEndDate}
            helper="Để trống nếu nghỉ 1 ngày"
            min={date || undefined}
          />
        </Grid>
        <Grid cols={2}>
          <SelectField
            label="Phạm vi"
            name="centerId"
            defaultValue={holiday?.centerId ?? "ALL"}
            options={[
              { value: "ALL", label: "Toàn hệ thống" },
              ...centers.map((c) => ({ value: c.id, label: c.name })),
            ]}
            required
          />
          <SelectField
            label="Loại"
            name="type"
            defaultValue={holiday?.type ?? "HOLIDAY"}
            options={(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map(
              (v) => ({
                value: v,
                label: TYPE_LABELS[v],
              }),
            )}
            required
          />
        </Grid>
      </Section>

      <Section title="Ghi chú">
        <Field
          label="Ghi chú"
          name="note"
          type="textarea"
          rows={3}
          defaultValue={holiday?.note ?? undefined}
          placeholder="Ghi chú nội bộ (không hiển thị public)"
        />
      </Section>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/admin/holidays")}
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo ngày nghỉ"}
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

const baseInput =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

function Field({
  label,
  name,
  type = "text",
  rows = 3,
  defaultValue,
  placeholder,
  required,
  helper,
}: {
  label: string;
  name: string;
  type?: "text" | "textarea";
  rows?: number;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  helper?: string;
}) {
  const value = defaultValue ?? "";
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
          className={baseInput + " resize-y"}
        />
      ) : (
        <input
          type="text"
          name={name}
          defaultValue={value}
          placeholder={placeholder}
          required={required}
          className={baseInput}
        />
      )}
      {helper && <span className="mt-1 block text-xs text-neutral-500">{helper}</span>}
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
  required,
  helper,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  helper?: string;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        required={required}
        className={baseInput}
      />
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
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  required?: boolean;
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
        className={baseInput}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
