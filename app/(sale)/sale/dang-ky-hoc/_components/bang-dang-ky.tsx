"use client";

/**
 * Site Sale — bảng "Đăng ký học".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/enrollments/page.tsx` (khối `<table>`) ────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%: năm cột, đúng thứ tự, đúng nhãn — Học viên · Lớp / Cơ sở ·
 * Trạng thái · Ngày đăng ký · Hành động; và ba hành động trên dòng (Nhắn riêng ·
 * Sửa · Xoá) với đúng câu chữ cũ.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô (`px-4 py-3 text-xs uppercase…`) → `.bang-sale` của
 *    `sale.css`. Mật độ nằm ở CSS thì bảng MỚI tự đúng; nằm trong từng ô thì
 *    phải nhớ chép. Kèm theo đó là `white-space: nowrap` trên CẢ `th` VÀ `td` —
 *    thứ duy nhất chặn chiều cao dòng nhảy loạn (đo ở admin: 65–71px, không đều).
 * 2. Nhãn trạng thái: `<span>` gõ tay chuỗi màu → `<StatusPill tone={…}>` theo
 *    thang ngữ nghĩa (`lib/sale/trang-thai-dang-ky.ts`). Bài kiểm
 *    `lib/sale/ky-luat-mau.test.ts` canh đúng chỗ này.
 * 3. Ảnh đại diện 36px → 28px. `.bang-sale` nhắm dòng 44px; một ảnh 36px cộng
 *    22px đệm là 58px, tức chính cái ảnh quyết định mật độ cả bảng. Ảnh vẫn còn
 *    (nó là NỘI DUNG), chỉ thôi làm chủ chiều cao dòng.
 * 4. Cột "Ngày đăng ký" và cột hành động dùng `o-so` → canh phải + chữ số đều
 *    bề ngang, cột thẳng hàng khi quét dọc.
 *
 * ⚠️ MÀU: chỉ cột "Trạng thái" được tô, và tô qua thang ngữ nghĩa. Không tô độ
 *    cũ của ngày đăng ký, không tô tên học viên. `khach-cua-toi/_components/
 *    lead-table.tsx` đã trả giá hai lần cho bài học "tô cả một cột là làm màu
 *    mất nghĩa" — không lặp lại ở đây.
 */
import Link from "next/link";
import { Pencil } from "lucide-react";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { OpenDmButton } from "@/components/chat/open-dm-button";
import { formatDateVN } from "@/lib/format/date";
import {
  NHAN_TRANG_THAI_DANG_KY,
  toneTrangThaiDangKy,
} from "@/lib/sale/trang-thai-dang-ky";
import type { DongDangKyHoc } from "@/lib/sale/dang-ky-hoc";
import { NutXoaDangKy } from "./nut-xoa";

/**
 * ⚠️ ĐƯỜNG TẠO / SỬA ĐĂNG KÝ CHƯA CÓ TRÊN HOST SALE — nợ mang theo từ bản mount.
 *
 * Bản admin trỏ thẳng `/enrollments/new` và `/enrollments/{id}/edit`. Đó là
 * CLEAN URL của host quản trị: `decideRoute` trên `admin.satarobo.vn` viết lại
 * chúng thành `/admin/enrollments/...`. Trên `sale.satarobo.vn` thì luật cuối
 * của nhánh Sale là `rewrite "/sale" + pathname` (lib/auth/route-policy.ts) ⇒
 * `/enrollments/new` thành `/sale/enrollments/new` — **404**. Trỏ sang host
 * admin cũng không cứu được: Sale THUẦN bước vào host admin là bị đá ngược về
 * host Sale.
 *
 * Giữ nguyên đường dẫn cũ ở đây là CỐ Ý: đổi nó sang một địa chỉ khác chỉ là
 * dời chỗ vỡ. Lối ra đúng là dựng `/sale/dang-ky-hoc/moi` và
 * `/sale/dang-ky-hoc/[id]/sua` (dùng lại cổng `PAGE_GATES["/sale/dang-ky-hoc"]`,
 * không cần khai khoá mới) — nằm ngoài phạm vi đợt tách hai màn này, đã báo lại
 * cho chủ dự án.
 */
const DUONG_TAO_MOI = "/enrollments/new";
const duongSua = (id: string) => `/enrollments/${id}/edit`;

