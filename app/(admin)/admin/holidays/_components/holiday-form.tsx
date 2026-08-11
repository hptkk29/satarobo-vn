"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { createHoliday, updateHoliday } from "../_actions";
import { TYPE_LABELS, toDateInput } from "./helpers";

export type HolidayFormValue = {
  id: string;
  name: string;
  date: Date;
  endDate: Date | null;
  orgUnitId: string | null; // PR-C: đơn vị (OrgUnit) — nguồn chính; centerId suy ra ở action
  type: "HOLIDAY" | "MAINTENANCE" | "EVENT" | "OTHER";
  note: string | null;
};

export type OrgUnitOption = {
  id: string;
  name: string;
};

export function HolidayForm({
  holiday,
  orgUnits,
}: {
  holiday?: HolidayFormValue;
  orgUnits: OrgUnitOption[];
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
    if (res?.error) {
      setError(res.error);
      return;
    }
    // QA 20/07 — toast thành công thay vì redirect âm thầm.
    toast.success(isEdit ? "Đã cập nhật ngày nghỉ" : "Đã tạo ngày nghỉ mới");
    router.push("/holidays");
  }

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {error && (
        <div className="rounded-lg border border-state-danger-soft bg-state-danger-soft px-4 py-3 text-sm text-state-danger-ink">
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
            name="orgUnitId"
            defaultValue={holiday?.orgUnitId ?? "ALL"}
            options={[
              { value: "ALL", label: "Toàn hệ thống" },
              ...orgUnits.map((o) => ({ value: o.id, label: o.name })),
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

      <div className="flex gap-3 border-t border-border pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/holidays")}
          className="rounded-xl border-2 border-border bg-card px-6 py-3 font-bold text-foreground hover:bg-muted"
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
      className="rounded-xl bg-primary px-6 py-3 font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo ngày nghỉ"}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-foreground">
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
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

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
      <span className="mb-1 block text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-1 text-state-danger-ink">*</span>}
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
      {helper && <span className="mt-1 block text-xs text-muted-foreground">{helper}</span>}
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
      <span className="mb-1 block text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-1 text-state-danger-ink">*</span>}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        required={required}
        className={baseInput}
      />
      {helper && <span className="mt-1 block text-xs text-muted-foreground">{helper}</span>}
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
      <span className="mb-1 block text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-1 text-state-danger-ink">*</span>}
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
