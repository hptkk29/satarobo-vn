"use client";

// Duyệt / Từ chối MỘT mục đang chờ (ứng dụng hoặc quyền). Cần `approve` + mã 2FA; ghi chú tuỳ
// chọn. Page KHÔNG vẽ cụm này cho người đã tạo chính mục đó (server cũng chặn: TU_DUYET).
import { quyetDinhClientAction, quyetDinhGrantAction } from "../_actions";
import { HopThoaiThaoTac } from "./hop-thoai-thao-tac";

export function NutQuyetDinh({
  loai,
  id,
  ten,
  lyDoKhongDuyet,
  chanMa,
}: {
  loai: "client" | "grant";
  id: string;
  ten: string;
  /**
   * Khác null ⇒ server chắc chắn từ chối DUYỆT (đã quá hạn, ứng dụng cha đã thu hồi…) — nút
   * Duyệt không vẽ, chỉ còn Từ chối, và câu này giải thích vì sao.
   */
  lyDoKhongDuyet: string | null;
  chanMa: string | null;
}) {
  const goi = loai === "client" ? quyetDinhClientAction : quyetDinhGrantAction;
  const doiTuong = loai === "client" ? "ứng dụng" : "quyền";

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-1.5">
        {lyDoKhongDuyet === null && (
          <HopThoaiThaoTac
            nhanNut="Duyệt"
            bienThe="default"
            tieuDe={`Duyệt ${doiTuong} — ${ten}`}
            moTa={
              loai === "client"
                ? "Ứng dụng chuyển sang Hoạt động. Sau đó người quản lý mới sinh được mật khẩu cho nó."
                : "Quyền có hiệu lực ngay — agent gọi được công cụ này ở lượt kế tiếp."
            }
            canGhiChu
            canMa
            chanVi={chanMa}
            nhanXacNhan="Duyệt"
            thongBaoXong={`Đã duyệt ${doiTuong}`}
            thucHien={(v) => goi({ id, dongY: true, ghiChu: v.ghiChu || undefined, maXacThuc: v.ma })}
          />
        )}
        <HopThoaiThaoTac
          nhanNut="Từ chối"
          bienThe="outline"
          tieuDe={`Từ chối ${doiTuong} — ${ten}`}
          moTa="Từ chối là trạng thái cuối — muốn làm lại phải tạo mục mới."
          canGhiChu
          canMa
          chanVi={chanMa}
          nhanXacNhan="Từ chối"
          nguyHiem
          thongBaoXong={`Đã từ chối ${doiTuong}`}
          thucHien={(v) => goi({ id, dongY: false, ghiChu: v.ghiChu || undefined, maXacThuc: v.ma })}
        />
      </div>
      {lyDoKhongDuyet && <p className="text-xs text-state-warning-ink">{lyDoKhongDuyet}</p>}
    </div>
  );
}
