"use client";

/**
 * Site Sale — phần điều phối của màn "Thanh toán": nút mở form ghi nhận, dải
 * cảnh báo PII, và bảng.
 *
 * ── BẢN ĐÔI CỦA `PaymentsClient` trong
 *    `app/(admin)/admin/payments/_components/payments-client.tsx` ────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100% cả hai câu của dải PII và nhãn nút "Ghi nhận khoản" /
 * "Đóng form".
 *
 * ── HAI CƠ CHẾ TINH VI CHÉP NGUYÊN, ĐỪNG "DỌN" ─────────────────────────────
 * 1. `daMo` suy từ `rows[0].piiMasked` chứ không phải một state riêng. Nguồn sự
 *    thật là DỮ LIỆU đang cầm: dòng đã che thì màn đang che. Một cờ riêng sẽ nói
 *    "đang mở" trong khi dữ liệu đã bị thay bằng bản che.
 * 2. `useEffect` đồng bộ lại `rows` khi `initialRows` đổi. Ba nút kế toán chỉ
 *    hiện toast; dữ liệu mới về qua `revalidatePath` + `router.refresh()`, tức
 *    prop đổi — nhưng `useState` giữ giá trị lần dựng đầu ⇒ trạng thái khoản đứng
 *    im tới khi F5. Hệ quả CÓ CHỦ ĐÍCH kèm theo: dữ liệu mới là bản ĐÃ CHE PII →
 *    break-glass tự đóng lại, muốn xem tiếp phải mở lại (và được ghi log lại) —
 *    an toàn hơn là giữ PII mở vô thời hạn.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * Nút + dải PII + form gom vào `<KhungDuLieu.Loc>` (nền `--surface-chim`, nằm
 * TRONG khung, ngay dưới dòng đầu) thay vì ba khối rời trôi trên nền trang. Mắt
 * đọc cả cụm là "công cụ", còn bảng bên dưới là "dữ liệu".
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { cn } from "@/lib/utils";
import type { PaymentRow } from "@/app/(admin)/admin/payments/_actions";
import { BangThanhToan } from "./bang-thanh-toan";
import { FormGhiNhanKhoan, type MucDonHang } from "./form-ghi-nhan";
import { MoXemPii } from "./mo-xem-pii";

export function ThanhToanClient({
  initialRows,
  orders,
  canConfirm,
  canRecord,
  canViewPii,
}: {
  initialRows: PaymentRow[];
  orders: MucDonHang[];
  canConfirm: boolean;
  canRecord: boolean;
  /**
   * `payments:view-pii`. Chỉ QUYẾT ĐỊNH CÓ VẼ NÚT "Xem đầy đủ" hay không — cổng
   * thật nằm trong `revealPaymentsPii` (`assertPermission` + lý do + ghi log).
   */
  canViewPii: boolean;
}) {
  const [rows, setRows] = useState<PaymentRow[]>(initialRows);
  const [hienForm, setHienForm] = useState(false);

  // #15 — break-glass: mặc định che CCCD PH + địa chỉ.
  const daMo = rows.length > 0 ? !rows[0]!.piiMasked : false;

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  return (
    <>
      {/* `canRecord` ở đây luôn đúng — trang cha đã chặn người thiếu nó (xem ghi
          chú cổng quyền trong `page.tsx`). Giữ điều kiện để cấu trúc khớp bản
          admin: hôm nào cổng trang đổi thì chỗ này không âm thầm hở ra. */}
      {(canRecord || canViewPii) && (
        <KhungDuLieu.Loc>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {canRecord ? (
              <button
                type="button"
                onClick={() => setHienForm((s) => !s)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
                  hienForm
                    ? "border border-border bg-card text-foreground hover:bg-[color:var(--surface-chrome)]"
                    : "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--primary-dark)]",
                )}
              >
                {hienForm ? (
                  <X aria-hidden="true" className="size-4" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                {hienForm ? "Đóng form" : "Ghi nhận khoản"}
              </button>
            ) : (
              <span />
            )}

            {canViewPii && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 rounded-lg border border-state-warning-soft bg-state-warning-soft/60 px-3 py-2">
                <p className="min-w-0 flex-1 text-xs text-state-warning-ink">
                  CCCD phụ huynh &amp; địa chỉ được che mặc định (thông tin nhạy cảm).
                  {daMo
                    ? " Đang xem đầy đủ — hành động đã được ghi log."
                    : " Mở xem đầy đủ cần lý do và sẽ được ghi log."}
                </p>
                <MoXemPii
                  daMo={daMo}
                  khiMo={(dongDaMo) => setRows(dongDaMo)}
                  khiAn={() => setRows(initialRows)}
                />
              </div>
            )}
          </div>

          {canRecord && hienForm && (
            <FormGhiNhanKhoan donHang={orders} khiXong={() => setHienForm(false)} />
          )}
        </KhungDuLieu.Loc>
      )}

      <BangThanhToan dong={rows} coQuyenXacNhan={canConfirm} />
    </>
  );
}
