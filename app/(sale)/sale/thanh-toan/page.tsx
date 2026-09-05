/**
 * Site Sale — màn "Thanh toán".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/payments/page.tsx` ────────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin. Chủ dự án chốt 04/09/2026:
 * màn site Sale **tách bản riêng**, không dùng chung component với khu quản trị,
 * để thiết kế lại giao diện Sale mà **không đụng một pixel nào** của khu quản
 * trị. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng 14 (+1) cột, cùng form ghi nhận 7 ô, cùng
 * break-glass PII, cùng ba nút kế toán, cùng từng câu trong các dấu "?".
 *
 * ── ĐƯỜNG DỮ LIỆU & ĐƯỜNG GHI: GỌI LẠI, KHÔNG CHÉP ─────────────────────────
 * Đây là màn TIỀN. Mọi truy vấn và mọi bút toán vẫn đi qua ĐÚNG các Server
 * Action của khu quản trị (`_actions.ts`): `queryPayments`, `loadOrderOptions`,
 * `revealPaymentsPii`, `recordPaymentAction`, `confirmPaymentAction`,
 * `rejectPaymentAction`, `adjustPaymentAction`. Chúng mang sẵn cổng quyền, khoá
 * lạc quan (`expectedUpdatedAt`), khoá chống bấm hai lần (`idempotencyKey`), che
 * PII trên máy chủ và ghi nhật ký break-glass.
 *
 * ⚠️ KHÔNG chép một dòng tính tiền nào sang `lib/sale/`. Kho này đã trả giá cho
 *    tiền nhiều lần (cộng đôi khi điều chỉnh, hoàn tiền không trừ công nợ, ba
 *    công thức công nợ song song). Một công thức tiền có hai bản là hỏng nặng
 *    nhất; nhân bản CÁI NÚT thì tệ nhất chỉ là hai cái nút trông khác nhau.
 *
 * ── CỔNG QUYỀN: MỘT TẦNG CỔNG + MỘT TẦNG "ĐỦ ĐỂ ĐỌC SỔ" ────────────────────
 * Cổng vào TRÙNG KHÍT bản admin, nên không thêm tầng hai cho nó:
 *   `PAGE_GATES["/sale/thanh-toan"]` = `["payments:manage", "payments:record"]` (HOẶC)
 *   bản admin                        = `if (!canManage && !canRecord) redirect(...)`
 *
 * NHƯNG hàm nạp dữ liệu thì HẸP HƠN cổng: `queryPayments` → `requireRecord()` →
 * đòi RIÊNG `payments:record`. Ai chỉ có `payments:manage` sẽ qua cổng rồi chết ở
 * dòng nạp, và đường chết đó là `redirect("/dashboard?error=unauthorized")` —
 * **404 trắng trơn trên host Sale** (xem `lib/sale/cong-trang.tsx`).
 *
 * Hôm nay chưa vai nào rơi vào khe đó (kiểm 04/09/2026: cả `HO_ACCOUNTANT` lẫn
 * `CENTER_ACCOUNTANT` giữ CẢ HAI khoá; v1 thì `payments:manage` ⊂ `payments:record`).
 * Nhưng khe này mở ra bằng đúng một lần admin gỡ `payments:record` của ai đó
 * trong giao diện phân quyền — và lúc đó không có gì báo, chỉ có một trang trắng.
 * Nên chặn TRƯỚC khi gọi, bằng một màn nói rõ chuyện gì đang xảy ra.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import {
  queryPayments,
  loadOrderOptions,
} from "@/app/(admin)/admin/payments/_actions";
import { ThanhToanClient } from "./_components/thanh-toan-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thanh toán | Tư vấn tuyển sinh" };

export default async function SalePaymentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fthanh-toan");

  const chan = await chanNeuThieuQuyen("/sale/thanh-toan", "Thanh toán");
  if (chan) return chan;

  // Hỏi ĐÚNG khoá mà từng Server Action đòi, không suy từ vai — nút bấm vào rồi
  // mới báo "không có quyền" là một lời hứa suông (bài học ghi ở đầu bản admin:
  // trước 03/08 nút xác nhận suy từ `payments:manage` + danh sách vai tĩnh).
  const [canRecord, canConfirm, canViewPii] = await Promise.all([
    checkPermission("payments:record"),
    checkPermission("payments:confirm"),
    // #15 (câu 32) — chỉ kế toán/admin (payments:view-pii) mới thấy nút "Xem đầy
    // đủ" CCCD PH + địa chỉ (break-glass). Mặc định mọi người xem bản đã che.
    checkPermission("payments:view-pii"),
  ]);

  // Tầng hai — KHÔNG trùng khít cổng (xem ghi chú đầu tệp). Không phải mã chết.
  if (!canRecord) {
    return (
      <KhungDuLieu>
        <KhungDuLieu.Dau ten="Thanh toán" />
        <KhungDuLieu.Rong
          ten="Tài khoản của bạn chưa được cấp quyền ghi nhận khoản thu"
          mo="Sổ thanh toán chỉ mở cho người có quyền ghi nhận khoản thu. Nhờ quản trị viên cấp quyền trong phần Phân quyền — không cần cài đặt lại gì."
          hanhDong={
            <Link
              href="/sale"
              className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)]"
            >
              Về bảng việc hôm nay
            </Link>
          }
        />
      </KhungDuLieu>
    );
  }

  const [rows, orders] = await Promise.all([queryPayments({}), loadOrderOptions()]);

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Thanh toán"
        mo="Ghi nhận khoản thu (Sale) & xác nhận / từ chối / điều chỉnh (Kế toán)"
      />
      <ThanhToanClient
        initialRows={rows}
        orders={orders}
        canConfirm={canConfirm}
        canRecord={canRecord}
        canViewPii={canViewPii}
      />
    </KhungDuLieu>
  );
}
