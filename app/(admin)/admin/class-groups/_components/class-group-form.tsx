"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createClassGroup, updateClassGroup } from "../_actions";

type OrgUnitOption = { id: string; name: string; code: string | null };

export type ClassGroupFormValue = {
  id?: string;
  displayCode: string;
  name: string | null;
  orgUnitId: string | null;
  status: string;
  notes: string | null;
};

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Đang hoạt động" },
  { value: "GRADUATED", label: "Đã tốt nghiệp" },
  { value: "DISBANDED", label: "Đã giải thể" },
];

export function ClassGroupForm({
  group,
  orgUnits,
}: {
  group?: ClassGroupFormValue;
  orgUnits: OrgUnitOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(group);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = group
      ? await updateClassGroup(group.id!, formData)
      : await createClassGroup(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-2xl space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Mã hiển thị * <span className="font-normal text-gray-400">(vd A1, B2)</span>
        </label>
        <input
          name="displayCode"
          defaultValue={group?.displayCode ?? ""}
          required
          maxLength={20}
          placeholder="A1"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <p className="mt-1 text-xs text-gray-500">
          Mã định danh đầy đủ (CS1.LOP.26.xxx) sẽ tự sinh khi tạo.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Tên nhóm <span className="font-normal text-gray-400">(tuỳ chọn)</span>
        </label>
        <input
          name="name"
          defaultValue={group?.name ?? ""}
          placeholder="VD: Nhóm Sao Mai khai giảng 2026"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Đơn vị *
        </label>
        <select
          name="orgUnitId"
          defaultValue={group?.orgUnitId ?? ""}
          required
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">-- Chọn đơn vị --</option>
          {orgUnits.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} {o.code ? `(${o.code})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Trạng thái
        </label>
        <select
          name="status"
          defaultValue={group?.status ?? "ACTIVE"}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Ghi chú
        </label>
        <textarea
          name="notes"
          defaultValue={group?.notes ?? ""}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="flex gap-3 border-t border-gray-200 pt-5">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/class-groups")}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
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
      className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo nhóm lớp"}
    </button>
  );
}
