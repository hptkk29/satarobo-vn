"use client";

/**
 * Nút xoá lớp trên bảng của site Sale — bản đôi GIAO DIỆN của
 * `app/(admin)/admin/classes/_components/class-delete-button.tsx`.
 *
 * ⚠️ CHỈ giao diện là bản đôi. Việc xoá gọi ĐÚNG server action `deleteClass` của
 *    khu quản trị (xoá mềm, tự kiểm quyền + cách ly cơ sở). Chép logic xoá sang
 *    đây là nhân đôi một đường GHI — chủ dự án chốt tách BẢN GIAO DIỆN (04/09),
 *    server action không có pixel nào để đụng.
 *
 * ⚠️ `ConfirmDialog` dùng lại từ `components/admin/` CÓ CHỦ ĐÍCH: nó là một
 *    nguyên liệu dựng trên `Dialog` của kho, không phải một màn quản trị — cùng
 *    hạng với `StatusPill` và `PhanTrangBang` mà site Sale vẫn dùng chung. Đổi
 *    nó KHÔNG đổi pixel nào riêng của khu quản trị. Và câu cảnh báo hậu quả
 *    ("lớp này có N học viên…") là thứ pattern 2-nhịp không nói được — QA 20/07
 *    đã bỏ 2-nhịp ở đúng nút này vì lý do đó, đừng lùi lại.
 *
 * ⚠️ Vai `CENTER_SALES_CSM` hôm nay KHÔNG có `classes:delete` (cũng không có
 *    create/edit), nên nút này chưa hiện với ai trên site Sale. Vẫn dựng vì cổng
 *    là QUYỀN chứ không phải vai: quản trị viên cấp quyền là nó phải có mặt ngay,
 *    không cần ai đi triển khai lại.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { deleteClass } from "@/app/(admin)/admin/classes/_actions";

export function NutXoaLop({
  classId,
  name,
  enrollmentCount,
  sessionCount,
}: {
  classId: string;
  name: string;
  enrollmentCount: number;
  sessionCount: number;
}) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [dang, start] = useTransition();

  function xacNhan() {
    start(async () => {
      const res = await deleteClass(classId);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success(`Đã xoá lớp "${name}"`);
        router.refresh();
      }
      setMo(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMo(true)}
        aria-label={`Xoá ${name}`}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-[color:var(--state-danger-ink)] transition-colors hover:bg-[color:var(--state-danger-soft)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Xoá
      </button>
      <ConfirmDialog
        open={mo}
        onOpenChange={setMo}
        pending={dang}
        title={`Xoá lớp "${name}"?`}
        description={
          <>
            Lớp này có <strong>{enrollmentCount} học viên đang học</strong> và{" "}
            <strong>{sessionCount} buổi học</strong>. Lớp sẽ bị ẩn khỏi danh sách (xoá
            mềm) — điểm danh, buổi học và ghi danh vẫn được giữ nhưng không còn truy cập
            từ giao diện.
          </>
        }
        confirmLabel="Xoá lớp"
        onConfirm={xacNhan}
      />
    </>
  );
}
