"use client";

import { useSetActiveSite } from "@/components/portal/use-set-active-site";

// "Xem hồ sơ chi tiết" — đổi con đang chọn (setActiveSite) rồi mở trang chi tiết
// (KHÔNG lộ studentId trên URL — PHƯƠNG ÁN A).
export function ChildDetailLink({
  studentId,
  className,
  children,
}: {
  studentId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending, switchTo } = useSetActiveSite();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        switchTo(studentId, {
          onSuccess: (router) => router.push("/portal/ho-so-con/chi-tiet"),
          errorMessage: "Không mở được hồ sơ con",
        })
      }
      className={className}
    >
      {children}
    </button>
  );
}
