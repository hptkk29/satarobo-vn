"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { closeLeadAsEnrolled } from "../../actions";

type ClassOpt = { id: string; label: string; price: number | null };

export function CloseDealButton({
  leadId,
  defaultStudentName,
  defaultParentEmail,
  classes,
}: {
  leadId: string;
  defaultStudentName: string;
  defaultParentEmail: string | null;
  classes: ClassOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [classId, setClassId] = useState("");
  const [studentName, setStudentName] = useState(defaultStudentName);
  const [tuition, setTuition] = useState("");
  const [tuitionEdited, setTuitionEdited] = useState(false);
  const [paid, setPaid] = useState(false);

  // FIX 8 — chọn lớp → tự điền học phí = giá khoá (Course.price), trừ khi đã sửa tay.
  function handlePickClass(id: string) {
    setClassId(id);
    if (tuitionEdited) return;
    const price = classes.find((c) => c.id === id)?.price;
    setTuition(price != null ? String(price) : "");
  }
  const [createParent, setCreateParent] = useState(false);
  const [parentEmail, setParentEmail] = useState(defaultParentEmail ?? "");
  const [parentPassword, setParentPassword] = useState("");

  function submit() {
    if (!classId) {
      toast.error("Vui lòng chọn lớp");
      return;
    }
    if (createParent && !parentEmail.trim()) {
      toast.error("Nhập email phụ huynh để cấp tài khoản");
      return;
    }
    startTransition(async () => {
      const res = await closeLeadAsEnrolled(leadId, {
        classId,
        studentName: studentName.trim() || undefined,
        tuition: tuition ? Number.parseInt(tuition, 10) : null,
        paid,
        createParentAccount: createParent,
        parentEmail: createParent ? parentEmail.trim() : undefined,
        parentPassword: createParent ? parentPassword.trim() || undefined : undefined,
      });
      if (res.ok) {
        if (res.parentAccountEmail) {
          toast.success(
            `Đã chốt deal + cấp tài khoản phụ huynh (${res.parentAccountEmail})${
              res.parentTempPasswordIsPhone ? " — mật khẩu tạm = SĐT, dặn PH đổi sau" : ""
            }`,
          );
        } else {
          toast.success("Đã chốt deal — tạo học viên & đăng ký");
        }
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi chốt deal");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <CheckCircle2 size={14} />
        Chốt deal
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-800">
          Chốt deal — tạo học viên + đăng ký
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            Tên học viên
          </span>
          <input
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            Lớp đăng ký *
          </span>
          <select
            value={classId}
            onChange={(e) => handlePickClass(e.target.value)}
            className={inputCls}
          >
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            Học phí (VNĐ)
          </span>
          <input
            type="number"
            min={0}
            value={tuition}
            onChange={(e) => {
              setTuition(e.target.value);
              setTuitionEdited(true);
            }}
            placeholder="Tự điền theo khoá — sửa được"
            className={inputCls}
          />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Đã thanh toán
        </label>
      </div>

      {classes.length === 0 && (
        <p className="mt-2 text-xs text-amber-600">
          Chưa có lớp nào đang mở. Tạo lớp ở mục Lớp học trước khi chốt.
        </p>
      )}

      {/* C2 — cấp tài khoản phụ huynh portal */}
      <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={createParent}
            onChange={(e) => setCreateParent(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Cấp tài khoản phụ huynh (portal hocvien.satarobo.vn)
        </label>
        {createParent && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Email đăng nhập *
              </span>
              <input
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                placeholder="phuhuynh@email.com"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Mật khẩu tạm
              </span>
              <input
                type="text"
                value={parentPassword}
                onChange={(e) => setParentPassword(e.target.value)}
                placeholder="Để trống = dùng SĐT"
                className={inputCls}
              />
            </label>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !classId}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Đang xử lý…" : "Xác nhận chốt"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";
