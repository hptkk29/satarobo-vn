"use client";

/**
 * Site Sale — ô trả lời một hội thoại Messenger.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/crm/messenger/_components/reply-box.tsx` ──
 * Tách bản riêng theo chốt 04/09/2026. Bản admin GIỮ NGUYÊN, không sửa.
 *
 * 🔴 LUẬT SỐ MỘT, chép nguyên từ bản admin và từ `components/sale/hop-thu/`:
 *    **chỉ nói "Đã gửi" khi server xác nhận `daGuiThat`.**
 *    Bản trước-nữa suy "đã gửi" từ `res.ok` rồi bắn `toast.success("Đã gửi")` cho
 *    một hành động chỉ ghi DB — khách không nhận gì, người trực tin là xong việc.
 *    `KetQuaTraLoiUI` là union phân biệt nên TypeScript BẮT phải xử lý nhánh mô
 *    phỏng; đừng "gọn hoá" nó thành `if (res.ok) toast.success(...)`.
 *
 * `moPhong` do SERVER tính (thiếu khoá Meta, hoặc công tắc `messenger.sendLive`
 * tắt) và hiện NGAY trên ô nhập — người dùng biết TRƯỚC khi gõ, không phải bấm
 * mới biết.
 *
 * ⚠️ `replyAction` gọi `revalidatePath("/admin/crm/messenger")` — đường của host
 *    QUẢN TRỊ, không khớp `/sale/messenger`. Không tự `router.refresh()` thì tin
 *    vừa gửi không hiện lên cho tới khi tải lại tay (bài học `touch-panel.tsx`).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { replyAction } from "@/app/(admin)/admin/crm/messenger/actions";

/** Hai câu mở lời hay dùng nhất — chép nguyên văn từ bản admin. */
const TRA_LOI_NHANH = [
  "Dạ anh/chị cho em xin SĐT để tư vấn lộ trình phù hợp cho bé ạ.",
  "Dạ Sata Robo có lớp thử miễn phí, anh/chị cho bé qua trải nghiệm nhé.",
];

export function OTraLoiMessenger({
  conversationId,
  moPhong,
}: {
  conversationId: string;
  moPhong: boolean;
}) {
  const router = useRouter();
  const [noiDung, setNoiDung] = useState("");
  const [dangChay, batDau] = useTransition();

  function gui(giaTri: string) {
    const noi = giaTri.trim();
    if (!noi) return;
    batDau(async () => {
      const kq = await replyAction(conversationId, noi);
      if (!kq.ok) {
        toast.error(kq.error);
        return;
      }
      setNoiDung("");
      router.refresh();
      if (kq.daGuiThat) toast.success("Đã gửi tới khách");
      // Mô phỏng: KHÔNG dùng `toast.success`. Tin nằm trong sổ nhưng khách không
      // nhận — báo xanh ở đây là quay lại đúng lỗi đã phải đi dẹp.
      else toast.warning(kq.canhBao, { duration: 8000 });
    });
  }

  return (
    <div className="space-y-2">
      {moPhong ? (
        <p
          role="status"
          className="flex gap-2 rounded-lg border border-[color:var(--state-warning)]/35 bg-[color:var(--state-warning-soft)] px-3 py-2 text-xs text-[color:var(--state-warning)]"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Trang này <strong>chưa nối khoá gửi thật</strong>. Tin soạn ở đây được lưu vào hệ
            thống nhưng <strong>KHÔNG tới khách</strong> — hãy trả lời trực tiếp trên
            Facebook cho tới khi nối xong.
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Input
          value={noiDung}
          onChange={(e) => setNoiDung(e.target.value)}
          placeholder="Nhập trả lời..."
          disabled={dangChay}
          className="h-9 min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && noiDung.trim()) gui(noiDung);
          }}
        />
        <Button
          size="sm"
          className="h-9 shrink-0"
          onClick={() => gui(noiDung)}
          disabled={dangChay || !noiDung.trim()}
        >
          <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
          {dangChay ? "Đang xử lý…" : moPhong ? "Gửi (mô phỏng)" : "Gửi"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TRA_LOI_NHANH.map((cau) => (
          <button
            key={cau}
            type="button"
            disabled={dangChay}
            onClick={() => gui(cau)}
            // `title` mang câu ĐẦY ĐỦ: nút chỉ hiện 28 ký tự đầu, mà bấm vào là
            // GỬI THẲNG cho khách — người dùng phải đọc được hết trước khi bấm.
            title={cau}
            className="max-w-full truncate rounded-lg border border-border bg-[color:var(--surface-chim)] px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {cau.slice(0, 28)}…
          </button>
        ))}
      </div>
    </div>
  );
}
