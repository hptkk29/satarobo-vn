"use client";

/**
 * THƯ VIỆN ảnh lớp của site Sale — bản đôi GIAO DIỆN của nửa phải
 * `app/(admin)/admin/media/_components/media-client.tsx` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng hai chế độ lọc và đúng từng chữ hai nhãn của chúng, đúng bốn nhãn trạng
 * thái, đúng hai câu rỗng ("Kho trống." / "Chưa có ảnh."), đúng dải nhắc về kho,
 * đúng từng dòng phụ trên thẻ ảnh ("Buổi …", chú thích, "Tag: …", "Tải lên: …"),
 * đúng ba thao tác của người duyệt và đúng câu cảnh báo hậu quả khi xoá.
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 *   1. Không còn thẻ `rounded-xl border bg-card` bọc ngoài: khối này nay là một
 *      CỘT trong `KhungDuLieu` của trang (khung lồng khung bị cấm).
 *   2. Nhãn trạng thái qua `<StatusPill tone={toneTrangThaiAnh(...)}>` thay vì
 *      một biểu thức ba ngôi bốn tầng ghép class ngay trong JSX — luật
 *      `lib/sale/ky-luat-mau.test.ts`. TONE giữ đúng bản admin.
 *   3. Ô lọc: `<select>` gốc → `<Select>` của kho.
 *   4. Lưới ảnh 2 cột cứng → `auto-fill` theo bề rộng thật: cột phải của màn này
 *      rộng gấp đôi cột trái, ép 2 cột là hai tấm ảnh to bằng nửa màn hình.
 *   5. Ba thao tác của người duyệt: icon trần (không viền, vùng bấm ~16px) → nút
 *      có viền và vùng chạm 32px. `PRODUCT.md` đòi vùng chạm đủ lớn, và đây là ba
 *      nút KHÔNG HOÀN TÁC ĐƯỢC — bấm nhầm vì vùng bấm bé là lỗi tốn ảnh thật.
 *
 * ⚠️ MỌI ĐƯỜNG GHI GỌI ĐÚNG SERVER ACTION CỦA KHU QUẢN TRỊ (`reviewMedia`,
 *    `deleteMedia`, `deleteDraftMediaAction`) — cả ba tự kiểm quyền + cách ly cơ
 *    sở. `router.refresh()` sau mỗi lần là BẮT BUỘC: chúng gọi
 *    `revalidatePath("/media")` + `revalidatePath("/portal/hinh-anh")`, hai đường
 *    KHÔNG phải của site Sale.
 *
 * ⚠️ `duyetDuoc` (`media:approve`) đến từ server, KHÔNG suy từ vai ở đây. Ảnh
 *    DRAFT thì KHÔNG có nút duyệt/từ chối — server chặn `reviewMedia` trên DRAFT,
 *    đường rời kho duy nhất là giáo viên gửi. Chỉ cho DỌN kho: người duyệt xoá
 *    được mọi ảnh, người khác chỉ ảnh của chính mình (server chốt lại).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusPill } from "@/components/admin/ui/status-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateVN } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import {
  NHAN_LOC_THU_VIEN,
  nhanTrangThaiAnh,
  toneTrangThaiAnh,
  type LocThuVien,
} from "@/lib/sale/trang-thai-anh-lop";
import type { AnhLop } from "@/lib/sale/du-lieu-anh-lop";
import {
  deleteDraftMediaAction,
  deleteMedia,
  reviewMedia,
} from "@/app/(admin)/admin/media/actions";
import { AnhCoDuPhong } from "./anh-co-du-phong";

const NUT_ICON =
  "inline-flex size-8 items-center justify-center rounded-md border border-border " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[color:var(--primary)]/30 disabled:opacity-60";

export function ThuVienAnh({
  anh,
  duyetDuoc,
  nguoiDangXem,
}: {
  anh: AnhLop[];
  /** `media:approve` — hỏi ở server, đừng suy từ vai tại đây. */
  duyetDuoc: boolean;
  /** id người đang đăng nhập — xoá được ảnh CỦA MÌNH trong kho (server chốt lại). */
  nguoiDangXem: string;
}) {
  const router = useRouter();
  const [dang, start] = useTransition();
  // KHO ẢNH (DRAFT): mặc định thư viện GIỮ NHƯ CŨ (ẩn kho); chọn "Trong kho" để
  // quản lý nhìn ảnh giáo viên chưa gửi — XEM THÔI, không duyệt/xoá.
  const [loc, setLoc] = useState<LocThuVien>("ACTIVE");
  // Xoá ảnh khỏi KHO (2-nhịp) — khác `deleteMedia` (ảnh đã vào luồng duyệt).
  const [xacNhanXoaKho, setXacNhanXoaKho] = useState<string | null>(null);
  // QA 20/07 — xoá ảnh đã vào luồng duyệt phải qua hộp thoại xác nhận, vì câu
  // cảnh báo hậu quả ("phụ huynh cũng không còn thấy") không nói được bằng 2 nhịp.
  const [dichXoa, setDichXoa] = useState<AnhLop | null>(null);

  const hienThi = anh.filter((m) =>
    loc === "DRAFT" ? m.status === "DRAFT" : m.status !== "DRAFT",
  );

  function xoaKhoiKho(id: string) {
    if (xacNhanXoaKho !== id) {
      setXacNhanXoaKho(id);
      return;
    }
    start(async () => {
      const res = await deleteDraftMediaAction({ mediaIds: [id] });
      setXacNhanXoaKho(null);
      if (!res.ok) {
        toast.error(res.error ?? "Không xoá được ảnh");
        return;
      }
      toast.success("Đã xoá ảnh khỏi kho");
      router.refresh();
    });
  }

  function xacNhanXoa() {
    const dich = dichXoa;
    if (!dich) return;
    start(async () => {
      const res = await deleteMedia(dich.id);
      if (!res.ok) {
        toast.error(res.error ?? "Không xoá được ảnh");
        setDichXoa(null);
        return;
      }
      toast.success("Đã xoá ảnh");
      setDichXoa(null);
      router.refresh();
    });
  }

  function duyet(id: string, quyetDinh: "APPROVED" | "REJECTED") {
    start(async () => {
      await reviewMedia({ id, decision: quyetDinh });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Thư viện ({hienThi.length})
        </h2>
        <Select value={loc} onValueChange={(v) => setLoc((v as LocThuVien) ?? "ACTIVE")}>
          <SelectTrigger
            aria-label="Lọc trạng thái ảnh"
            className={cn(
              "h-8 w-auto rounded-lg border border-border bg-card text-xs",
              "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
            )}
          >
            <SelectValue>
              {(v: string | null) => NHAN_LOC_THU_VIEN[(v as LocThuVien) ?? "ACTIVE"]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">{NHAN_LOC_THU_VIEN.ACTIVE}</SelectItem>
            <SelectItem value="DRAFT">{NHAN_LOC_THU_VIEN.DRAFT}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loc === "DRAFT" && hienThi.length > 0 && (
        <p className="rounded-lg bg-state-info-soft p-2 text-xs text-state-info-ink">
          Ảnh trong kho (giáo viên / marketing / giáo vụ tải lên), CHƯA gửi phụ huynh. Giáo
          viên phụ trách lớp là người chọn ảnh gửi đi; khi gửi, ảnh vào hàng chờ duyệt.
        </p>
      )}

      {hienThi.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {loc === "DRAFT" ? "Kho trống." : "Chưa có ảnh."}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {hienThi.map((m) => (
            <div key={m.id} className="overflow-hidden rounded-lg border border-border">
              <AnhCoDuPhong
                src={m.fileUrl}
                alt={m.caption ?? `Ảnh lớp ${m.className}`}
                className="h-28 w-full object-cover"
              />
              <div className="p-2">
                <div className="flex items-start justify-between gap-1.5">
                  <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                    {m.className}
                  </span>
                  <StatusPill
                    tone={toneTrangThaiAnh(m.status)}
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {nhanTrangThaiAnh(m.status)}
                  </StatusPill>
                </div>

                {m.takenAt && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Buổi {formatDateVN(m.takenAt)}
                  </p>
                )}
                {m.caption && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {m.caption}
                  </p>
                )}
                {m.tagNames.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Tag: {m.tagNames.join(", ")}
                  </p>
                )}
                {/* Ai đưa lên — trong kho có ảnh của nhiều vai (GV/marketing/giáo vụ) */}
                {m.status === "DRAFT" && m.uploadedByName && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Tải lên: {m.uploadedByName}
                  </p>
                )}

                {m.status === "DRAFT" && (duyetDuoc || m.uploadedById === nguoiDangXem) && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      disabled={dang}
                      onClick={() => xoaKhoiKho(m.id)}
                      className="text-[11px] font-semibold text-[color:var(--state-danger-ink)] transition-colors hover:text-[color:var(--state-danger-ink-hover)] disabled:opacity-60"
                    >
                      {xacNhanXoaKho === m.id ? "Chắc chắn xoá?" : "Xoá khỏi kho"}
                    </button>
                  </div>
                )}

                {duyetDuoc && m.status !== "DRAFT" && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {m.status !== "APPROVED" && (
                      <button
                        type="button"
                        disabled={dang}
                        onClick={() => duyet(m.id, "APPROVED")}
                        aria-label="Duyệt"
                        title="Duyệt"
                        className={cn(
                          NUT_ICON,
                          "text-[color:var(--state-success-ink)] hover:bg-[color:var(--state-success-soft)]",
                        )}
                      >
                        <Check className="size-4" />
                      </button>
                    )}
                    {m.status !== "REJECTED" && (
                      <button
                        type="button"
                        disabled={dang}
                        onClick={() => duyet(m.id, "REJECTED")}
                        aria-label="Từ chối"
                        title="Từ chối"
                        className={cn(
                          NUT_ICON,
                          "text-[color:var(--state-warning-ink)] hover:bg-[color:var(--state-warning-soft)]",
                        )}
                      >
                        <X className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={dang}
                      onClick={() => setDichXoa(m)}
                      aria-label="Xoá"
                      title="Xoá"
                      className={cn(
                        NUT_ICON,
                        "text-[color:var(--state-danger-ink)] hover:bg-[color:var(--state-danger-soft)]",
                      )}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={dichXoa !== null}
        onOpenChange={(o) => {
          if (!o) setDichXoa(null);
        }}
        pending={dang}
        title="Xoá ảnh này?"
        description={
          dichXoa ? (
            <>
              Ảnh của lớp <strong>{dichXoa.className}</strong>
              {dichXoa.caption ? ` — "${dichXoa.caption}"` : ""} sẽ bị xoá vĩnh viễn (phụ
              huynh cũng không còn thấy). Hành động không thể hoàn tác.
            </>
          ) : undefined
        }
        confirmLabel="Xoá ảnh"
        onConfirm={xacNhanXoa}
      />
    </div>
  );
}
