"use client";

/**
 * Site Sale — bảng "Sinh nhật học viên".
 *
 * ── BẢN ĐÔI CỦA khối `<table>` trong `app/(admin)/admin/sinh-nhat/page.tsx` ──
 * Chốt 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng một
 * pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: năm cột đúng thứ tự, đúng nhãn — Học viên · Ngày
 * sinh nhật · Buổi tổ chức · Tin Zalo · (hành động); đủ bốn ghi chú phụ của bản
 * admin ("HÔM NAY", "tổ chức trước sinh nhật", "buổi đã qua, chưa chúc", "đã
 * chúc"); và đúng hai nút trên dòng.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô (`px-4 py-2 text-xs uppercase…`) → `.bang-sale` của
 *    `sale.css`. Mật độ nằm ở CSS thì bảng MỚI tự đúng; nằm trong từng ô thì lần
 *    sau phải nhớ chép. Kèm `white-space: nowrap` trên CẢ `th` VÀ `td` — thứ duy
 *    nhất chặn chiều cao dòng nhảy loạn (đo ở admin: 65–71px, không đều nhau).
 * 2. Nhãn ZNS: `<span>` gõ tay chuỗi màu (`bg-state-warning-soft text-…`) →
 *    `<StatusPill tone={…}>`, tone quyết ở `lib/sale/sinh-nhat.ts`. Bài kiểm
 *    `lib/sale/ky-luat-mau.test.ts` canh đúng chỗ này.
 * 3. Ba ghi chú phụ (HÔM NAY · tổ chức trước · buổi đã qua) trước đây mỗi cái
 *    một kiểu: một cái là viên bo tròn màu thương hiệu, hai cái là chữ nhỏ. Nay
 *    thống nhất: **chỉ "buổi đã qua, chưa chúc" được tô màu** — nó là việc bị lỡ.
 *    "HÔM NAY" giữ viên bo tròn màu thương hiệu vì nó nói VỊ TRÍ trong thời gian
 *    (cùng ngôn ngữ với mục đang đứng ở thanh bên), không nói trạng thái việc.
 * 4. Cột ngày dùng `o-so` → canh phải + chữ số đều bề ngang, quét dọc thẳng hàng.
 *
 * ⚠️ HAI LIÊN KẾT DƯỚI ĐÂY LÀ **NỢ ĐÃ BIẾT** — 404 trên host Sale.
 *    `/students/{id}/edit` và `/sessions/{id}` là CLEAN URL của host quản trị:
 *    `decideRoute` trên `admin.satarobo.vn` viết lại thành `/admin/students/...`.
 *    Trên `sale.satarobo.vn`, luật cuối của nhánh Sale là `rewrite "/sale" + pathname`
 *    (`lib/auth/route-policy.ts`) ⇒ `/sale/students/{id}/edit` — **404**. Trỏ sang
 *    host admin cũng không cứu: Sale THUẦN bước vào host admin là bị đá ngược.
 *    KHÔNG chạy qua `duongSale()`: hàm đó không ánh xạ hai đường này (chúng nằm
 *    đúng trong danh sách "NỢ ĐÃ BIẾT" ở cuối `lib/sale/duong-dan-sale.ts`), nên
 *    gọi nó chỉ là một lời hứa suông. Giữ nguyên đường cũ là CỐ Ý: bản mount trước
 *    đây hỏng y hệt, đổi sang địa chỉ khác chỉ là dời chỗ vỡ.
 *    Lối ra đúng là dựng `/sale/hoc-vien/[id]` + `/sale/buoi-hoc/[id]` — việc THÊM
 *    MÀN, phải hỏi chủ dự án.
 */
import Link from "next/link";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import type { DongSinhNhat } from "@/lib/sale/sinh-nhat";
import { NutDaChuc } from "./nut-sinh-nhat";

export function BangSinhNhat({ dong }: { dong: DongSinhNhat[] }) {
  return (
    <PhanTrangBang tenDonVi="sinh nhật" khoaGhiNho="sale-sinh-nhat" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Học viên</th>
            <th scope="col" className="o-so">
              Ngày sinh nhật
            </th>
            <th scope="col">Buổi tổ chức</th>
            <th scope="col">Tin Zalo</th>
            <th scope="col" className="o-so">
              <span className="sr-only">Hành động</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {dong.map((d) => (
            <tr key={d.id}>
              <td>
                <Link
                  href={`/students/${d.studentId}/edit`}
                  className="font-medium text-[color:var(--primary-ink)] hover:underline"
                >
                  {d.tenHocVien}
                </Link>
                {d.homNay && (
                  <span className="ml-2 rounded-full bg-[color:var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--primary-ink)]">
                    HÔM NAY
                  </span>
                )}
              </td>

              <td className="o-so text-foreground">{d.ngaySinhNhat}</td>

              {/* Cột duy nhất được phép xuống dòng: nó mang tới hai ghi chú phụ
                  dưới ngày. `o-dai` kèm sẵn trần bề rộng nên một ghi chú dài
                  không kéo cả bảng giãn ra. */}
              <td className="o-dai">
                {d.ngayToChuc ? (
                  d.maBuoiToChuc ? (
                    <Link
                      href={`/sessions/${d.maBuoiToChuc}`}
                      className="text-[color:var(--primary-ink)] hover:underline"
                    >
                      {d.ngayToChuc}
                    </Link>
                  ) : (
                    <span className="text-foreground">{d.ngayToChuc}</span>
                  )
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {d.toChucTruoc && (
                  <span className="block text-xs text-muted-foreground">
                    tổ chức trước sinh nhật
                  </span>
                )}
                {d.daLo && (
                  <span className="block text-xs font-semibold text-[color:var(--state-danger)]">
                    buổi đã qua, chưa chúc
                  </span>
                )}
              </td>

              <td>
                {d.zns ? (
                  <StatusPill tone={d.zns.tone}>{d.zns.nhan}</StatusPill>
                ) : (
                  <span className="text-xs text-muted-foreground">chưa tới ngày</span>
                )}
              </td>

              <td className="o-so">
                <div className="flex items-center justify-end gap-2">
                  {d.daChuc && (
                    <span className="text-xs font-medium text-[color:var(--state-success)]">
                      đã chúc
                    </span>
                  )}
                  <NutDaChuc id={d.id} daChuc={d.daChuc} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
