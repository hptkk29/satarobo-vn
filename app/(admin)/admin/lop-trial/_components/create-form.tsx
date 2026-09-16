"use client";

// app/(admin)/admin/lop-trial/_components/create-form.tsx
//
// Form tạo lớp trải nghiệm — 28/08/2026: chỉ còn CƠ SỞ + KHOÁ TRẢI NGHIỆM.
//
// Tên lớp KHÔNG có ô nhập: server tự sinh theo quy ước `Cơ sở_Lớp trial số`, dùng chung
// bộ đếm với mã lớp nên hai thứ không bao giờ lệch nhau. Cho người gõ tên là mời hai
// lớp trùng tên và mời lệch khỏi quy ước — mà tên này đi thẳng vào phiếu gửi phụ huynh.
//
// Giờ · phòng · giáo viên · sĩ số ĐÃ RỜI khỏi đây: chúng là thuộc tính của TỪNG BUỔI
// (một lớp là slot tái sử dụng, hai buổi khác ngày có thể khác giờ và khác người dạy).
// Chọn ba thứ đó ở khối "Thêm buổi học" trong trang chi tiết lớp.

import type { JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLopTrialClassAction } from "../_actions";
import { tenLopTrial } from "@/lib/trial/lop-moi";
import type { Option } from "../_lib/types";

export function CreateForm({
  centers,
  courses,
}: {
  /** `code` để xem trước tên lớp sẽ sinh ra; thiếu thì rơi về `name`. */
  centers: (Option & { code?: string | null })[];
  /** `slug` là phần MÃ KHOÁ trong tên lớp (`CS2-sata4-…`), không phải `name`. */
  courses: (Option & { slug?: string | null })[];
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [courseId, setCourseId] = useState("");

  const center = centers.find((c) => c.id === centerId);
  const course = courses.find((c) => c.id === courseId);
  // Chỉ XEM TRƯỚC phần mã cơ sở + mã khoá: số thứ tự do server cấp trong transaction
  // (cùng bộ đếm với mã lớp), client đoán số là chắc chắn có lúc đoán sai.
  const xemTruocTen = center
    ? tenLopTrial(center.code ?? center.name, course?.slug ?? null, 0)
    : "";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!centerId) {
      toast.error("Chọn cơ sở");
      return;
    }
    startTransition(async () => {
      const res = await createLopTrialClassAction({
        centerId,
        courseId: courseId || undefined,
      });
      if (res.ok) {
        toast.success("Đã tạo lớp trải nghiệm");
        router.push(res.id ? `/lop-trial/${res.id}` : "/lop-trial");
        router.refresh();
        return;
      }
      toast.error(res.error);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Tên lớp
        <input
          type="text"
          value={xemTruocTen ? xemTruocTen.replace(/ 0$/, " …") : ""}
          readOnly
          disabled
          aria-label="Tên lớp — hệ thống tự sinh"
          className="rounded-lg border border-dashed border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
        />
        <span className="text-[11px]">
          Tự sinh theo quy ước <strong>Cơ sở_Lớp trial số</strong>; số thứ tự do hệ thống
          cấp khi lưu.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Cơ sở *
        <select
          value={centerId}
          onChange={(e) => setCenterId(e.target.value)}
          disabled={pending}
          required
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Khoá trải nghiệm
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={pending}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          <option value="">— chưa chọn khoá —</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-[11px]">Chính là &quot;khoá quan tâm&quot; của khách.</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Đang tạo…" : "Tạo lớp"}
      </button>

      <p className="text-xs text-muted-foreground">
        Tạo xong nhớ <strong>thêm buổi</strong> (ngày, giờ, phòng, giáo viên) ở trang chi
        tiết lớp — lớp chưa có buổi thì giáo viên không thấy gì trên lịch dạy.
      </p>
    </form>
  );
}
