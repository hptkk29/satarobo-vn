"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createSession, updateSession } from "../_actions";

export type SessionFormValue = {
  id: string;
  classId: string;
  date: Date;
  topic: string | null;
  notes: string | null;
};

export interface ClassOption {
  id: string;
  name: string;
  courseName: string;
  centerName: string | null;
}

interface Props {
  session?: SessionFormValue;
  classes: ClassOption[];
  defaultClassId?: string;
}

function toDateTimeLocal(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  // datetime-local expects "YYYY-MM-DDTHH:mm" in local time
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

export function SessionForm({ session, classes, defaultClassId }: Props) {
  const router = useRouter();
  const isEdit = Boolean(session);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = isEdit
      ? await updateSession(session!.id, formData)
      : await createSession(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Section title="Thông tin buổi học">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Lớp <span className="ml-1 text-red-500">*</span>
          </span>
          <select
            name="classId"
            defaultValue={session?.classId ?? defaultClassId ?? ""}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          >
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.courseName}
                {c.centerName && ` · ${c.centerName}`}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Thời gian (ngày + giờ) <span className="ml-1 text-red-500">*</span>
          </span>
          <input
            type="datetime-local"
            name="date"
            defaultValue={toDateTimeLocal(session?.date ?? null)}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Schema chỉ có 1 field <code>date</code> (DateTime) — không có start/end time tách biệt.
            Dùng datetime-local để chọn ngày + giờ.
          </p>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">Chủ đề buổi học</span>
          <input
            type="text"
            name="topic"
            defaultValue={session?.topic ?? ""}
            placeholder="Vd: Buổi 5 — Điều khiển động cơ servo"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">Ghi chú</span>
          <textarea
            name="notes"
            rows={4}
            defaultValue={session?.notes ?? ""}
            placeholder="Mục tiêu, tài liệu, bài tập về nhà..."
            className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          />
        </label>
      </Section>

      <div className="flex gap-3 border-t border-neutral-200 pt-6">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.push("/admin/sessions")}
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
      {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo buổi học"}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-neutral-700">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