export function BangDangKyHoc({
  dong,
  coQuyenXoa,
}: {
  dong: DongDangKyHoc[];
  coQuyenXoa: boolean;
}) {
  if (dong.length === 0) {
    // `operate.md`: màn rỗng phải DẠY giao diện, không chỉ nói "không có gì" —
    // nên nó mang theo lối đi tiếp, đúng như dòng rỗng của bản admin.
    return (
      <KhungDuLieu.Rong
        ten="Chưa có đăng ký nào khớp bộ lọc"
        hanhDong={
          <Link
            href={DUONG_TAO_MOI}
            className="text-sm font-medium text-[color:var(--primary-ink)] underline-offset-2 hover:underline"
          >
            Tạo đăng ký mới →
          </Link>
        }
      />
    );
  }

  return (
    <PhanTrangBang tenDonVi="đăng ký" khoaGhiNho="sale-dang-ky-hoc" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Học viên</th>
            <th scope="col">Lớp / Cơ sở</th>
            <th scope="col">Trạng thái</th>
            <th scope="col" className="o-so">
              Ngày đăng ký
            </th>
            <th scope="col" className="o-so">
              Hành động
            </th>
          </tr>
        </thead>
        <tbody>
          {dong.map((d) => (
            <tr key={d.id}>
              <td>
                <div className="flex items-center gap-2.5">
                  {d.hocVien.anh ? (
                    // `<img>` chứ không `next/image`: ảnh đại diện 28px trong ô
                    // bảng, nguồn R2 tuỳ ý, không đáng một vòng tối ưu ảnh. Bản
                    // admin cũng vậy. (Repo không cài plugin ESLint của Next nên
                    // KHÔNG viết `eslint-disable no-img-element` ở đây — chỉ thị
                    // vô chủ là một lỗi lint khác.)
                    <img
                      src={d.hocVien.anh}
                      alt=""
                      className="size-7 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                    >
                      {d.hocVien.ten.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{d.hocVien.ten}</span>
                    {d.hocVien.sdtPhuHuynh ? (
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {d.hocVien.sdtPhuHuynh}
                      </span>
                    ) : null}
                  </span>
                </div>
              </td>

              <td>
                <span className="block font-medium text-foreground">{d.lop.ten}</span>
                <span className="block text-xs text-muted-foreground">
                  {d.lop.ma ? `${d.lop.ma} · ` : ""}
                  {d.lop.coSo ?? "—"}
                </span>
              </td>

              <td>
                <StatusPill tone={toneTrangThaiDangKy(d.trangThai)}>
                  {NHAN_TRANG_THAI_DANG_KY[d.trangThai]}
                </StatusPill>
              </td>

              <td className="o-so text-muted-foreground">
                {d.ngayDangKy ? formatDateVN(new Date(d.ngayDangKy)) : "—"}
              </td>

              <td className="o-so">
                <span className="inline-flex items-center justify-end gap-1.5">
                  {/* Điều kiện hiện nút tính TRÊN MÁY CHỦ (lib/sale/dang-ky-hoc.ts)
                      và phải trùng khít `findSaleAssignedEnrollmentIds`. */}
                  {d.nhanRiengDuoc && d.hocVien.phuHuynhUserId ? (
                    <OpenDmButton
                      peerUserId={d.hocVien.phuHuynhUserId}
                      kind="SALE_PARENT"
                      // ⚠️ `/sale/tin-nhan`, KHÔNG phải `/admin/tin-nhan` (bản
                      // admin) và cũng không phải `/tin-nhan` trần. Đường trần là
                      // clean URL của host quản trị; trên host Sale nó bị viết lại
                      // thành `/sale/tin-nhan` — đúng đích nhưng bằng rewrite nên
                      // thanh địa chỉ giữ URL cũ và mục điều hướng không sáng đúng
                      // chỗ. Đi thẳng đường thật là hết chuyện.
                      hrefTemplate="/sale/tin-nhan?c=:id"
                      label="Nhắn riêng"
                    />
                  ) : null}
                  <Link
                    href={duongSua(d.id)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-[color:var(--surface-chim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30"
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                    Sửa
                  </Link>
                  {coQuyenXoa ? <NutXoaDangKy id={d.id} /> : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
