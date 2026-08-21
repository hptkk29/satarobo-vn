"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createInternalLeadAction } from "../actions";

type CenterOption = { code: string; name: string };

type Entered = { id?: string; label: string; note: string };

const EMPTY = {
  phone: "",
  parentName: "",
  childName: "",
  centerCode: "",
  schoolName: "",
  gradeLevel: "",
  email: "",
  note: "",
};

/**
 * G-D — biểu mẫu nhập nhanh, **không có ô "Mã số NV"**: người nhập đã đăng nhập
 * nên hệ thống tự biết là ai.
 *
 * Thiết kế theo đúng việc thật: gõ xong một phiếu thì **ở lại trang**, ô trống,
 * con trỏ nhảy về ô số điện thoại để gõ phiếu kế tiếp. Danh sách phiếu vừa nhập
 * hiện ngay bên dưới để đối chiếu, kèm liên kết mở khách vừa tạo.
 */
export function QuickLeadForm({ centers }: { centers: CenterOption[] }) {
  const [form, setForm] = useState(EMPTY);
  const [entered, setEntered] = useState<Entered[]>([]);
  const [pending, startTransition] = useTransition();
  const phoneRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    startTransition(async () => {
      const res = await createInternalLeadAction({
        phone: form.phone,
        parentName: form.parentName || null,
        childName: form.childName || null,
        centerCode: form.centerCode || null,
        schoolName: form.schoolName || null,
        gradeLevel: form.gradeLevel || null,
        email: form.email || null,
        note: form.note || null,
      });

      if (!res.ok) {
        toast.error(res.error ?? "Không lưu được phiếu");
        return;
      }

      const label = form.parentName || form.childName || form.phone;
      if (res.duplicate) {
        toast.warning(
          res.childAdded
            ? "Số này đã có trong hệ thống — đã thêm bé vào khách cũ."
            : "Số này đã có trong hệ thống — không tạo khách mới.",
        );
      } else {
        toast.success("Đã lưu khách hàng.");
      }
      for (const w of res.warnings ?? []) toast.warning(w);

      setEntered((prev) => [
        {
          id: res.leadId,
          label,
          note: res.duplicate
            ? res.childAdded
              ? "trùng số — đã thêm bé vào khách cũ"
              : "trùng số — không tạo mới"
            : "đã tạo",
        },
        ...prev,
      ]);
      setForm(EMPTY);
      phoneRef.current?.focus();
    });
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "mb-1 block text-sm font-medium text-foreground";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <form
        className="rounded-xl border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="phone">
              Số điện thoại phụ huynh <span className="text-state-danger-ink">*</span>
            </label>
            <input
              id="phone"
              ref={phoneRef}
              className={inputClass}
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
              placeholder="0905 123 456"
              inputMode="tel"
              autoComplete="off"
              autoFocus
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="parentName">
              Tên phụ huynh
            </label>
            <input
              id="parentName"
              className={inputClass}
              value={form.parentName}
              onChange={(e) => set("parentName")(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="childName">
              Tên bé
            </label>
            <input
              id="childName"
              className={inputClass}
              value={form.childName}
              onChange={(e) => set("childName")(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="centerCode">
              Cơ sở
            </label>
            <select
              id="centerCode"
              className={inputClass}
              value={form.centerCode}
              onChange={(e) => set("centerCode")(e.target.value)}
            >
              <option value="">— Để hệ thống tự chia —</option>
              {centers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="gradeLevel">
              Lớp
            </label>
            <input
              id="gradeLevel"
              className={inputClass}
              value={form.gradeLevel}
              onChange={(e) => set("gradeLevel")(e.target.value)}
              placeholder="Lớp 2"
              autoComplete="off"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="schoolName">
              Trường bé đang học
            </label>
            <input
              id="schoolName"
              className={inputClass}
              value={form.schoolName}
              onChange={(e) => set("schoolName")(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="email">
              Email phụ huynh
            </label>
            <input
              id="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              inputMode="email"
              autoComplete="off"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="note">
              Ghi chú
            </label>
            <textarea
              id="note"
              className={`${inputClass} min-h-20`}
              value={form.note}
              onChange={(e) => set("note")(e.target.value)}
              placeholder="Khách hỏi lớp thứ Bảy, quan tâm SATA 3…"
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Không cần nhập mã nhân viên — hệ thống lấy từ tài khoản bạn đang đăng nhập.
        </p>

        <button
          type="submit"
          disabled={pending || !form.phone.trim()}
          className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Đang lưu…" : "Lưu và nhập phiếu tiếp"}
        </button>
      </form>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Đã nhập trong phiên này{entered.length > 0 ? ` (${entered.length})` : ""}
        </h2>
        {entered.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Phiếu bạn vừa lưu sẽ hiện ở đây để đối chiếu.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {entered.map((e, i) => (
              <li
                key={`${e.id ?? "dup"}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm"
              >
                <span className="truncate text-foreground">{e.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{e.note}</span>
                  {e.id && (
                    <Link
                      href={`/leads/${e.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Mở
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
