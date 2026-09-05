"use client";

/**
 * Site Sale — bảng "Việc chăm sóc học viên".
 *
 * ── BẢN ĐÔI CỦA khối danh sách trong `app/(admin)/admin/cham-soc-hv/page.tsx` ──
 * Chốt 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng một
 * pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: đúng bốn mẩu tin của mỗi việc — tiêu đề việc, tên
 * học viên (có liên kết), hạn xử lý, cờ "(quá hạn)" — và đúng một nút "Hoàn tất".
 *
 * ── VÌ SAO ĐỔI TỪ DANH SÁCH THẺ SANG BẢNG ───────────────────────────────────
 * Bản admin là `<ul>` thẻ xếp dọc: mỗi việc một khối `rounded-xl border p-4`, tên
 * học viên và hạn dồn vào MỘT dòng chữ nhỏ ngăn nhau bằng dấu chấm giữa
 * (`Nguyễn Minh Khôi · hạn 26/09/2026 (quá hạn)`). Với một hàng đợi việc thì đó
 * là hình thức sai: người trực quét theo CỘT ("còn việc nào quá hạn?"), mà thẻ
 * thì không có cột — mỗi dòng dấu chấm rơi vào một vị trí khác nhau.
 * Bảng `.bang-sale` cho đúng ba cột để quét dọc, và kéo theo miễn phí mọi thứ
 * hàng đợi cần: mật độ 44px/dòng, vệt di chuột, vùng chạm ≥44px trên điện thoại.
 *
 * ⚠️ Và bảng thì BẮT BUỘC có phân trang (`components/ui/bang-coverage.test.ts`).
 *    Bản admin `take: 200` nhưng đổ hết ra một trang — người có 60 việc phải cuộn
 *    hết mới thấy cái cuối. `<PhanTrangBang>` cắt ở tầng hiển thị, không đụng
 *    truy vấn.
 *
 * ⚠️ LIÊN KẾT `/students/{id}/edit` LÀ **NỢ ĐÃ BIẾT** — 404 trên host Sale.
 *    Đó là CLEAN URL của host quản trị; trên `sale.satarobo.vn` luật cuối của
 *    nhánh Sale là `rewrite "/sale" + pathname` (`lib/auth/route-policy.ts`) ⇒
 *    `/sale/students/{id}/edit` — không có route nào. KHÔNG chạy qua `duongSale()`:
 *    hàm đó không ánh xạ đường này (nó nằm đúng trong danh sách "NỢ ĐÃ BIẾT" ở
 *    cuối `lib/sale/duong-dan-sale.ts`), gọi vào chỉ trả về y nguyên. Giữ nguyên
 *    là CỐ Ý — bản mount trước đây hỏng y hệt; lối ra đúng là dựng
 *    `/sale/hoc-vien/[id]`, tức việc THÊM MÀN, phải hỏi chủ dự án.
 */
import Link from "next/link";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import type { DongChamSoc } from "@/lib/sale/cham-soc-hv";
import { NutHoanTatChamSoc } from "./nut-hoan-tat";

export function BangChamSoc({
  dong,
  coQuyenHoanTat,
}: {
  dong: DongChamSoc[];
  /** Xem mục "cổng rộng hơn màn" ở `page.tsx` — nút chỉ vẽ khi bấm được thật. */
  coQuyenHoanTat: boolean;
}) {
  return (
    <PhanTrangBang tenDonVi="việc" khoaGhiNho="sale-cham-soc-hv" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Việc cần làm</th>
            <th scope="col">Học viên</th>
            <th scope="col" className="o-so">
              Hạn xử lý
            </th>
            <th scope="col" className="o-so">
              <span className="sr-only">Hành động</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {dong.map((v) => (
            <tr key={v.id}>
              {/* Cột duy nhất được xuống dòng: tiêu đề việc do người tạo gõ tự do
                  nên dài ngắn tuỳ lúc. `o-dai` kèm sẵn trần bề rộng. */}
              <td className="o-dai font-medium text-foreground">{v.tieuDe}</td>

              <td>
                <Link
                  href={`/students/${v.studentId}/edit`}
                  className="text-[color:var(--primary-ink)] hover:underline"
                >
                  {v.tenHocVien}
                </Link>
              </td>

              <td className="o-so">
                <span className={v.quaHan ? "text-[color:var(--state-danger)]" : "text-foreground"}>
                  {v.hanXuLy}
                </span>
                {v.quaHan && (
                  <span className="block text-xs font-semibold text-[color:var(--state-danger)]">
                    quá hạn
                  </span>
                )}
              </td>

              <td className="o-so">
                {coQuyenHoanTat ? (
                  <NutHoanTatChamSoc id={v.id} />
                ) : (
                  <span className="text-xs text-muted-foreground">chỉ xem</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
