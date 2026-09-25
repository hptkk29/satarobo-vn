"use client";

// Hộp thoại dùng chung cho MỌI thao tác một-đối-tượng của màn Cổng dữ liệu agent: khoá, mở
// khoá, thu hồi, duyệt/từ chối, bật/tắt cổng, đặt lại 2FA, sinh mật khẩu.
//
// Mỗi thao tác khai nó cần gì (lý do / ghi chú / mã 2FA / xác nhận hai lần) — khớp đúng khuôn
// zod của action tương ứng ở `lib/validators/agent-gateway.ts`, để nút "Xác nhận" chỉ sáng khi
// đầu vào chắc chắn qua được cổng khuôn của server.
//
// ⚠️ `router.refresh()` KHÔNG reset ô nhập của component client — sau khi thành công phải tự
// xoá state (bẫy đã dính ở repo này: ô đứng im ở giá trị cũ).
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { KetQuaAction } from "./dinh-dang";

export type GiaTriThaoTac = { lyDo: string; ghiChu: string; ma: string };

const LY_DO_TOI_THIEU = 10;

export function HopThoaiThaoTac({
  nhanNut,
  bienThe = "outline",
  tieuDe,
  moTa,
  canLyDo = false,
  nhanLyDo = "Lý do",
  canGhiChu = false,
  canMa = false,
  haiBuoc = false,
  nhanXacNhan,
  nguyHiem = false,
  chanVi,
  thongBaoXong,
  thucHien,
}: {
  nhanNut: string;
  bienThe?: "default" | "destructive" | "outline" | "secondary";
  tieuDe: string;
  moTa?: ReactNode;
  /** Lý do BẮT BUỘC (≥ 10 ký tự) — khuôn `lyDo` của validator. */
  canLyDo?: boolean;
  nhanLyDo?: string;
  /** Ghi chú TUỲ CHỌN (≤ 500 ký tự) — dùng cho duyệt/từ chối. */
  canGhiChu?: boolean;
  /** Mã xác thực 2 lớp 6 số. */
  canMa?: boolean;
  /** Bấm "Xác nhận" hai lần — cho thao tác không hoàn tác được (thu hồi). */
  haiBuoc?: boolean;
  nhanXacNhan: string;
  nguyHiem?: boolean;
  /**
   * Khác null ⇒ nút mở hộp bị vô hiệu, câu này hiện khi rê chuột. Dùng khi biết CHẮC action sẽ
   * từ chối (vd chưa bật 2FA mà thao tác cần mã) — nút sáng mà bấm là bị từ chối là lời hứa suông.
   */
  chanVi?: string | null;
  thongBaoXong: string;
  thucHien: (v: GiaTriThaoTac) => Promise<KetQuaAction>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [ma, setMa] = useState("");
  const [daBamMotLan, setDaBamMotLan] = useState(false);

  function xoaForm() {
    setLyDo("");
    setGhiChu("");
    setMa("");
    setDaBamMotLan(false);
  }

  function doiMo(o: boolean) {
    if (pending) return;
    setMo(o);
    if (!o) xoaForm();
  }

  const lyDoHopLe = !canLyDo || lyDo.trim().length >= LY_DO_TOI_THIEU;
  const maHopLe = !canMa || /^\d{6}$/.test(ma.trim());
  const ghiChuHopLe = !canGhiChu || ghiChu.trim().length <= 500;
  const duDieuKien = lyDoHopLe && maHopLe && ghiChuHopLe;

  function xacNhan() {
    if (!duDieuKien) return;
    if (haiBuoc && !daBamMotLan) {
      setDaBamMotLan(true);
      return;
    }
    startTransition(async () => {
      const kq = await thucHien({ lyDo: lyDo.trim(), ghiChu: ghiChu.trim(), ma: ma.trim() });
      if (kq.ok) {
        toast.success(thongBaoXong);
        xoaForm();
        setMo(false);
        router.refresh();
      } else {
        toast.error(kq.error);
        // Mã TOTP đã dùng (hoặc sai) thì không dùng lại được — xoá để người dùng gõ mã mới.
        setMa("");
        setDaBamMotLan(false);
      }
    });
  }

  const nut = (
    <Button
      type="button"
      size="sm"
      variant={bienThe}
      disabled={!!chanVi}
      onClick={() => doiMo(true)}
    >
      {nhanNut}
    </Button>
  );

  return (
    <>
      {chanVi ? (
        // Nút `disabled` nuốt sự kiện chuột (`pointer-events-none`) ⇒ `title` phải nằm ở vỏ.
        <span title={chanVi} className="inline-flex cursor-not-allowed">
          {nut}
        </span>
      ) : (
        nut
      )}
      <Dialog open={mo} onOpenChange={(o) => doiMo(o)}>
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>{tieuDe}</DialogTitle>
            {moTa && <DialogDescription>{moTa}</DialogDescription>}
          </DialogHeader>

          <div className="space-y-3">
            {canLyDo && (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-foreground">
                  {nhanLyDo} <span className="text-state-danger-ink">*</span>
                </span>
                <Textarea
                  value={lyDo}
                  onChange={(e) => {
                    setLyDo(e.target.value);
                    setDaBamMotLan(false);
                  }}
                  rows={3}
                  maxLength={500}
                  disabled={pending}
                  placeholder="Ghi rõ vì sao — người đọc nhật ký sau này cần hiểu được."
                />
                <span
                  className={`mt-1 block text-xs ${lyDoHopLe ? "text-muted-foreground" : "text-state-warning-ink"}`}
                >
                  Tối thiểu {LY_DO_TOI_THIEU} ký tự · đang có {lyDo.trim().length}
                </span>
              </label>
            )}

            {canGhiChu && (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-foreground">Ghi chú (tuỳ chọn)</span>
                <Textarea
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  rows={2}
                  maxLength={500}
                  disabled={pending}
                />
              </label>
            )}

            {canMa && (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-foreground">
                  Mã xác thực 2 lớp <span className="text-state-danger-ink">*</span>
                </span>
                <Input
                  value={ma}
                  onChange={(e) => setMa(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 chữ số trong ứng dụng xác thực"
                  disabled={pending}
                  className="max-w-[14rem] font-mono tracking-widest"
                />
              </label>
            )}

            {haiBuoc && daBamMotLan && (
              <p className="rounded-lg bg-state-danger-soft px-3 py-2 text-sm font-semibold text-state-danger-ink">
                Thao tác này KHÔNG hoàn tác được. Bấm lần nữa để xác nhận.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => doiMo(false)} disabled={pending}>
              Huỷ
            </Button>
            <Button
              type="button"
              variant={nguyHiem ? "destructive" : "default"}
              onClick={xacNhan}
              disabled={pending || !duDieuKien}
            >
              {pending && <Loader2 className="animate-spin" />}
              {haiBuoc && daBamMotLan ? `Xác nhận ${nhanXacNhan.toLowerCase()}` : nhanXacNhan}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
