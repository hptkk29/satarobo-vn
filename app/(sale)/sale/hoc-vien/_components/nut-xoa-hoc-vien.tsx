"use client";

/**
 * Nút xoá học viên trên bảng của site Sale — bản đôi GIAO DIỆN của
 * `app/(admin)/admin/students/_components/delete-student-button.tsx`.
 *
 * ⚠️ CHỈ giao diện là bản đôi. Việc xoá vẫn gọi ĐÚNG server action
 *    `deleteStudent` của khu quản trị — nó tự `auth()` + kiểm quyền + kiểm cách
 *    ly cơ sở + xoá mềm trong transaction. Chép logic xoá sang đây là nhân đôi
 *    một đường GHI, tức nhân đôi chỗ để sót một điều kiện an toàn. Chủ dự án
 *    chốt tách BẢN GIAO DIỆN (04/09) chứ không tách nghiệp vụ; server action
 *    không có pixel nào để đụng.
 *
 * ⚠️ Vai `CENTER_SALES_CSM` hôm nay KHÔNG có `students:delete`, nên nút này
 *    thực tế chưa hiện với ai trên site Sale. Vẫn dựng vì cổng là QUYỀN chứ
 *    không phải vai: quản trị viên cấp quyền trong giao diện là nó phải có mặt,
 *    không cần ai đi triển khai lại. Một nút biến mất im lặng khó phát hiện hơn
 *    nhiều so với một nút thừa.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteStudent } from "@/app/(admin)/admin/students/_actions";
import { cn } from "@/lib/utils";

export function NutXoaHocVien({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hoi, setHoi] = useState(false);

  function bam() {
    // Hai nhịp: nhịp một hỏi, nhịp hai làm. Rời tiêu điểm là huỷ hỏi.
    if (!hoi) {
      setHoi(true);
      return;
    }
    start(async () => {
      const r = await deleteStudent(studentId);
      if (r.error) {
        toast.error(r.error);
      } else {
        toast.success(`Đã xoá học viên ${studentName}`);
        router.refresh();
      }
      setHoi(false);
    });
  }

  return (
    <button
      type="button"
      onClick={bam}
      onBlur={() => setHoi(false)}
      disabled={pending}
      aria-label={hoi ? `Xác nhận xoá ${studentName}` : `Xoá ${studentName}`}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
        hoi
          ? "border-[color:var(--state-danger)] bg-[color:var(--state-danger)] text-white"
          : "border-border text-[color:var(--state-danger-ink)] hover:bg-[color:var(--state-danger-soft)]",
      )}
    >
      {hoi ? "Xác nhận xoá?" : "Xoá"}
    </button>
  );
}
