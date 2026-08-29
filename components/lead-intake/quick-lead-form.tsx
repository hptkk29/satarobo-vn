"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { NGUON_LEAD } from "@/lib/lead/intake/nguon-lead";
import { createInternalLeadAction } from "@/lib/lead/intake/quick-form-action";

type CenterOption = { code: string; name: string };

type Entered = { id?: string; label: string; note: string };

/**
 * Bộ ô chốt 22/08/2026 — ĐÚNG 7 ô, **không ô nào bắt buộc**.
 *
 * Ô email / trường bé / lớp bé của bản trước đã bỏ (hỏi sau, điền ở màn chi tiết
 * lead). Thêm/bớt ô ở đây phải sửa kèm `lib/validators/internal-lead.ts` +
 * `lib/lead/intake/map-internal-form.ts` — ba chỗ đi thành một bộ.
 */
const EMPTY = {
  parentName: "",
  phone: "",
  childName: "",
  source: "",
  facebookUrl: "",
  centerCode: "",
  note: "",
};

/**
 * Biểu mẫu nhập nhanh, **không có ô "Mã số NV"**: người nhập đã đăng nhập nên hệ
 * thống tự biết là ai.
 *
 * Thiết kế theo đúng việc thật: gõ xong một phiếu thì **ở lại trang**, ô trống,
 * con trỏ nhảy về ô đầu để gõ phiếu kế tiếp. Danh sách phiếu vừa nhập hiện ngay
 * bên cạnh để đối chiếu, kèm liên kết mở khách vừa tạo.
 */
export function QuickLeadForm({ centers }: { centers: CenterOption[] }) {
  const [form, setForm] = useState(EMPTY);
  const [entered, setEntered] = useState<Entered[]>([]);
  const [pending, startTransition] = useTransition();
  const firstRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof EMPTY) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Không ô nào bắt buộc — chỉ chặn đúng ca bấm Lưu trên biểu mẫu trắng (server
  // kiểm lại bằng `hasAnyContent`; đây chỉ để nút không im lặng nuốt cú bấm).
  const isBlank = Object.values(form).every((v) => v.trim() === "");

  function submit() {
    startTransition(async () => {
      const res = await createInternalLeadAction({
        parentName: form.parentName || null,
        phone: form.phone || null,
        childName: form.childName || null,
        source: form.source || null,
        facebookUrl: form.facebookUrl || null,
        centerCode: form.centerCode || null,
        note: form.note || null,
      });

      if (!res.ok) {
        toast.error(res.error ?? "Không lưu được phiếu");
        return;
      }

      const label =
        form.parentName ||
        form.childName ||
        form.phone ||
        form.facebookUrl ||
        "Khách mới";
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
      firstRef.current?.focus();
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
          <div>
            <label className={labelClass} htmlFor="parentName">
              Tên phụ huynh
            </label>
            <input
              id="parentName"
              ref={firstRef}
              className={inputClass}
              value={form.parentName}
              onChange={(e) => set("parentName")(e.target.value)}
              placeholder="Chị Nguyễn Thị An"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="phone">
              SĐT phụ huynh
            </label>
            <input
              id="phone"
              className={inputClass}
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
              placeholder="0905 123 456"
              inputMode="tel"
              autoComplete="off"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="childName">
              Tên con
            </label>
            <input
              id="childName"
              className={inputClass}
              value={form.childName}
              onChange={(e) => set("childName")(e.target.value)}
              placeholder="Nguyễn Minh Khoa"
              autoComplete="off"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="source">
              Nguồn
            </label>
            <input
              id="source"
              className={inputClass}
              value={form.source}
              onChange={(e) => set("source")(e.target.value)}
              placeholder="Chọn gợi ý hoặc tự gõ…"
              autoComplete="off"
              list="nguon-goi-y"
            />
            {/* Ô này CỐ Ý gõ tự do (chốt 22/08) — người nhập phải viết được "chị
                Hoa lớp 3 giới thiệu". Gợi ý chỉ để gõ nhanh và để nhiều người
                cùng gọi một nguồn bằng một tên. Danh sách lấy từ `NGUON_LEAD`,
                đừng chép tay lần hai. */}
            <datalist id="nguon-goi-y">
              {NGUON_LEAD.map((s) => (
                <option key={s.id} value={s.label} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="facebookUrl">
              Link Facebook
            </label>
            <input
              id="facebookUrl"
              className={inputClass}
              value={form.facebookUrl}
              onChange={(e) => set("facebookUrl")(e.target.value)}
              placeholder="facebook.com/… hoặc m.me/…"
              inputMode="url"
              autoComplete="off"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="centerCode">
              Cơ sở phụ huynh chọn
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
          Không ô nào bắt buộc — điền được tới đâu lưu tới đó. Mã nhân viên hệ
          thống tự lấy từ tài khoản bạn đang đăng nhập.
        </p>

        <button
          type="submit"
          disabled={pending || isBlank}
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
