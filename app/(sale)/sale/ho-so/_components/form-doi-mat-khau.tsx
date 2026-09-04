"use client";

/**
 * Site Sale — form "Đổi mật khẩu".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/settings/_components/change-password-form.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Việc đổi mật khẩu vẫn gọi ĐÚNG một Server Action
 *    `changePassword` của khu quản trị — nơi có `auth()`, `changePasswordSchema`,
 *    so khớp mật khẩu cũ bằng `bcrypt.compare`, và băm bằng `bcrypt.hash(…, 12)`.
 *    Nhân bản LOGIC mật khẩu là cách chắc chắn nhất để hai khu có hai độ mạnh
 *    khác nhau.
 *
 * GIỮ NGUYÊN 100%: ba ô đúng thứ tự và đúng nhãn (Mật khẩu hiện tại · Mật khẩu
 * mới · Xác nhận mật khẩu mới), `required` + `minLength={8}` ở đúng ô cũ, nút hiện
 * / ẩn ở đúng hai ô cũ, nhãn nút và trạng thái "Đang lưu...", câu báo thành công
 * "Mật khẩu đã được cập nhật", và mọi câu lỗi (chúng đến từ Server Action).
 *
 * ⚠️ Ô "Xác nhận mật khẩu mới" CỐ Ý không có nút hiện/ẩn — giống bản admin. Ô xác
 *    nhận tồn tại để bắt lỗi gõ; cho xem nội dung nó là bỏ luôn tác dụng đó.
 */
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { changePassword } from "@/app/(admin)/admin/settings/actions";

const LOP_O_NHAP = cn(
  "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm",
  "focus:border-[color:var(--primary)] focus:outline-none",
  "focus:ring-2 focus:ring-[color:var(--primary)]/20",
);

const LOP_NUT_MAT = cn(
  "absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground",
  "transition-colors hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
);

export function FormDoiMatKhau() {
  const [pending, start] = useTransition();
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState(false);
  const [hienCu, setHienCu] = useState(false);
  const [hienMoi, setHienMoi] = useState(false);

  function gui(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoi(null);
    setXong(false);
    const form = e.currentTarget;
    const formData = new FormData(form);
    start(async () => {
      const res = await changePassword(formData);
      if (res.error) {
        setLoi(res.error);
      } else {
        setXong(true);
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={gui} className="max-w-sm space-y-4">
      {loi && (
        <p className="rounded-lg border border-state-danger-soft bg-state-danger-soft px-4 py-3 text-sm text-state-danger-ink">
          {loi}
        </p>
      )}
      {xong && (
        <p className="rounded-lg border border-state-success-soft bg-state-success-soft px-4 py-3 text-sm text-state-success-ink">
          Mật khẩu đã được cập nhật
        </p>
      )}

      <div>
        <label
          htmlFor="mat-khau-hien-tai"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Mật khẩu hiện tại
        </label>
        <div className="relative">
          <input
            id="mat-khau-hien-tai"
            name="currentPassword"
            type={hienCu ? "text" : "password"}
            required
            autoComplete="current-password"
            className={cn(LOP_O_NHAP, "pr-10")}
          />
          <button
            type="button"
            onClick={() => setHienCu((v) => !v)}
            aria-label={hienCu ? "Ẩn mật khẩu hiện tại" : "Hiện mật khẩu hiện tại"}
            className={LOP_NUT_MAT}
          >
            {hienCu ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="mat-khau-moi" className="mb-1.5 block text-sm font-medium text-foreground">
          Mật khẩu mới
        </label>
        <div className="relative">
          <input
            id="mat-khau-moi"
            name="newPassword"
            type={hienMoi ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            className={cn(LOP_O_NHAP, "pr-10")}
          />
          <button
            type="button"
            onClick={() => setHienMoi((v) => !v)}
            aria-label={hienMoi ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
            className={LOP_NUT_MAT}
          >
            {hienMoi ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="xac-nhan-mat-khau" className="mb-1.5 block text-sm font-medium text-foreground">
          Xác nhận mật khẩu mới
        </label>
        <input
          id="xac-nhan-mat-khau"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className={LOP_O_NHAP}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          "hover:bg-[color:var(--primary-dark)] disabled:opacity-60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
        )}
      >
        {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
        {pending ? "Đang lưu..." : "Cập nhật mật khẩu"}
      </button>
    </form>
  );
}
