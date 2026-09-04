/**
 * Site Sale — màn "Hoa hồng".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/crm/commission/page.tsx` ──────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin. Chủ dự án chốt 04/09/2026:
 * màn site Sale **tách bản riêng**, không dùng chung component với khu quản trị,
 * để thiết kế lại giao diện Sale mà **không đụng một pixel nào** của khu quản
 * trị. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng 5 cột, cùng khối "Chốt kỳ từ tiền đã thu",
 * cùng 4 hành động, cùng từng câu chữ (kể cả câu giải thích cho người KHÔNG chốt
 * kỳ được).
 *
 * ── TIỀN ────────────────────────────────────────────────────────────────────
 * Phép cộng tổng kỳ + cách lọc theo người hưởng là **công thức tiền DUY NHẤT
 * phải chép** trong cả đợt. Nó nằm ở `lib/sale/hoa-hong.ts`, có ghi rõ chép từ
 * đâu và vì sao không gọi lại được. Đọc tệp đó trước khi đụng con số nào ở đây.
 *
 * ── CỔNG QUYỀN: MỘT TẦNG CỔNG + MỘT TẦNG NÚT (hai khoá KHÁC NHAU) ──────────
 * Cửa VÀO trùng khít bản admin ⇒ không thêm tầng hai cho nó:
 *   `PAGE_GATES["/sale/hoa-hong"]` = `["payments:manage"]`
 *   bản admin                      = `checkPermission("payments:manage")`
 * Kế toán cơ sở vẫn XEM được bảng (đã lọc theo người hưởng thuộc cơ sở mình) và
 * vẫn xuất Excel được — giữ nguyên như bản admin.
 *
 * NHƯNG ba nút GHI (Chốt kỳ / Tính lại / Duyệt / Mở lại) đòi khoá RIÊNG
 * `commission_periods:manage`, chỉ Super Admin + kế toán Hội sở. Siết ngày
 * 27/08/2026: trước đó chúng gác bằng `payments:manage`, mà khoá đó
 * `CENTER_ACCOUNTANT` cũng giữ ở scope GLOBAL ⇒ kế toán MỘT cơ sở chốt được kỳ
 * của CẢ CÔNG TY (bảng kê là bảng kỳ toàn hệ thống, `period` @unique, không có
 * `centerId` nên đường GHI không có gì cắt theo cơ sở).
 *
 * ⇒ Hỏi ĐÚNG khoá mà Server Action đòi rồi mới vẽ nút. Trước đợt 27/08, nút "Mở
 *   lại" hiện cho mọi người vào được màn, bấm xong mới ăn toast "Chỉ SUPER_ADMIN…"
 *   — cổng đúng nhưng giao diện nói dối. Không tái lập chuyện đó ở đây.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layBangHoaHong } from "@/lib/sale/hoa-hong";
import { FormChotKy } from "./_components/form-chot-ky";
import { BangKyHoaHong } from "./_components/bang-ky-hoa-hong";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoa hồng | Tư vấn tuyển sinh" };

export default async function SaleCommissionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fhoa-hong");

  const chan = await chanNeuThieuQuyen("/sale/hoa-hong", "Hoa hồng");
  if (chan) return chan;

  const canChotKy = await checkPermission("commission_periods:manage");

  const actor = await resolveActor(session.user.id);
  const dong = await layBangHoaHong(actor);

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Bảng hoa hồng theo kỳ"
        mo={dong.length > 0 ? `${dong.length} kỳ` : "Chưa có bảng hoa hồng nào"}
      />

      <KhungDuLieu.Loc>
        <FormChotKy canChotKy={canChotKy} />
      </KhungDuLieu.Loc>

      <BangKyHoaHong dong={dong} canChotKy={canChotKy} />
    </KhungDuLieu>
  );
}
