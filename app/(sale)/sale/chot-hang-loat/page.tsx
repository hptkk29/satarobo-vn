/**
 * Site Sale — màn "Chốt hàng loạt — lead đã đăng ký".
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/leads/bulk-convert/page.tsx` ═════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminBulkConvertPage />`. Chủ dự
 * án chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế
 * lại site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai đang làm
 * việc hằng ngày. Rủi ro trôi lệch đã được nêu rõ; chủ dự án vẫn chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — bảy cột, ba ô lọc, sáu nút hàng loạt, mọi câu chữ
 * hướng dẫn, và ĐỦ BỐN quyền của bản admin. Chỉ đổi CÁCH BÀY.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `bulkConvertLeadsAction` (Server Action của khu quản trị — bốn cổng quyền,
 * cách ly cơ sở, khoá chống trùng, toàn bộ luật tiền) · `maskLeadPiiFields` ·
 * `scopedDb` · `checkPermission` / `canViewLeadPii` · `PhanTrangBang` ·
 * `MoneyInput` · `HelpHint` · `StatusPill`.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Bốn truy vấn đọc + bốn nhãn ghi chú (`ĐãĐóng=` `Giảm=` `LýDoGiảm=`
 * `HạnĐợt2=`). Đã dời vào `lib/sale/chot-hang-loat.ts`; sổ nợ ghi ở đầu tệp đó.
 *
 * ── HAI CỔNG, KHÔNG PHẢI MỘT ────────────────────────────────────────────────
 * 1. `chanNeuThieuQuyen("/sale/chot-hang-loat", …)` chạy TRƯỚC — cổng CỦA MÀN
 *    trên host Sale, đọc `PAGE_GATES` (`leads:view-all` HOẶC `leads:import`).
 *    Bài kiểm `lib/auth/page-gates.test.ts` đòi đúng lời gọi này.
 * 2. Rồi ĐỦ BỐN quyền như bản admin. Đây KHÔNG phải thừa: cổng trang là
 *    `checkAnyPermission` (một trong hai là qua), còn màn này liệt kê MỌI lead
 *    "đã đăng ký" của cơ sở kèm PII và có nhánh bỏ qua guard tiền — nên nó đòi
 *    cả bốn. Bỏ bước 2 là NỚI QUYỀN, đúng thứ đợt tách không được phép làm.
 *
 * ⚠️ Thiếu bốn quyền thì bản admin `redirect("/leads")`. Trên host Sale đường
 *    trần đó bị rewrite thành `/sale/leads` — địa chỉ THẬT của màn Leads bên
 *    này, nên trỏ thẳng `/sale/leads` cho khỏi đi vòng (và cho thanh địa chỉ
 *    hiện đúng nơi người dùng đang đứng).
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { canViewLeadPii, checkPermission } from "@/lib/auth/check-permission";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDuLieuChotHangLoat } from "@/lib/sale/chot-hang-loat";
import { BangChotHangLoat } from "./_components/bang-chot-hang-loat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chốt hàng loạt | Tư vấn tuyển sinh" };

export default async function SaleChotHangLoatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fchot-hang-loat");

  const chan = await chanNeuThieuQuyen("/sale/chot-hang-loat", "Chốt hàng loạt");
  if (chan) return chan;

  // `leads:view-all` chặn Sale: màn này liệt kê MỌI lead "đã đăng ký" của cơ sở
  // (kèm PII) và có nhánh bỏ qua guard tiền — Sale convert lead của mình ở đường
  // đơn lẻ. Chép nguyên bộ bốn của bản admin.
  const duQuyen =
    (await checkPermission("leads:view-all")) &&
    (await checkPermission("leads:import")) &&
    (await checkPermission("students:create")) &&
    (await checkPermission("enrollments:create"));
  if (!duQuyen) redirect("/sale/leads");

  const actor = await resolveActor(session.user.id);
  const hienPii = await canViewLeadPii();
  const { phieu, lop, coSo } = await layDuLieuChotHangLoat({ actor, hienPii });

  return <BangChotHangLoat phieu={phieu} lop={lop} coSo={coSo} />;
}
