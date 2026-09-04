"use client";

/**
 * Nút xoá buổi học trên bảng của site Sale — bản đôi GIAO DIỆN của khối xoá
 * trong `app/(admin)/admin/sessions/_components/session-list-row.tsx`.
 *
 * ⚠️ CHỈ giao diện là bản đôi. Việc xoá gọi ĐÚNG server action `deleteSession`
 *    của khu quản trị (tự kiểm `sessions:edit` + cách ly cơ sở qua
 *    `sessionClassInScope`). Chép logic xoá sang đây là nhân đôi một đường GHI —
 *    chủ dự án chốt tách BẢN GIAO DIỆN (04/09), server action không có pixel nào
 *    để đụng.
 *
 * ⚠️ `router.refresh()` là BẮT BUỘC: `deleteSession` gọi
 *    `revalidatePath("/sessions")` + `revalidatePath("/attendance")` — hai đường
 *    của KHU QUẢN TRỊ. Không có lệnh làm mới ở đây thì buổi vừa xoá vẫn nằm
 *    nguyên trên màn cho tới khi người dùng tự tải lại trang.
 *
 * ⚠️ `ConfirmDialog` dùng lại từ `components/admin/` CÓ CHỦ ĐÍCH: nó là một
 *    nguyên liệu dựng trên `Dialog` của kho, không phải một màn quản trị — cùng
 *    hạng với `StatusPill` và `PhanTrangBang` mà site Sale vẫn dùng chung. Và câu
 *    cảnh báo hậu quả ("N bản ghi điểm danh của buổi này sẽ bị xoá theo") là thứ
 *    pattern 2-nhịp không nói được — QA 20/07 đã bỏ `window.confirm` ở đúng chỗ
 *    này vì lý do đó, đừng lùi lại.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { deleteSession } from "@/app/(admin)/admin/sessions/_actions";

export function NutXoaBuoiHoc({
  buoiId,
  nhan,
  tenLop,
  soDiemDanh,
}: {
  buoiId: string;
  /** Chủ đề buổi, hoặc chuỗi ngày giờ khi buổi chưa đặt chủ đề. */
  nhan: string;
  tenLop: string;
  soDiemDanh: number;
}) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [dang, start] = useTransition();

  function xacNhan() {
    start(async () => {
      const res = await deleteSession(buoiId);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Đã xoá buổi học");
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
        disabled={dang}
        title="Xoá"
        aria-label={`Xoá buổi ${nhan}`}
        className="inline-flex size-8 items-center justify-center rounded-md border border-border text-[color:var(--state-danger-ink)] transition-colors hover:bg-[color:var(--state-danger-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-danger)]/30 disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>
      <ConfirmDialog
        open={mo}
        onOpenChange={setMo}
        pending={dang}
        title={`Xoá buổi học "${nhan}"?`}
        description={
          soDiemDanh > 0 ? (
            <>
              Buổi thuộc lớp <strong>{tenLop}</strong>.{" "}
              <strong>{soDiemDanh} bản ghi điểm danh</strong> của buổi này sẽ bị xoá theo.
              Hành động không thể hoàn tác.
            </>
          ) : (
            <>
              Buổi thuộc lớp <strong>{tenLop}</strong>, chưa có điểm danh. Hành động không
              thể hoàn tác.
            </>
          )
        }
        confirmLabel="Xoá buổi học"
        onConfirm={xacNhan}
      />
    </>
  );
}
