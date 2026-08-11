"use client";

import { useRouter } from "next/navigation";

/**
 * Ô chọn ngày cho trang chấm công: đổi ngày → điều hướng `?date=` để RSC fetch lại.
 * Trước đây input nằm trong <form> trơ (không nút/không onChange) nên đổi ngày KHÔNG
 * refetch — nội dung đứng ở ngày cũ.
 */
export function DateNavInput({ value }: { value: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={value}
      onChange={(e) => {
        if (e.target.value) router.push(`/cham-cong?date=${e.target.value}`);
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-sm"
    />
  );
}
