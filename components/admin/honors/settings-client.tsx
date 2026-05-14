"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUploader, type UploadResult } from "@/components/admin/file-uploader";
import { updatePageContentAction } from "@/app/(admin)/admin/honors/actions";

export type SettingField = {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea" | "avatar";
};

interface Props {
  fields: SettingField[];
  initialValues: Record<string, string>;
}

export function HonorsSettingsClient({ fields, initialValues }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const saveField = (key: string, value: string) => {
    startTransition(async () => {
      const res = await updatePageContentAction({
        pageKey: "honors",
        contentKey: key,
        contentValue: value,
      });
      if (res.ok) {
        toast.success("Đã lưu");
        setValues((prev) => ({ ...prev, [key]: value }));
        router.refresh();
      } else {
        toast.error(res.error || "Có lỗi");
      }
    });
  };

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={values[field.key] || ""}
          onSave={(v) => saveField(field.key, v)}
          disabled={isPending}
        />
      ))}
    </div>
  );
}

function FieldEditor({
  field,
  value,
  onSave,
  disabled,
}: {
  field: SettingField;
  value: string;
  onSave: (v: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = draft !== value;

  // Sync draft when underlying value changes (after save)
  if (value !== undefined && !dirty && draft !== value) {
    // No-op; this is read-time check
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <label className="mb-2 block text-sm font-semibold text-gray-900">
        {field.label}
        <span className="ml-2 text-xs font-normal text-gray-400">({field.key})</span>
      </label>

      {field.type === "text" && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
        />
      )}

      {field.type === "textarea" && (
        <textarea
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
        />
      )}

      {field.type === "avatar" && (
        <div className="space-y-3">
          {draft && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
              <img
                src={draft}
                alt="Avatar"
                className="h-16 w-16 rounded-full object-cover"
              />
              <div className="flex-1 truncate text-xs text-gray-600">{draft}</div>
              <button
                type="button"
                onClick={() => setDraft("")}
                className="text-xs text-red-600 hover:underline"
              >
                Xoá
              </button>
            </div>
          )}
          {!draft && (
            <FileUploader
              acceptedCategories={["image"]}
              onUploaded={(r: UploadResult) => setDraft(r.url)}
              onError={(e) => toast.error(e)}
            />
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(value)}
            disabled={disabled}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={disabled || !dirty}
          className="rounded bg-[#7C3AED] px-4 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          Lưu
        </button>
      </div>
    </div>
  );
}
