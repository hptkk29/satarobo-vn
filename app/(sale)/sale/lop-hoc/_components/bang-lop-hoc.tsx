"use client";

/**
 * Bảng lớp học của site Sale — bản đôi GIAO DIỆN của khối `<table>` trong
 * `app/(admin)/admin/classes/page.tsx` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng chín cột, đúng thứ tự, đúng nhãn: Tên lớp · Khoá học · Cơ sở / Phòng ·
 * Lịch · GV chính · Sức chứa · Khai giảng · Trạng thái · Hành động. Câu rỗng giữ
 * nguyên từng chữ ("Chưa có lớp nào"). Phân trang vẫn là `<PhanTrangBang>` cắt ở
 * TẦNG HIỂN THỊ, y như bản admin — đổi sang cắt ở tầng truy vấn là đổi hợp đồng
 * URL của màn, không phải đổi cách bày.
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 *   1. `class="bang-sale"` — mật độ 44px và `nowrap` trên CẢ `th` VÀ `td` lấy từ
 *      `sale.css`, thay ~40 lần gõ lại `px-4 py-3` trên từng ô.
 *   2. Nhãn trạng thái qua `<StatusPill tone={toneTrangThaiLop(...)}>`.
 *   3. Hai cột số ("Sức chứa", "Khai giảng") dùng `.o-so`: canh phải + chữ số
 *      đều bề ngang, để mắt so được sĩ số giữa các dòng.
 *   4. Bảng rỗng → `<KhungDuLieu.Rong>` thay vì một hàng `colSpan={9}` giả làm
 *      dữ liệu.
 *
 * ⚠️ "Cố ý ngu": component chỉ nhận CHUỖI ĐÃ ĐỊNH DẠNG từ server (lịch, ngày
 *    khai giảng, sĩ số). Định dạng ngày ở phía client là cách chắc chắn để hai
 *    lần vẽ đầu tiên ra hai kết quả khác nhau khi múi giờ máy khách lệch máy chủ.
 *    Cùng nếp với `tra-cuu/_components/bang-tra-cuu.tsx`.
 */
import Link from "next/link";
import type { ClassStatus } from "@prisma/client";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { NHAN_TRANG_THAI_LOP, toneTrangThaiLop } from "@/lib/sale/trang-thai-dao-tao";
import { NutXoaLop } from "./nut-xoa-lop";

export type DongBangLop = {
  id: string;
  name: string;
  classCode: string | null;
  khoaHoc: string;
  coSo: string;
  phong: string | null;
  /** `null` = lớp chưa có lịch. `gio` rỗng khi thiếu giờ bắt đầu/kết thúc. */
  lich: { thu: string; gio: string } | null;
  giaoVien: string;
  siSo: string;
  khaiGiang: string;
  trangThai: ClassStatus;
  /** Chỉ để dựng câu cảnh báo hậu quả trong hộp thoại xoá. */
  soHocVien: number;
  soBuoi: number;
};

export function BangLopHoc({
  dong,
  suaDuoc,
  xoaDuoc,
}: {
  dong: DongBangLop[];
  suaDuoc: boolean;
  xoaDuoc: boolean;
}) {
  const coHanhDong = suaDuoc || xoaDuoc;

  if (dong.length === 0) {
    return <KhungDuLieu.Rong ten="Chưa có lớp nào" />;
  }

  return (
    <PhanTrangBang
      cuonNgang
      tenDonVi="lớp"
      khoaGhiNho="sale-lop-hoc"
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
            <th scope="col">Tên lớp</th>
            <th scope="col">Khoá học</th>
            <th scope="col">Cơ sở / Phòng</th>
            <th scope="col">Lịch</th>
            <th scope="col">GV chính</th>
            <th scope="col" className="o-so">
              Sức chứa
            </th>
            <th scope="col" className="o-so">
              Khai giảng
            </th>
            <th scope="col">Trạng thái</th>
            {coHanhDong && (
              <th scope="col" className="o-so">
                Hành động
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {dong.map((l) => (
            <tr key={l.id}>
              <td>
                <div className="font-medium text-foreground">{l.name}</div>
                {l.classCode && (
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {l.classCode}
                  </div>
                )}
              </td>

              <td className="text-muted-foreground">
                <div className="max-w-[10rem] truncate" title={l.khoaHoc}>
                  {l.khoaHoc}
                </div>
              </td>

              <td className="text-muted-foreground">
                <div className="max-w-[12rem] truncate" title={l.coSo}>
                  {l.coSo}
                </div>
                {l.phong && <div className="text-xs text-muted-foreground">P. {l.phong}</div>}
              </td>

              <td>
                {l.lich ? (
                  <span className="text-xs">
                    <span className="font-medium text-foreground">{l.lich.thu}</span>
                    {l.lich.gio && (
                      <span className="ml-1 text-muted-foreground">{l.lich.gio}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>

              <td className="text-muted-foreground">{l.giaoVien}</td>

              <td className="o-so font-medium text-foreground">{l.siSo}</td>

              <td className="o-so text-muted-foreground">{l.khaiGiang}</td>

              <td>
                <StatusPill tone={toneTrangThaiLop(l.trangThai)}>
                  {NHAN_TRANG_THAI_LOP[l.trangThai] ?? l.trangThai}
                </StatusPill>
              </td>

              {coHanhDong && (
                <td className="o-so">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/classes/${l.id}`}
                      className="rounded-md border border-[color:var(--primary)]/35 px-2.5 py-1 text-xs font-semibold text-[color:var(--primary-ink)] transition-colors hover:bg-[color:var(--primary-soft)]"
                    >
                      Chi tiết
                    </Link>
                    {suaDuoc && (
                      <Link
                        href={`/classes/${l.id}/edit`}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        Sửa
                      </Link>
                    )}
                    {xoaDuoc && (
                      <NutXoaLop
                        classId={l.id}
                        name={l.name}
                        enrollmentCount={l.soHocVien}
                        sessionCount={l.soBuoi}
                      />
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
