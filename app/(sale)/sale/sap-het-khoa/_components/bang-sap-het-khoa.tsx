/**
 * Site Sale — bảng "Sắp hết khoá".
 *
 * ── BẢN ĐÔI CỦA khối `<table>` trong `app/(admin)/admin/students/sap-het-khoa/page.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%: sáu cột đúng thứ tự đúng nhãn (Học viên · Lớp / Khoá · Cơ sở ·
 * Còn lại · Dự kiến kết thúc · cột hành động không tiêu đề), hai hành động trên
 * dòng ("Tái tục" · "Hồ sơ →"), nhãn `{còn}/{tổng} buổi`, ngưỡng đỏ ở ≤ 2 buổi,
 * và câu rỗng "Chưa có học viên nào sắp hết khoá."
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô → `.bang-sale` của `sale.css` (dòng 44px, `nowrap` cả
 *    `th` lẫn `td`).
 * 2. `<span className={... bg-state-danger-soft ...}>` gõ tay → `<StatusPill>`.
 *    Cột "Còn lại" là chỗ màu THẬT SỰ có nghĩa: đỏ = gọi hôm nay, vàng = gọi
 *    trong tuần. Không cột nào khác được tô — tô cả bảng là làm màu mất nghĩa.
 * 3. Cột "Còn lại" và "Dự kiến kết thúc" dùng `o-so` → chữ số đều bề ngang, quét
 *    dọc thẳng hàng. Đây là màn người ta ĐỌC THEO CỘT ("ai sắp hết trước"), nên
 *    canh cột quan trọng hơn ở đây so với các màn khác.
 *
 * Server component: không có state nào, và `PhanTrangBang` nhận được cây con đã
 * dựng sẵn — đúng cách bản admin đang làm.
 */
import Link from "next/link";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { formatDateVN } from "@/lib/format/date";
import type { DongSapHetKhoa } from "@/lib/sale/sap-het-khoa";

/**
 * ⚠️ NỢ ĐÃ BIẾT — HAI ĐÍCH NÀY CHƯA CÓ TRÊN HOST SALE.
 *
 * Bản admin trỏ `/enrollments/new?...` và `/students/{id}/edit`. Đó là clean URL
 * của host quản trị; trên `sale.satarobo.vn` luật cuối của nhánh Sale là
 * `rewrite "/sale" + pathname` ⇒ `/sale/enrollments/new` và
 * `/sale/students/{id}/edit` → **404**. `/sale/dang-ky-hoc` và `/sale/hoc-vien`
 * chỉ có DANH SÁCH, không có màn tạo/hồ sơ, nên trỏ sang là đổi một liên kết 404
 * lấy một liên kết sai đích — khó lần ra hơn, không dễ hơn. Giữ nguyên đường cũ
 * là không tạo hồi quy (bản mount trước đợt này hỏng y hệt), KHÔNG phải là đúng.
 * Vá thật = dựng `/sale/dang-ky-hoc/moi` + `/sale/hoc-vien/[id]`; đó là việc THÊM
 * MÀN, đã báo lại cho chủ dự án.
 */
const duongTaiTuc = (maHocVien: string, maGhiDanh: string) =>
  `/enrollments/new?studentId=${maHocVien}&renewedFrom=${maGhiDanh}`;
const duongHoSo = (maHocVien: string) => `/students/${maHocVien}/edit`;

export function BangSapHetKhoa({ dong }: { dong: DongSapHetKhoa[] }) {
  if (dong.length === 0) {
    return (
      <KhungDuLieu.Rong
        ten="Chưa có học viên nào sắp hết khoá."
        mo="Danh sách này tự hiện khi một học viên còn ≤ 5 buổi của khoá đang học."
      />
    );
  }

  return (
    <PhanTrangBang tenDonVi="học viên" khoaGhiNho="sale-sap-het-khoa" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Học viên</th>
            <th scope="col">Lớp / Khoá</th>
            <th scope="col">Cơ sở</th>
            <th scope="col" className="o-so">
              Còn lại
            </th>
            <th scope="col" className="o-so">
              Dự kiến kết thúc
            </th>
            <th scope="col" className="o-so">
              <span className="sr-only">Hành động</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {dong.map((d) => (
            <tr key={d.enrollmentId}>
              <td className="font-medium text-foreground">{d.studentName}</td>

              <td>
                <span className="block text-foreground">{d.className}</span>
                <span className="block text-xs text-muted-foreground">{d.courseName}</span>
              </td>

              <td className="text-muted-foreground">{d.centerName ?? "—"}</td>

              <td className="o-so">
                {/* ≤ 2 buổi = gọi HÔM NAY (danger); 3–5 buổi = gọi trong tuần
                    (warning). Cùng ngưỡng bản admin đang dùng. */}
                <StatusPill tone={d.remaining <= 2 ? "danger" : "warning"}>
                  {d.remaining}/{d.total} buổi
                </StatusPill>
              </td>

              <td className="o-so text-foreground">
                {d.expectedEndDate ? formatDateVN(new Date(d.expectedEndDate)) : "—"}
              </td>

              <td className="o-so">
                <span className="inline-flex items-center justify-end gap-2">
                  <Link
                    href={duongTaiTuc(d.studentId, d.enrollmentId)}
                    // BGĐ 31/07 — TÁI TỤC: pre-fill form ghi danh + nối khoá trước.
                    className="inline-flex h-8 items-center rounded-lg bg-[color:var(--primary)] px-2.5 text-xs font-semibold text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40"
                  >
                    Tái tục
                  </Link>
                  <Link
                    href={duongHoSo(d.studentId)}
                    className="text-xs font-semibold text-[color:var(--primary-ink)] underline-offset-2 hover:underline"
                  >
                    Hồ sơ →
                  </Link>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
