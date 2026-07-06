"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setActiveSite } from "@/app/(portal)/portal/actions";

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
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setActiveSite(studentId);
          if (res.ok) router.push("/portal/ho-so-con/chi-tiet");
          else toast.error(res.error ?? "Không mở được hồ sơ con");
        })
      }
      className={className}
    >
      {children}
    </button>
  );
}
