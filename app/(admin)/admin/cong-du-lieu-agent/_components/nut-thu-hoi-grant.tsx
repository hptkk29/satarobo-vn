"use client";

// Thu hồi MỘT quyền cấp — có hiệu lực ở lượt gọi kế tiếp, kể cả với phiên đang mở.
// Cổng: `manage` HOẶC `approve`, lý do, không đòi mã (thao tác thu hẹp quyền = phanh).
import { thuHoiGrantAction } from "../_actions";
import { HopThoaiThaoTac } from "./hop-thoai-thao-tac";

export function NutThuHoiGrant({ id, congCu, tenClient }: { id: string; congCu: string; tenClient: string }) {
  return (
    <HopThoaiThaoTac
      nhanNut="Thu hồi"
      tieuDe={`Thu hồi quyền ${congCu}`}
      moTa={`Ứng dụng “${tenClient}” mất quyền gọi công cụ này ngay ở lượt gọi kế tiếp. Không mở lại được — cần thì cấp quyền mới và duyệt lại.`}
      canLyDo
      haiBuoc
      nhanXacNhan="Thu hồi"
      nguyHiem
      thongBaoXong="Đã thu hồi quyền"
      thucHien={(v) => thuHoiGrantAction({ id, lyDo: v.lyDo })}
    />
  );
}
