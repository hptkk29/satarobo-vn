"use client";

// Đặt lại 2FA của NGƯỜI KHÁC (mất điện thoại). Người duyệt, lý do + mã 2FA của CHÍNH mình.
// Page không vẽ nút này ở dòng của chính người xem (server cũng chặn tự đặt lại).
import { datLaiHaiLopAction } from "../_actions";
import { HopThoaiThaoTac } from "./hop-thoai-thao-tac";

export function NutDatLaiHaiLop({ userId, ten, chanMa }: { userId: string; ten: string; chanMa: string | null }) {
  return (
    <HopThoaiThaoTac
      nhanNut="Đặt lại"
      tieuDe={`Đặt lại xác thực 2 lớp — ${ten}`}
      moTa="Xoá cấu hình xác thực 2 lớp hiện tại của người này. Họ phải cài lại từ đầu trước khi làm được thao tác cấp quyền. Cần lý do và mã xác thực của BẠN."
      canLyDo
      canMa
      chanVi={chanMa}
      nhanXacNhan="Đặt lại"
      nguyHiem
      thongBaoXong="Đã đặt lại xác thực 2 lớp"
      thucHien={(v) => datLaiHaiLopAction({ userId, lyDo: v.lyDo, maXacThuc: v.ma })}
    />
  );
}
