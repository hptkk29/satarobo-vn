/**
 * Site Sale — màn "Bàn giao lead".
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/ban-giao-lead/page.tsx` ══════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminHandoverPage />`. Chủ dự án
 * chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế lại
 * site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai đang làm
 * việc hằng ngày. Rủi ro trôi lệch đã được nêu rõ trước khi chốt; chủ dự án vẫn
 * chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng điều khiển, cùng nhãn, cùng câu chữ, cùng
 * điều kiện quyền. Chỉ đổi CÁCH BÀY, theo hệ thiết kế Sale đã có: `KhungDuLieu`
 * (bề mặt dữ liệu) + `GiaiThichTrang` + token tím của `sale.css`.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `previewHandoverAction` / `runHandoverAction` (Server Action của khu quản
 * trị, nơi có `checkPermission("leads:assign")` + scope cơ sở + ghi nhật ký
 * kiểm toán) · `ALL_LEAD_STATUSES` / `LEAD_CLOSED_STATUSES` / `LEAD_STATUS_LABEL`
 * · `scopedDb` · `chanNeuThieuQuyen`.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn danh sách sale + chiến dịch, và cách suy `TRANG_THAI_BAN_GIAO`. Đã
 * dời vào `lib/sale/ban-giao-lead.ts` để phần trùng nằm ở tệp có tên chứ không
 * lẫn trong JSX. Sổ nợ ghi ở đầu tệp đó.
 *
 * ⚠️ CỔNG QUYỀN `chanNeuThieuQuyen` PHẢI CHẠY TRƯỚC MỌI THỨ: bản admin thiếu
 *    quyền thì `redirect("/dashboard")`, mà đường đó là 404 trắng trơn trên host
 *    Sale (lý do đầy đủ ở `lib/sale/cong-trang.tsx`). Bài kiểm
 *    `lib/auth/page-gates.test.ts` cũng đòi đúng lời gọi này với đúng khoá
 *    `/sale/ban-giao-lead`.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDuLieuBanGiaoLead, TRANG_THAI_BAN_GIAO } from "@/lib/sale/ban-giao-lead";
import { FormBanGiaoLead } from "./_components/form-ban-giao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bàn giao lead | Tư vấn tuyển sinh" };

export default async function SaleBanGiaoLeadPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fban-giao-lead");

  const chan = await chanNeuThieuQuyen("/sale/ban-giao-lead", "Bàn giao lead");
  if (chan) return chan;

  const actor = await resolveActor(session.user.id);
  const { sale, chienDich } = await layDuLieuBanGiaoLead({
    actor,
    user: session.user,
  });

  return (
    <KhungDuLieu className="max-w-[64rem]">
      <KhungDuLieu.Dau
        ten="Bàn giao lead"
        mo="Chuyển lead của một sale sang sale khác"
      />

      <GiaiThichTrang>
        <p>
          Chuyển hàng loạt lead của một sale (vd khi nghỉ việc) sang sale khác.
          Có thể lọc theo trạng thái, chiến dịch, chỉ lead chưa đóng. Task đang
          mở cũng được chuyển. Ghi lịch sử + nhật ký kiểm toán; KHÔNG sửa tài
          khoản sale cũ.
        </p>
      </GiaiThichTrang>

      <FormBanGiaoLead
        sale={sale}
        trangThai={TRANG_THAI_BAN_GIAO}
        chienDich={chienDich}
      />
    </KhungDuLieu>
  );
}
