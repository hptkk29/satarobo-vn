"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { createCenter, updateCenter } from "../_actions";

export type CenterFormValue = {
  id: string;
  name: string;
  slug: string;
  address: string;
  ward: string | null;
  district: string | null;
  city: string;
  phone: string | null;
  email: string | null;
  googleMapUrl: string | null;
  workingHours: string | null;
  managerName: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  latitude: number | null;
  longitude: number | null;
  allowedRadiusMeters: number | null;
};

export function CenterForm({ center }: { center?: CenterFormValue }) {
  const router = useRouter();
  const isEdit = Boolean(center);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(center?.logoUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(center?.bannerUrl ?? null);

  async function action(formData: FormData) {
    setError(null);
    const res = isEdit
      ? await updateCenter(center!.id, formData)
      : await createCenter(formData);
    if (res?.error) {
      setError(res.error);
      return;
    }
    // QA 20/07 — toast thành công thay vì redirect âm thầm.
    toast.success(isEdit ? "Đã cập nhật cơ sở" : "Đã tạo cơ sở mới");
    router.push("/centers");
  }

  return (
    <form action={action} className="max-w-4xl space-y-6">
      {error && (
        <div className="rounded-lg border border-state-danger-soft bg-state-danger-soft px-4 py-3 text-sm text-state-danger-ink">
          {error}
        </div>
      )}

      <Section title="Thông tin cơ sở">
        <Grid cols={2}>
          <Field label="Tên cơ sở" name="name" defaultValue={center?.name} required />
          <Field
            label="Slug (URL)"
            name="slug"
            defaultValue={center?.slug}
            placeholder="danang, ho-chi-minh, ha-noi"
            required
          />
        </Grid>
        <Field
          label="Địa chỉ"
          name="address"
          defaultValue={center?.address}
          placeholder="211 Nguyễn Hữu Thọ"
          required
        />
        <Grid cols={3}>
          <Field
            label="Phường"
            name="ward"
            defaultValue={center?.ward ?? undefined}
            placeholder="Hòa Cường"
          />
          <Field
            label="Quận / Huyện"
            name="district"
            defaultValue={center?.district ?? undefined}
            placeholder="Hải Châu"
          />
          <Field
            label="Tỉnh / TP"
            name="city"
            defaultValue={center?.city}
            placeholder="Đà Nẵng"
            required
          />
        </Grid>
        <Grid cols={2}>
          <Field
            label="Số điện thoại"
            name="phone"
            defaultValue={center?.phone ?? undefined}
            placeholder="Số điện thoại cơ sở"
          />
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={center?.email ?? undefined}
            placeholder="danang@satarobo.vn"
          />
        </Grid>
        <Field
          label="Google Maps URL"
          name="googleMapUrl"
          defaultValue={center?.googleMapUrl ?? undefined}
          placeholder="https://maps.app.goo.gl/..."
        />
        <Grid cols={2}>
          <Field
            label="Giờ làm việc"
            name="workingHours"
            defaultValue={center?.workingHours ?? undefined}
            placeholder="T2-T6: 17h-21h, T7-CN: 8h-17h"
          />
          <Field
            label="Quản lý cơ sở"
            name="managerName"
            defaultValue={center?.managerName ?? undefined}
            placeholder="Nguyễn Văn A"
          />
        </Grid>
        <Field
          label="Mô tả ngắn"
          name="description"
          type="textarea"
          rows={3}
          defaultValue={center?.description ?? undefined}
          placeholder="Mô tả ngắn về chi nhánh, điểm nổi bật..."
        />
      </Section>

      <Section title="Hình ảnh">
        <Grid cols={2}>
          <div>
            <ImageUploader
              label="Logo chi nhánh"
              value={logoUrl}
              onChange={setLogoUrl}
              prefix="uploads/centers"
              aspect="square"
              helperText="Logo riêng (để trống = dùng logo Sata Robo chung)"
            />
            <input type="hidden" name="logoUrl" value={logoUrl ?? ""} />
          </div>
          <div>
            <ImageUploader
              label="Ảnh banner"
              value={bannerUrl}
              onChange={setBannerUrl}
              prefix="uploads/centers"
              aspect="video"
              helperText="Cover ảnh hiển thị ở trang chi tiết public"
            />
            <input type="hidden" name="bannerUrl" value={bannerUrl ?? ""} />
          </div>
        </Grid>
      </Section>

      <Section title="Chấm công (geofence GPS)">
        <Grid cols={3}>
          <Field
            label="Vĩ độ (latitude)"
            name="latitude"
            defaultValue={center?.latitude ?? undefined}
            placeholder="16.0471"
          />
          <Field
            label="Kinh độ (longitude)"
            name="longitude"
            defaultValue={center?.longitude ?? undefined}
            placeholder="108.2068"
          />
          <Field
            label="Bán kính cho phép (m)"
            name="allowedRadiusMeters"
            type="number"
            defaultValue={center?.allowedRadiusMeters ?? 150}
            placeholder="150"
          />
        </Grid>
        <p className="text-xs text-muted-foreground">
          Toạ độ để chấm công QR kiểm tra nhân viên đang ở gần cơ sở. Lấy từ Google
          Maps (chuột phải vào vị trí → toạ độ). Để trống = bỏ qua kiểm tra vị trí.
        </p>
      </Section>

      <Section title="Hiển thị">
        <Grid cols={2}>
          <CheckboxField
            label="Đang hoạt động"
            name="isActive"
            defaultChecked={center?.isActive ?? true}
          />
          <Field
            label="Display Order"
            name="displayOrder"
            type="number"
            defaultValue={center?.displayOrder ?? 0}
          />
        </Grid>
        <p className="text-xs text-muted-foreground">
          Cơ sở chưa hoạt động sẽ không hiển thị trên trang công khai và Footer.
        </p>
      </Section>

      <div className="flex gap-3 border-t border-border pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/centers")}
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo cơ sở"}
    </button>
  );
}

// ============== Form primitives ==============

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
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
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
        className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
      />
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </label>
  );
}
