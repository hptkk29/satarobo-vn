// Hoá đơn điện tử — "Bàn chứng từ" của kế toán (docs/ke-toan-hoa-don/PLAN.md §4 + §10).
//
// Mỗi dòng là MỘT LẦN THU (gom bằng `gomLanThu`), đi qua: tải phiếu thu chờ → làm hoá đơn ở MISA →
// tải tệp lên → xác nhận. Danh sách + ngăn xử lý đứng CẠNH nhau (≥ xl); dưới xl ngăn là Sheet.
//
// ⚠️ Chọn dòng bằng `?chon=<khoá lần thu>` — khoá BẤT BIẾN qua mọi ngăn (dòng đổi ngăn khi tải tệp
// lên, không đổi khoá), nên ngăn xử lý giữ đúng dòng sau `router.refresh()`.
// ⚠️ Mọi quyết định "dòng vào ngăn nào, nút nào sáng, che gì" nằm ở `lib/finance/hoa-don/*` (thuần,
// có test). Trang này chỉ gác cửa, nạp, chia ngăn.
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkAnyPermission, checkPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { PageHeader } from "@/components/admin/ui/page-header";
import { laHoaDonBat } from "@/lib/finance/hoa-don/feature";
import { napHangChoHoaDon } from "@/lib/finance/hoa-don/hang-cho";
import { chonNgan, demTheoNgan, sapXepTrongNgan } from "@/lib/finance/hoa-don/ngan-hang-cho";
import { BanChungTu } from "./_components/ban-chung-tu";

export const metadata = { title: "Hoá đơn điện tử | Admin" };
export const dynamic = "force-dynamic";

export default async function HoaDonPage({
  searchParams,
}: {
  searchParams: Promise<{ ngan?: string; chon?: string }>;
}) {
  // Cờ TẮT = màn không tồn tại. Đặt TRƯỚC `auth()` để không dò được địa chỉ có thật.
  if (!(await laHoaDonBat())) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fpayments%2Fhoa-don");
  if (!(await checkAnyPermission(PAGE_GATES["/payments/hoa-don"]))) {
    redirect("/dashboard?error=unauthorized");
  }

  const [sp, actor, canViewPii] = await Promise.all([
    searchParams,
    resolveActor(session.user.id),
    checkPermission("orders:view-pii"),
  ]);
  const { dong, thieuCoSo, khoOk } = await napHangChoHoaDon(actor, { canViewPii });

  const dangChon = sp.chon ? (dong.find((d) => d.key === sp.chon) ?? null) : null;
  const ngan = chonNgan({ tuUrl: sp.ngan, dongDangChon: dangChon });

  return (
    <div>
      <PageHeader
        title="Hoá đơn điện tử"
        subtitle="Mỗi dòng là một lần thu tiền: tải phiếu thu, làm hoá đơn ở MISA, rồi tải tệp hoá đơn lên đây."
      />
      <BanChungTu
        ngan={ngan}
        dem={demTheoNgan(dong)}
        dongTrongNgan={sapXepTrongNgan(ngan, dong)}
        dangChon={dangChon}
        chonKhongThay={Boolean(sp.chon) && !dangChon}
        thieuCoSo={thieuCoSo}
        khoOk={khoOk}
      />
    </div>
  );
}
