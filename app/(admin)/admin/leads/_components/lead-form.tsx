"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLeadManual, updateLeadFields } from "../actions";

type Option = { id: string; name: string };

export interface LeadFormInitial {
  id?: string;
  parentName?: string;
  phone?: string;
  email?: string;
  childName?: string;
  childAge?: number | null;
  centerId?: string | null;
  courseId?: string | null;
  source?: string | null;
  note?: string | null;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none";

export function LeadForm({
  centers,
  courses,
  initial,
}: {
  centers: Option[];
  courses: Option[];
  initial?: LeadFormInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial?.id;

  const [parentName, setParentName] = useState(initial?.parentName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [childName, setChildName] = useState(initial?.childName ?? "");
  const [childAge, setChildAge] = useState(initial?.childAge != null ? String(initial.childAge) : "");
  const [centerId, setCenterId] = useState(initial?.centerId ?? "");
  const [courseId, setCourseId] = useState(initial?.courseId ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  function submit() {
    const payload = {
      parentName,
      phone,
      email,
      childName,
      childAge: childAge ? Number(childAge) : null,
      centerId,
      courseId,
      source,
      note,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateLeadFields(initial!.id!, payload)
        : await createLeadManual(payload);
      if (res.ok) {
        toast.success(isEdit ? "Đã lưu" : "Đã tạo lead");
        if (isEdit) router.refresh();
        else router.push(`/leads/${(res as { id?: string }).id ?? ""}`);
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tên phụ huynh *">
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="SĐT *">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="09xxxxxxxx" />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Tên con">
          <input value={childName} onChange={(e) => setChildName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Tuổi con">
          <input type="number" min={3} max={18} value={childAge} onChange={(e) => setChildAge(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Cơ sở">
          <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className={inputCls}>
            <option value="">Chưa xác định (chia đều 2 cơ sở)</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Khoá quan tâm">
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls}>
            <option value="">— Chưa chọn —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Nguồn">
          <input value={source} onChange={(e) => setSource(e.target.value)} className={inputCls} placeholder="Sự kiện, walk-in…" />
        </Field>
      </div>
      <Field label="Ghi chú">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} />
      </Field>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo lead"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
