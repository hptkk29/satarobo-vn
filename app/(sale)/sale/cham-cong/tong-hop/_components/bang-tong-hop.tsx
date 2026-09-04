/**
 * Site Sale — bảng "Tổng hợp công ca" (7 ngày × N nhân viên).
 *
 * ── BẢN ĐÔI CỦA khối `<table>` trong
 *    `app/(admin)/admin/cham-cong/lich-ca-nhan-vien/page.tsx` ─────────────────
 * Chốt 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng một
 * pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100% NỘI DUNG: cột "Nhân viên" + đúng bảy cột thứ (T2 → CN) kèm
 * ngày `MM-DD`; mỗi ô mang đủ bốn mảnh của bản admin — ca đã đăng ký (hoặc "Chưa
 * ĐK ca" khi có quét mà không đăng ký), khung giờ vào–ra, NHÃN ĐẦU TIÊN của
 * trạng thái công, và dấu "giải trình" kèm `title` đầy đủ; ô không có gì thì "—".
 * Câu rỗng cũng giữ nguyên: "Không có nhân viên trong phạm vi."
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô → `.bang-sale` của `sale.css`.
 * 2. Nhãn trạng thái + dấu giải trình: `<span>` gõ tay chuỗi màu →
 *    `<StatusPill>` thu nhỏ (`className` đè cỡ chữ/đệm). Vẫn là thang ngữ nghĩa
 *    duy nhất của site, chỉ vừa ô 7 cột — `lib/sale/ky-luat-mau.test.ts` canh.
 * 3. Canh giữa cho bảy cột ngày đặt trên một `<div>` CON, không phải trên `th`/
 *    `td`. `.sale-root .bang-sale thead th { text-align: left }` có độ ưu tiên
 *    cao hơn tiện ích `text-center` của Tailwind, nên gắn thẳng lên ô là không
 *    ăn — lỗi im lặng, bảng vẫn hiện, chỉ lệch.
 *
 * Đây là Server Component (không `"use client"`): bảng không có ô nhập, không có
 * nút nào gọi Server Action.
 */
import { MapPinOff, MessageSquareWarning } from "lucide-react";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import type { DongTongHop } from "@/lib/sale/cham-cong";

const THU = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Viên nhãn thu nhỏ để vừa ô của bảng 8 cột — vẫn đi qua thang ngữ nghĩa chung. */
const VIEN_NHO = "px-1.5 py-0 text-[10px] font-semibold";

export function BangTongHop({
  dong,
  ngayTrongTuan,
  hienCoSo,
}: {
  dong: DongTongHop[];
  ngayTrongTuan: string[];
  /** Bản admin chỉ hiện tên cơ sở dưới tên nhân viên khi KHÔNG lọc một cơ sở. */
  hienCoSo: boolean;
}) {
  return (
    <PhanTrangBang tenDonVi="nhân viên" khoaGhiNho="sale-tong-hop-cong-ca" cuonNgang>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Nhân viên</th>
            {ngayTrongTuan.map((ds, i) => (
              <th key={ds} scope="col">
                <div className="text-center">
                  {THU[i]}
                  <br />
                  <span className="font-normal normal-case tracking-normal">{ds.slice(5)}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dong.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-muted-foreground">
                Không có nhân viên trong phạm vi.
              </td>
            </tr>
          ) : (
            dong.map((u) => (
              <tr key={u.userId} className="align-top">
                <td>
                  <div className="font-medium text-foreground">{u.ten}</div>
                  {hienCoSo && u.tenCoSo && (
                    <div className="text-xs text-muted-foreground">{u.tenCoSo}</div>
                  )}
                </td>
                {u.ngay.map((o, i) => (
                  <td key={ngayTrongTuan[i]}>
                    {!o.coDuLieu ? (
                      <div className="text-center text-muted-foreground">—</div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        {o.caDangKy ? (
                          <span className="text-[10px] font-semibold text-foreground">
                            {o.caDangKy}
                          </span>
                        ) : (
                          o.chuaDangKyCa && (
                            <span className="text-[10px] text-[color:var(--state-warning)]">
                              Chưa ĐK ca
                            </span>
                          )
                        )}
                        {o.gio && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {o.gio}
                          </span>
                        )}
                        {o.nhan && (
                          <StatusPill tone={o.nhan.tone} className={VIEN_NHO}>
                            {o.nhan.ngoaiVung && (
                              <MapPinOff aria-hidden="true" className="mr-0.5 size-2.5" />
                            )}
                            {o.nhan.nhan}
                          </StatusPill>
                        )}
                        {o.giaiTrinh && (
                          // `title` nằm trên `<span>` bọc ngoài chứ không trên
                          // `<StatusPill>`: viên nhãn dùng chung chỉ nhận
                          // `children` / `tone` / `className`, truyền `title` vào
                          // nó là một prop bị nuốt im lặng — chú giải biến mất mà
                          // TypeScript vẫn xanh nếu ai đó nới kiểu.
                          <span title={o.giaiTrinh}>
                            <StatusPill tone="warning" className={VIEN_NHO}>
                              <MessageSquareWarning
                                aria-hidden="true"
                                className="mr-0.5 size-2.5"
                              />
                              giải trình
                            </StatusPill>
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
