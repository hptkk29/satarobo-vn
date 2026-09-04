/**
 * Site Sale — bảng "Yêu cầu đang chờ" của màn chuyển lớp.
 *
 * ── BẢN ĐÔI CỦA khối `<table>` trong `app/(admin)/admin/chuyen-lop/page.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%: năm cột đúng thứ tự đúng nhãn (Học viên · Trạng thái · Lý do ·
 * Ngày · Thao tác), hai nhãn trạng thái "Chờ chỗ" / "Chờ duyệt", dấu "—" khi
 * không có lý do, và câu rỗng "Không có yêu cầu."
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô → `.bang-sale` của `sale.css`.
 * 2. `<span className={... bg-state-warning-soft ...}>` gõ tay → `<StatusPill>`.
 *    Cột "Trạng thái" ở đây có nghĩa thật: "Chờ chỗ" (warning) là việc đang KẸT
 *    chờ lớp trống, "Chờ duyệt" (info) là việc đang chạy đúng luồng.
 * 3. Cột "Lý do" là cột DÀI duy nhất → class `o-dai` (cho xuống dòng + trần bề
 *    rộng 22rem). Không có nó thì một lý do dài kéo giãn cả bảng; để `nowrap`
 *    thì nó bị cắt cụt đúng chỗ người duyệt cần đọc.
 */
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import type { DongYeuCauChuyen } from "@/lib/sale/chuyen-lop";
import { ThaoTacYeuCau } from "./thao-tac-yeu-cau";

export function BangYeuCauChuyen({
  dong,
  canDuyet,
}: {
  dong: DongYeuCauChuyen[];
  canDuyet: boolean;
}) {
  if (dong.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">Không có yêu cầu.</p>;
  }

  return (
    <PhanTrangBang tenDonVi="yêu cầu" khoaGhiNho="sale-chuyen-lop" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Học viên</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Lý do</th>
            <th scope="col" className="o-so">
              Ngày
            </th>
            <th scope="col">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {dong.map((d) => (
            <tr key={d.id}>
              <td className="font-medium text-foreground">{d.hocVien}</td>
              <td>
                <StatusPill tone={d.trangThai === "WAITLISTED" ? "warning" : "info"}>
                  {d.trangThai === "WAITLISTED" ? "Chờ chỗ" : "Chờ duyệt"}
                </StatusPill>
              </td>
              <td className="o-dai text-muted-foreground">{d.lyDo ?? "—"}</td>
              <td className="o-so text-muted-foreground">{d.ngay}</td>
              <td>
                <ThaoTacYeuCau id={d.id} coLopDich={d.coLopDich} canDuyet={canDuyet} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
