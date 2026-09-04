"use client";

/**
 * Site Sale — hai nút thao tác trên một yêu cầu chuyển lớp.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/chuyen-lop/_components/request-actions.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Duyệt/từ chối vẫn gọi ĐÚNG Server Action của khu quản
 *    trị (`approveTransferAction` · `rejectTransferAction`) — nơi kiểm quyền
 *    `enrollments:transfer`, kiểm chỗ trống lớp đích, và ghi lịch sử cơ sở cũ.
 *
 * ⚠️ `canDuyet` ĐẾN TỪ MÁY CHỦ, KHÔNG TỰ ĐOÁN Ở ĐÂY. P1-c: sale/quản lý TẠO yêu
 *    cầu (`enrollments:create` — chính là cổng của màn), chỉ quản lý DUYỆT
 *    (`enrollments:transfer`). Người tạo chỉ xem trạng thái chờ duyệt. Đây là
 *    quyền ở TẦNG HÀNH ĐỘNG, không phải cổng trang — nên nó không thuộc
 *    `PAGE_GATES` và không được đem ra chặn cả màn.
 *
 * GIỮ NGUYÊN 100%: câu "Chờ quản lý duyệt", nút "Duyệt" chỉ hiện khi đã có lớp
 * đích, nút "Từ chối" hai lần bấm ("Từ chối" → "Xác nhận?"), và mọi toast.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Hai nút nền đặc `bg-state-success-ink` / `bg-state-danger-ink` → nút viền,
 *    chữ màu ngữ nghĩa. Hai khối màu đặc trong một ô bảng 44px hút hết mắt khỏi
 *    tên học viên — thứ người ta thật sự đang đọc.
 * 2. Thêm `onBlur` xoá trạng thái chờ xác nhận: một nút "Xác nhận?" đứng chờ vô
 *    hạn trong bảng là một cú bấm nhầm đang đợi xảy ra (cùng bài học đã ghi ở
 *    `dang-ky-hoc/_components/nut-xoa.tsx`).
 * 3. `router.refresh()` sau mỗi thao tác: Server Action bên admin
 *    `revalidatePath("/admin/chuyen-lop")` — đường của KHU QUẢN TRỊ, không phải
 *    `/sale/chuyen-lop`. Thiếu nó thì dòng vừa duyệt vẫn nằm nguyên trong bảng
 *    "đang chờ" và người dùng bấm duyệt lần nữa.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  approveTransferAction,
  rejectTransferAction,
} from "@/app/(admin)/admin/chuyen-lop/_actions";

const NUT =
  "inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium " +
  "transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2";

export function ThaoTacYeuCau({
  id,
  coLopDich,
  canDuyet,
}: {
  id: string;
  coLopDich: boolean;
  canDuyet: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [xacNhanTuChoi, setXacNhanTuChoi] = useState(false);

  if (!canDuyet) {
    return <span className="text-xs text-muted-foreground">Chờ quản lý duyệt</span>;
  }

  function duyet() {
    start(async () => {
      const res = await approveTransferAction(id);
      if (res.ok) toast.success("Đã duyệt chuyển");
      else toast.error(res.error ?? "Lỗi");
      router.refresh();
    });
  }

  function tuChoi() {
    if (!xacNhanTuChoi) {
      setXacNhanTuChoi(true);
      return;
    }
    start(async () => {
      const res = await rejectTransferAction(id);
      if (res.ok) toast.success("Đã từ chối");
      else toast.error(res.error ?? "Lỗi");
      setXacNhanTuChoi(false);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {coLopDich ? (
        <button
          type="button"
          onClick={duyet}
          disabled={pending}
          className={cn(
            NUT,
            "border-[color:var(--state-success)]/45 text-[color:var(--state-success)]",
            "hover:bg-[color:var(--state-success-soft)]",
            "focus-visible:ring-[color:var(--state-success)]/35",
          )}
        >
          Duyệt
        </button>
      ) : null}
      <button
        type="button"
        onClick={tuChoi}
        onBlur={() => setXacNhanTuChoi(false)}
        disabled={pending}
        className={cn(
          NUT,
          "focus-visible:ring-[color:var(--state-danger)]/35",
          xacNhanTuChoi
            ? "border-[color:var(--state-danger)] bg-[color:var(--state-danger)] text-white"
            : "border-[color:var(--state-danger)]/45 text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-soft)]",
        )}
      >
        {xacNhanTuChoi ? "Xác nhận?" : "Từ chối"}
      </button>
    </span>
  );
}
