"use client";

// Cụm nút trên một dòng "ứng dụng kết nối". Mỗi nút chỉ vẽ khi CẢ quyền LẪN trạng thái cho
// phép — khớp đúng cổng của Server Action và điều kiện WHERE ở `lib/agents/quan-tri/client.ts`
// (luật 12: nút hiện ra mà bấm là bị từ chối là lời hứa suông).
//
//   Sinh/Xoay mật khẩu : manage             · ACTIVE · chưa hết hạn · mã 2FA
//   Khoá ngay          : manage | approve   · ACTIVE                · lý do
//   Mở khoá            : approve            · SUSPENDED · chưa hết hạn · lý do + mã 2FA
//   Thu hồi            : manage | approve   · PENDING/ACTIVE/SUSPENDED · lý do, bấm hai lần
import { useState } from "react";
import { Copy, ShieldAlert } from "lucide-react";
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
import {
  khoaClientAction,
  moKhoaClientAction,
  sinhMatKhauAction,
  thuHoiClientAction,
} from "../_actions";
import { conThuHoiDuoc, ngayGio, type TrangThaiAgent } from "./dinh-dang";
import { HopThoaiThaoTac } from "./hop-thoai-thao-tac";

type MatKhauMoi = { matKhau: string; hetHan: string };

export function NutClient({
  id,
  ten,
  trangThai,
  daHetHan,
  dungMoiTruong,
  coMatKhau,
  coQuanLy,
  coDuyet,
  chanMa,
}: {
  id: string;
  ten: string;
  trangThai: TrangThaiAgent;
  daHetHan: boolean;
  /** Client thuộc môi trường đang chạy? Khác môi trường thì server từ chối sinh khoá. */
  dungMoiTruong: boolean;
  /** Đang có mật khẩu còn sống ⇒ nút đọc là "Xoay" thay vì "Sinh". */
  coMatKhau: boolean;
  coQuanLy: boolean;
  coDuyet: boolean;
  chanMa: string | null;
}) {
  // Bản rõ CHỈ sống trong state của hộp thoại hiện mật khẩu — đóng hộp là xoá. Không
  // localStorage, không sessionStorage, không log.
  const [matKhauMoi, setMatKhauMoi] = useState<MatKhauMoi | null>(null);

  const sinhDuoc = coQuanLy && trangThai === "ACTIVE" && !daHetHan && dungMoiTruong;
  const khoaDuoc = (coQuanLy || coDuyet) && trangThai === "ACTIVE";
  const moKhoaDuoc = coDuyet && trangThai === "SUSPENDED" && !daHetHan;
  const thuHoiDuoc = (coQuanLy || coDuyet) && conThuHoiDuoc(trangThai);

  if (!sinhDuoc && !khoaDuoc && !moKhoaDuoc && !thuHoiDuoc) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  async function saoChep(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      toast.success("Đã sao chép mật khẩu");
    } catch {
      toast.error("Trình duyệt chặn sao chép — bôi đen rồi sao chép tay.");
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {sinhDuoc && (
        <HopThoaiThaoTac
          nhanNut={coMatKhau ? "Xoay mật khẩu" : "Sinh mật khẩu"}
          tieuDe={coMatKhau ? `Xoay mật khẩu — ${ten}` : `Sinh mật khẩu — ${ten}`}
          moTa={
            coMatKhau
              ? "Tạo mật khẩu mới. Mật khẩu cũ còn dùng được tối đa 24 giờ để agent kịp đổi, sau đó hết hiệu lực."
              : "Mật khẩu chỉ hiện ĐÚNG MỘT LẦN ngay sau khi sinh. Chuẩn bị sẵn két bí mật để lưu."
          }
          canMa
          chanVi={chanMa}
          nhanXacNhan={coMatKhau ? "Xoay mật khẩu" : "Sinh mật khẩu"}
          thongBaoXong={coMatKhau ? "Đã xoay mật khẩu" : "Đã sinh mật khẩu"}
          thucHien={async (v) => {
            const kq = await sinhMatKhauAction({ id, maXacThuc: v.ma });
            if (kq.ok) setMatKhauMoi(kq.data);
            return kq;
          }}
        />
      )}
      {khoaDuoc && (
        <HopThoaiThaoTac
          nhanNut="Khoá ngay"
          bienThe="destructive"
          tieuDe={`Khoá ngay — ${ten}`}
          moTa="Chặn ứng dụng ngay lập tức và huỷ mọi phiên đang mở. Mở lại cần người duyệt."
          canLyDo
          nhanXacNhan="Khoá"
          nguyHiem
          thongBaoXong="Đã khoá ứng dụng"
          thucHien={(v) => khoaClientAction({ id, lyDo: v.lyDo })}
        />
      )}
      {moKhoaDuoc && (
        <HopThoaiThaoTac
          nhanNut="Mở khoá"
          tieuDe={`Mở khoá — ${ten}`}
          moTa="Ứng dụng hoạt động lại với các quyền đang còn hiệu lực. Cần lý do và mã xác thực 2 lớp."
          canLyDo
          canMa
          chanVi={chanMa}
          nhanXacNhan="Mở khoá"
          thongBaoXong="Đã mở khoá ứng dụng"
          thucHien={(v) => moKhoaClientAction({ id, lyDo: v.lyDo, maXacThuc: v.ma })}
        />
      )}
      {thuHoiDuoc && (
        <HopThoaiThaoTac
          nhanNut="Thu hồi"
          bienThe="outline"
          tieuDe={`Thu hồi vĩnh viễn — ${ten}`}
          moTa="Huỷ ngay mọi phiên, mật khẩu, quyền cấp và vai của ứng dụng. KHÔNG mở lại được — muốn dùng tiếp phải tạo ứng dụng mới và duyệt lại."
          canLyDo
          haiBuoc
          nhanXacNhan="Thu hồi"
          nguyHiem
          thongBaoXong="Đã thu hồi ứng dụng"
          thucHien={(v) => thuHoiClientAction({ id, lyDo: v.lyDo })}
        />
      )}

      <Dialog
        open={matKhauMoi !== null}
        onOpenChange={(o) => {
          if (!o) setMatKhauMoi(null);
        }}
        // Bấm ra ngoài lỡ tay là mất mật khẩu vĩnh viễn ⇒ chỉ đóng bằng nút.
        disablePointerDismissal
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Mật khẩu mới — {ten}</DialogTitle>
            <DialogDescription>
              Hết hạn: {ngayGio(matKhauMoi?.hetHan ?? null)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mã client đi kèm để người nhận có ĐỦ cặp thông tin xác thực trong một chỗ. */}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Mã client (client_id)</p>
              <code className="block select-all break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {id}
              </code>
            </div>
            <p className="-mb-2 text-xs font-medium text-muted-foreground">Mật khẩu client (client_secret)</p>
            <code className="block select-all break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
              {matKhauMoi?.matKhau}
            </code>
            <p className="flex items-start gap-2 rounded-lg bg-state-danger-soft px-3 py-2 text-sm font-semibold text-state-danger-ink">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Không xem lại được — lưu vào két bí mật, KHÔNG gửi qua Zalo/email.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => matKhauMoi && void saoChep(matKhauMoi.matKhau)}
            >
              <Copy aria-hidden />
              Sao chép
            </Button>
            <Button type="button" onClick={() => setMatKhauMoi(null)}>
              Tôi đã lưu — đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
