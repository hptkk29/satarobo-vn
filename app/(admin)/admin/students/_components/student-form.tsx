"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { StringArrayEditor } from "@/app/(admin)/admin/kits/_components/string-array-editor";
import { FieldLabel } from "@/components/admin/ui/help-hint";
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
  parentNationalId: string | null;
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
  preferredOrgUnitId: string | null;
  notes: string | null;
  status: "ACTIVE" | "PAUSED" | "GRADUATED" | "INACTIVE";
  centerId: string | null;
  orgUnitId: string | null;
};

interface OrgUnitOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Đang học" },
  { value: "PAUSED", label: "Bảo lưu" },
  { value: "GRADUATED", label: "Hoàn thành" },
  { value: "INACTIVE", label: "Nghỉ học" },
] as const;

/**
 * BUG 21/08 — ô này từng cho chọn thẳng "Nghỉ học": `updateStudent` chỉ ghi
 * `Student.status` mà không gỡ ghi danh, nên em đó vẫn nằm nguyên trong lớp ở mọi màn
 * roster. Đường đúng là nút "❌ Nghỉ học hẳn" (bắt lý do + gỡ lớp + hoàn tiền + email).
 * Học viên ĐÃ nghỉ vẫn giữ option để form không tự nhảy sang giá trị khác khi sửa hồ sơ.
 */
function statusOptionsFor(current: string | undefined) {
  if (current === "INACTIVE") return [...STATUS_OPTIONS];
  return STATUS_OPTIONS.filter((o) => o.value !== "INACTIVE");
}

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
  orgUnits,
  canViewParentCccd = false,
}: {
  student?: StudentFormValue;
  orgUnits: OrgUnitOption[];
  // #15 — CCCD PH là PII (mask + break-glass ở màn thanh toán). Chỉ actor có
  // payments:view-pii mới THẤY + nhập ô này; vai khác (Sale/CM) ẩn hoàn toàn.
  canViewParentCccd?: boolean;
}) {
  const router = useRouter();
  const isEdit = Boolean(student);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(student?.avatarUrl ?? null);
  const [allergies, setAllergies] = useState<string[]>(student?.allergies ?? []);
  const statusOptions = statusOptionsFor(student?.status);

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
        <div className="rounded-lg border border-state-danger-soft bg-state-danger-soft px-4 py-3 text-sm text-state-danger-ink">
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
            options={statusOptions}
            required
            helper={
              student?.status === "INACTIVE"
                ? undefined
                : 'Cho nghỉ học phải dùng nút "❌ Nghỉ học hẳn" ở khối Lifecycle bên dưới — nút đó mới gỡ học viên khỏi lớp.'
            }
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

        <Grid cols={2}>
          <Field
            label="Email PH chính"
            name="parentEmail"
            type="email"
            defaultValue={student?.parentEmail ?? undefined}
          />
          {/* #15 — chỉ kế toán/admin (payments:view-pii) mới thấy + nhập CCCD PH.
              Vai khác: KHÔNG render ô (không prefill raw); giá trị cũ được server giữ. */}
          {canViewParentCccd && (
            <Field
              label="CCCD phụ huynh"
              name="parentNationalId"
              defaultValue={student?.parentNationalId ?? undefined}
              placeholder="Số CCCD/CMND phụ huynh"
              helper="Dùng cho phiếu thu/hóa đơn. Thông tin nhạy cảm — che mặc định, chỉ kế toán mở xem đầy đủ."
            />
          )}
        </Grid>

        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
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
            label="Đơn vị mong muốn"
            name="preferredOrgUnitId"
            defaultValue={student?.preferredOrgUnitId ?? ""}
            options={[
              { value: "", label: "— Chưa chọn —" },
              ...orgUnits.map((o) => ({ value: o.id, label: o.name })),
            ]}
            helper="Đơn vị gần nhà — gợi ý xếp lớp khi enrollment"
          />
        </Grid>
        <SelectField
          label="Cơ sở"
          name="orgUnitId"
          defaultValue={student?.orgUnitId ?? ""}
          required
          options={[
            { value: "", label: "— Chọn cơ sở —" },
            ...orgUnits.map((o) => ({ value: o.id, label: o.name })),
          ]}
          helper="Bắt buộc. Học viên phải thuộc một cơ sở dạy học — quyết định lớp học viên được xếp vào và ai quản lý hồ sơ này."
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
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-6 py-4 text-sm font-bold uppercase tracking-wider text-foreground">
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
            <label className="mb-1 block text-sm font-semibold text-foreground">
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

      <div className="flex gap-3 border-t border-border pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/students")}
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
      className="rounded-xl bg-primary px-6 py-3 font-bold text-white shadow-md hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo học viên"}
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
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  return (
    // `helper` nay ra icon "?" CẠNH NHÃN thay vì dòng chữ mờ dưới ô — sửa một chỗ, cả form
    // đổi theo. Nút "?" nằm trong <label> vẫn an toàn: <button> là interactive content nên
    // trình duyệt KHÔNG chuyển tiếp cú bấm xuống ô nhập.
    <label className="block">
      <FieldLabel label={label} required={required} hint={helper} />
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
      <FieldLabel label={label} required={required} hint={helper} />
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
