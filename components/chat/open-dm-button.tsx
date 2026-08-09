"use client";

// US-13 AC1 — nút "Nhắn riêng" dùng CHUNG cho cả hai chiều:
//   • phía phụ huynh: đứng cạnh tên GIÁO VIÊN trong danh sách thành viên nhóm lớp;
//   • phía nhân viên (admin + site GV): đứng cạnh tên PHỤ HUYNH trong cùng danh sách.
//
// ⚠️ Nút này KHÔNG phải chốt chặn. Ai hiện/ẩn nút chỉ là UX; `openDm` tự kiểm quyền
// (`can()` với target) + kiểm quan hệ dạy học ở server, nên gọi thẳng action mà không
// qua nút vẫn bị chặn y hệt.
//
// Hai site có kiểu URL hội thoại khác nhau (portal đi theo path, màn nhân viên đi theo
// query `?c=`), nên nhận `hrefTemplate` với chỗ trống `:id` — không truyền hàm qua biên
// RSC → Client được.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openDmAction } from "@/lib/chat/_actions";

export function OpenDmButton({
  peerUserId,
  hrefTemplate,
  label = "Nhắn riêng",
}: {
  /** `User.id` của người còn lại. */
  peerUserId: string;
  /** Vd `"/portal/tin-nhan/:id"` hoặc `"/tin-nhan?c=:id"`. */
  hrefTemplate: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function open() {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        const res = await openDmAction({ peerUserId });
        if (!res.ok) {
          toast.error(res.error.message);
          setPending(false);
          return;
        }
        // Giữ `pending` = true qua lúc điều hướng: bấm thêm lần nữa trong khi router
        // đang chuyển trang chỉ tạo thêm một lời gọi thừa (server vẫn trả cùng 1 hội
        // thoại nhờ unique dmKey, nhưng không việc gì phải gọi).
        router.push(hrefTemplate.replace(":id", res.data.conversationId));
        router.refresh();
      } catch {
        toast.error("Không mở được hội thoại riêng — vui lòng thử lại.");
        setPending(false);
      }
    })();
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={open}
      disabled={pending}
      className="h-9 shrink-0 gap-1.5 text-xs"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <MessageSquare className="size-3.5" aria-hidden />
      )}
      {label}
    </Button>
  );
}
