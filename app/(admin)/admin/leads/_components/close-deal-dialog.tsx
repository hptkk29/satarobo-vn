"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { closeLeadAsEnrolled, getLeadCloseDealOptions } from "../actions";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";

type ClassOpt = { id: string; label: string };

/**
 * FIX 4 — Dialog chốt deal mở NGAY từ Kanban/table. Tự fetch options (lớp +
 * default) khi mở; gọi lại closeLeadAsEnrolled như trang chi tiết.
 */
export function CloseDealDialog({
  leadId,
  leadName,
  onClose,
  onSuccess,
}: {
  leadId: string | null;
  leadName: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [classId, setClassId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [tuition, setTuition] = useState("");
  const [paid, setPaid] = useState(false);
  const [createParent, setCreateParent] = useState(false);
  const [parentEmail, setParentEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");

  const open = leadId !== null;

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);
    // reset form mỗi lần mở
    setClassId("");
    setTuition("");
    setPaid(false);
    setCreateParent(false);
    setParentPassword("");
    getLeadCloseDealOptions(leadId)
      .then((res) => {
        if (!res.ok) {
          setLoadError(res.error ?? "Không tải được dữ liệu");
          return;
        }
        setClasses(res.classes ?? []);
        setStudentName(res.defaultStudentName ?? "");
        setParentEmail(res.defaultParentEmail ?? "");
      })
      .catch(() => setLoadError("Lỗi tải dữ liệu chốt deal"))
      .finally(() => setLoading(false));
  }, [leadId]);

  if (!open) return null;

  function submit() {
    if (!leadId) return;
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
      if (!res.ok) {
        toast.error(res.error ?? "Lỗi chốt deal");
        return;
      }
      const code = res.studentCode ? ` (${res.studentCode})` : "";
      const parentNote =
        res.parentAccountEmail
          ? ` · tài khoản PH: ${res.parentAccountEmail}${res.parentTempPasswordIsPhone ? " (mật khẩu = SĐT)" : ""}`
          : "";
      toast.success(`Đã chốt deal — tạo học viên${code}${parentNote}`, {
        action: res.studentId
          ? {
              label: "Xem hồ sơ",
              onClick: () => router.push(`/students/${res.studentId}`),
            }
          : undefined,
      });
      onClose();
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
            <CheckCircle2 size={16} />
            Chốt deal — {leadName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : (
          <>
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
                  onChange={(e) => setClassId(e.target.value)}
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
                  onChange={(e) => setTuition(e.target.value)}
                  placeholder="Tùy chọn"
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
                Chưa có lớp nào đang mở (cùng cơ sở với lead). Tạo lớp trước khi chốt.
              </p>
            )}

            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending ? "Đang xử lý…" : "Xác nhận chốt"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
