"use client";

/**
 * Bảng buổi học của site Sale — bản đôi GIAO DIỆN của khối `<table>` +
 * `session-list-row.tsx` trong `app/(admin)/admin/sessions/` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng bốn cột, đúng thứ tự, đúng nhãn: Thời gian · Lớp / Chủ đề · Điểm danh ·
 * Thao tác. Đúng bốn thao tác với đúng bốn câu `title` ("Điểm danh", "Chi tiết /
 * Nhận xét / Checklist", "Sửa", "Xoá"). Câu rỗng giữ nguyên từng chữ ("Chưa có
 * buổi học nào khớp bộ lọc." + lối "Tạo buổi học mới →"). Hai nhãn thời gian
 * ("Đã diễn ra" / "Sắp tới") và hai nhãn điểm danh ("N điểm danh" / "Chưa có")
 * giữ nguyên.
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 *   1. `class="bang-sale"` — mật độ 44px và `nowrap` trên CẢ `th` VÀ `td` lấy từ
 *      `sale.css`, thay ~16 lần gõ lại `p-4` trên từng ô.
 *   2. Nhãn "N điểm danh" qua `<StatusPill tone="info">`; nhãn "Sắp tới" /
 *      "Đã diễn ra" KHÔNG thành pill — hai nhãn trạng thái cạnh nhau trên cùng
 *      một dòng là hai thứ tranh nhau nói, mà cái thứ hai chỉ lặp lại điều cột
 *      "Thời gian" đã nói.
 *   3. Cột "Chủ đề" là cột DUY NHẤT được xuống dòng (`.o-dai`, trần 22rem): chủ
 *      đề buổi là câu văn, ép `nowrap` thì nó kéo bảng giãn ngang vô tận.
 *   4. Bảng rỗng → `<KhungDuLieu.Rong>` thay vì một hàng `colSpan={4}` giả làm
 *      dữ liệu.
 *   5. Phân trang `<PhanTrangBang>` — bản admin đổ thẳng 200 dòng ra một trang.
 *
 * ⚠️ "Cố ý ngu": component chỉ nhận CHUỖI ĐÃ ĐỊNH DẠNG từ server (`ngayGio`) và
 *    một cờ `daDienRa` tính sẵn. Định dạng ngày / so `Date.now()` ở phía client
 *    là cách chắc chắn để hai lần vẽ đầu tiên ra hai kết quả khác nhau khi múi
 *    giờ máy khách lệch máy chủ. Cùng nếp với `lop-hoc/_components/bang-lop-hoc.tsx`.
 *
 * ⚠️ NỢ ĐÃ BIẾT — bốn đích của cột "Thao tác" đều là đường của KHU QUẢN TRỊ
 *    (`/attendance`, `/sessions/{id}`, `/sessions/{id}/edit`). Trên host
 *    `sale.satarobo.vn`, `decideRoute` viết lại mọi đường lạ thành `/sale/<đường>`
 *    (route-policy.ts, nhánh host "sale") ⇒ 404. Bản mount cũ cũng đã như vậy:
 *    giữ nguyên ở đây là KHÔNG tạo hồi quy, chứ không phải là đúng. Vá thật =
 *    dựng các màn tương ứng trong `app/(sale)/sale/buoi-hoc/**`, và đó là việc
 *    THÊM MÀN, phải hỏi chủ dự án. `duongSale()` KHÔNG dùng được ở đây: bảng này
 *    liệt kê buổi học của cả cơ sở, không phải việc của riêng người đang xem —
 *    xem cảnh báo ở đầu `lib/sale/duong-dan-sale.ts`.
 */
import Link from "next/link";
import { ClipboardCheck, ListChecks, Pencil } from "lucide-react";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { cn } from "@/lib/utils";
import { NutXoaBuoiHoc } from "./nut-xoa-buoi-hoc";

export type DongBangBuoi = {
  id: string;
  /** `dd/MM/yyyy · HH:mm`, đã định dạng ở máy chủ. */
  ngayGio: string;
  /** Tính ở máy chủ — đừng so `Date.now()` trong lần vẽ của client. */
  daDienRa: boolean;
  chuDe: string | null;
  tenLop: string;
  soDiemDanh: number;
};

