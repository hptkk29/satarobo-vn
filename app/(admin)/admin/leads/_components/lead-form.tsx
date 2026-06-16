"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createLeadManual, updateLeadFields, addLeadChild } from "../actions";
import { groupTeachableCourses, type TeachableCourse } from "@/lib/courses/grouped";
import {
  ChildFields,
  childDraftToPayload,
  emptyChild,
  type ChildDraft,
} from "./lead-children";

type Option = { id: string; name: string };

export interface LeadFormInitial {
  id?: string;
  parentName?: string;
  phone?: string;
  email?: string;
  childName?: string;
  childAge?: number | null;
  orgUnitId?: string | null;
  courseId?: string | null;
  source?: string | null;
  note?: string | null;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none";

export function LeadForm({
  orgUnits,
  courses,
  initial,
}: {
  orgUnits: Option[];
  courses: TeachableCourse[];
  initial?: LeadFormInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial?.id;
  const courseGroups = groupTeachableCourses(courses);

  const [parentName, setParentName] = useState(initial?.parentName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [childName, setChildName] = useState(initial?.childName ?? "");
  const [childAge, setChildAge] = useState(initial?.childAge != null ? String(initial.childAge) : "");
  const [orgUnitId, setOrgUnitId] = useState(initial?.orgUnitId ?? "");
  const [courseId, setCourseId] = useState(initial?.courseId ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  // R7-01 — khi TẠO lead có thể khai báo sẵn N con (nháp). Sau khi tạo lead
  // thành công sẽ ghi lần lượt qua addLeadChild. Ở chế độ SỬA, danh sách con
  // được quản lý riêng (LeadChildrenManager) nên không hiển thị nháp ở đây.
  const [kids, setKids] = useState<ChildDraft[]>([]);
  const addKid = () => setKids((k) => [...k, { ...emptyChild }]);
  const removeKid = (i: number) => setKids((k) => k.filter((_, idx) => idx !== i));
  const patchKid = (i: number, p: Partial<ChildDraft>) =>
    setKids((k) => k.map((kid, idx) => (idx === i ? { ...kid, ...p } : kid)));

  function submit() {
    const payload = {
      parentName,
      phone,
      email,
      childName,
      childAge: childAge ? Number(childAge) : null,
      orgUnitId,
      courseId,
      source,
      note,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateLeadFields(initial!.id!, payload)
        : await createLeadManual(payload);
      if (!res.ok) {
        toast.error(res.error ?? "Lỗi");
        return;
      }
      if (isEdit) {
        toast.success("Đã lưu");
        router.refresh();
        return;
      }
      const newId = (res as { id?: string }).id ?? "";
      // Ghi các con đã khai (bỏ dòng chưa nhập tên). Lỗi 1 con không chặn tạo lead.
      const valid = kids.filter((k) => k.fullName.trim());
      let kidErr = 0;
      for (const k of valid) {
        const r = await addLeadChild({ leadId: newId, ...childDraftToPayload(k) });
        if (!r.ok) kidErr++;
      }
      if (kidErr > 0) toast.error(`Đã tạo lead, nhưng ${kidErr} con lưu lỗi — kiểm tra lại`);
      else toast.success("Đã tạo lead");
      router.push(`/leads/${newId}`);
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
        <Field label="Đơn vị">
          <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} className={inputCls}>
            <option value="">Chưa xác định (tự chia đều theo cơ sở)</option>
            {orgUnits.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Khoá quan tâm">
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls}>
            <option value="">— Chưa chọn —</option>
            {courseGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
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

      {/* R7-01 — khai báo con (chỉ ở chế độ tạo mới; sửa thì quản lý ở trang chi tiết) */}
      {!isEdit && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Con của phụ huynh</span>
            <button
              type="button"
              onClick={addKid}
              className="inline-flex items-center gap-1 rounded-md border border-violet-300 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50"
            >
              <Plus size={12} /> Thêm con
            </button>
          </div>
          {kids.length === 0 ? (
            <p className="text-xs text-gray-400">Chưa khai báo con nào (có thể bổ sung sau khi tạo).</p>
          ) : (
            <div className="space-y-3">
              {kids.map((kid, i) => (
                <div key={i} className="rounded-lg border border-violet-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-violet-700">Con #{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeKid(i)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={12} /> Xoá
                    </button>
                  </div>
                  <ChildFields
                    value={kid}
                    onChange={(p) => patchKid(i, p)}
                    centers={orgUnits}
                    courseGroups={courseGroups}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
