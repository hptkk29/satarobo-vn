/**
 * Site Sale — bảng "Chấm công nhân viên" (một ngày).
 *
 * ── BẢN ĐÔI CỦA khối `<table>` trong `app/(admin)/admin/cham-cong/page.tsx` ──
 * Chốt 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng một
 * pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: bảy cột đúng thứ tự, đúng nhãn — Nhân viên · Cơ sở ·
 * Ca đăng ký · Check-in · Check-out · Giờ công · Tình trạng; và đúng những nhãn
 * tình trạng mà `computeShiftAttendance` sinh ra (Đủ công · Đi muộn · Về sớm ·
 * Thiếu check-out · Thiếu ca (không quét) · Thiếu giờ · Chưa đăng ký ca · Ngoài
 * vùng), kể cả icon bản đồ gạch chéo cạnh "Ngoài vùng".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô (`px-4 py-2.5 …`) → `.bang-sale` của `sale.css`. Mật
 *    độ nằm ở CSS thì bảng MỚI tự đúng; nằm trong từng ô thì lần sau phải nhớ chép.
 * 2. Nhãn tình trạng: `<span>` gõ tay chuỗi màu (`bg-state-warning-soft text-…`)
 *    → `<StatusPill tone={…}>`, tone quyết ở `lib/sale/cham-cong.ts`. Bài kiểm
 *    `lib/sale/ky-luat-mau.test.ts` canh đúng chỗ này.
 * 3. Ba cột giờ (`Check-in` · `Check-out` · `Giờ công`) dùng `o-so` → canh phải
 *    + chữ số đều bề ngang, quét dọc thẳng hàng. Bản admin canh GIỮA, nên mắt
 *    không so được 07:31 với 07:28 nếu không đọc từng chữ số.
 *
 * Đây là Server Component (không `"use client"`): bảng không có ô nhập, không có
 * nút nào gọi Server Action. `<PhanTrangBang>` bên trong mới là client — cùng
 * cách bản admin đang làm.
 */
import { MapPinOff } from "lucide-react";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import type { DongChamCongNgay } from "@/lib/sale/cham-cong";

export function BangChamCong({ dong }: { dong: DongChamCongNgay[] }) {
  return (
    <PhanTrangBang tenDonVi="nhân viên" khoaGhiNho="sale-cham-cong" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Nhân viên</th>
            <th scope="col">Cơ sở</th>
            <th scope="col">Ca đăng ký</th>
            <th scope="col" className="o-so">
              Check-in
            </th>
            <th scope="col" className="o-so">
              Check-out
            </th>
            <th scope="col" className="o-so">
              Giờ công
            </th>
            <th scope="col">Tình trạng</th>
          </tr>
        </thead>
        <tbody>
          {dong.map((d) => (
            <tr key={d.userId}>
              <td className="font-medium text-foreground">{d.tenNhanVien}</td>
              <td className="text-muted-foreground">{d.tenCoSo}</td>
              <td className="text-foreground">{d.caDangKy}</td>
              <td className="o-so text-foreground">{d.gioVao}</td>
              <td className="o-so text-foreground">{d.gioRa}</td>
              <td className="o-so font-medium text-foreground">{d.gioCong}</td>
              <td>
                <div className="flex flex-wrap items-center gap-1">
                  {d.nhan.map((n, i) => (
                    <StatusPill key={i} tone={n.tone}>
                      {n.ngoaiVung && <MapPinOff aria-hidden="true" className="mr-1 size-3" />}
                      {n.nhan}
                    </StatusPill>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