const NUT_ICON =
  "inline-flex size-8 items-center justify-center rounded-md border border-border " +
  "text-muted-foreground transition-colors hover:bg-[color:var(--surface-chim)] " +
  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[color:var(--primary)]/30";

export function BangBuoiHoc({
  dong,
  quayVe,
  ghiDuoc,
}: {
  dong: DongBangBuoi[];
  /** Bộ lọc hiện tại, để form Sửa quay về đúng ngữ cảnh (QA 20/07 Vấn đề C). */
  quayVe: string;
  /** `sessions:edit` — quyền mà createSession/updateSession/deleteSession đòi. */
  ghiDuoc: boolean;
}) {
  if (dong.length === 0) {
    return (
      <KhungDuLieu.Rong
        ten="Chưa có buổi học nào khớp bộ lọc."
        mo={
          ghiDuoc
            ? undefined
            : "Đổi phạm vi thời gian hoặc chọn lớp khác ở thanh lọc phía trên."
        }
        hanhDong={
          ghiDuoc ? (
            <Link
              href="/sessions/new"
              className="text-sm font-medium text-[color:var(--primary-ink)] hover:underline"
            >
              Tạo buổi học mới →
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <PhanTrangBang
      cuonNgang
      tenDonVi="buổi"
      khoaGhiNho="sale-buoi-hoc"
      // Chỉ THANH PHÂN TRANG được đệm ngang, KHÔNG phải vùng cuộn: bảng phải chạm
      // hai mép khung, còn thanh phân trang phải thẳng hàng với đệm 20px của
      // `KhungDuLieu`. Nhắm `nth-child(2)` chứ không `last-child` vì khi bảng ngắn
      // hơn một trang thì thanh này KHÔNG được vẽ — `last-child` khi đó rơi trúng
      // vùng cuộn và đệm nhầm cả cái bảng.
      className="[&>div:nth-child(2)]:px-5 [&>div:nth-child(2)]:pb-3"
    >
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Thời gian</th>
            <th scope="col">Lớp / Chủ đề</th>
            <th scope="col" className="o-so">
              Điểm danh
            </th>
            <th scope="col" className="o-so">
              Thao tác
            </th>
          </tr>
        </thead>
        <tbody>
          {dong.map((b) => (
            <tr key={b.id}>
              <td>
                <div className="font-medium tabular-nums text-foreground">{b.ngayGio}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {b.daDienRa ? "Đã diễn ra" : "Sắp tới"}
                </div>
              </td>

              <td className="o-dai">
                <div className="font-medium text-foreground">{b.tenLop}</div>
                {b.chuDe && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    📚 {b.chuDe}
                  </div>
                )}
              </td>

              <td className="o-so">
                {b.soDiemDanh > 0 ? (
                  <StatusPill tone="info">{b.soDiemDanh} điểm danh</StatusPill>
                ) : (
                  <span className="text-xs text-muted-foreground">Chưa có</span>
                )}
              </td>

              <td className="o-so">
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    href={`/attendance?sessionId=${b.id}`}
                    title="Điểm danh"
                    aria-label={`Điểm danh buổi ${b.ngayGio}`}
                    className={NUT_ICON}
                  >
                    <ClipboardCheck className="size-4" />
                  </Link>
                  <Link
                    href={`/sessions/${b.id}`}
                    title="Chi tiết / Nhận xét / Checklist"
                    aria-label={`Chi tiết buổi ${b.ngayGio}`}
                    className={NUT_ICON}
                  >
                    <ListChecks className="size-4" />
                  </Link>
                  {ghiDuoc && (
                    <>
                      <Link
                        href={`/sessions/${b.id}/edit?returnTo=${encodeURIComponent(quayVe)}`}
                        title="Sửa"
                        aria-label={`Sửa buổi ${b.ngayGio}`}
                        className={cn(
                          NUT_ICON,
                          "border-[color:var(--primary)]/35 text-[color:var(--primary-ink)]",
                          "hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary-ink)]",
                        )}
                      >
                        <Pencil className="size-4" />
                      </Link>
                      <NutXoaBuoiHoc
                        buoiId={b.id}
                        nhan={b.chuDe ?? b.ngayGio}
                        tenLop={b.tenLop}
                        soDiemDanh={b.soDiemDanh}
                      />
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
