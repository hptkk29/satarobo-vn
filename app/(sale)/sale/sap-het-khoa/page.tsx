/**
 * Site Sale — màn "Sắp hết khoá" (`/sale/sap-het-khoa`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/students/sap-het-khoa/page.tsx` ══════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminNearingEndPage />`. Chủ dự án
 * chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế lại
 * site Sale mà KHÔNG đụng một pixel nào của khu quản trị. Rủi ro trôi lệch đã
 * được nêu rõ trước khi chốt; chủ dự án vẫn chọn đường này.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `getNearingEndEnrollments` (toàn bộ phép tính buổi còn lại + ngày kết thúc dự
 * kiến) · `formatDateVN` · `scopedDb` · `PhanTrangBang` · `StatusPill` ·
 * `KhungDuLieu`. Phần chép duy nhất là JSX của bảng.
 *
 * ── Cổng quyền ──────────────────────────────────────────────────────────────
 * `PAGE_GATES["/sale/sap-het-khoa"]` = `["enrollments:view-all"]`, ĐÚNG BẰNG
 * quyền bản admin đòi (`checkPermission("enrollments:view-all")`). Cổng không
 * rộng hơn màn ⇒ không cần tầng kiểm thứ hai.
 *
 * ⚠️ Cách ly cơ sở KHÔNG chép theo bản admin (nó so mã vai cũ và chỉ ôm một cơ
 *    sở) — lý do đầy đủ ở `lib/sale/sap-het-khoa.ts`.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDanhSachSapHetKhoa } from "@/lib/sale/sap-het-khoa";
import { BangSapHetKhoa } from "./_components/bang-sap-het-khoa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sắp hết khoá | Tư vấn tuyển sinh" };

export default async function ManSapHetKhoa() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fsap-het-khoa");

  const chan = await chanNeuThieuQuyen("/sale/sap-het-khoa", "Sắp hết khoá");
  if (chan) return chan;

  const actor = await resolveActor(session.user.id);
  const dong = await layDanhSachSapHetKhoa(actor);

  return (
    <KhungDuLieu className="max-w-[68rem]">
      <KhungDuLieu.Dau
        ten="Sắp hết khoá"
        mo="Học viên còn ≤ 5 buổi — liên hệ phụ huynh tái tục. Sắp xếp theo số buổi còn lại."
      />
      <BangSapHetKhoa dong={dong} />
      {dong.length > 0 ? (
        <KhungDuLieu.Chan>
          {dong.length} học viên · {dong.filter((d) => d.remaining <= 2).length} còn ≤ 2 buổi
        </KhungDuLieu.Chan>
      ) : null}
    </KhungDuLieu>
  );
}
