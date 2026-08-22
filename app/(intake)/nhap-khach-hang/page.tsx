import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import { QuickLeadForm } from "./_components/quick-lead-form";

export const metadata = { title: "Nhập khách hàng | Sata Robo" };
export const dynamic = "force-dynamic";

/**
 * `satarobo.vn/nhap-khach-hang` — biểu mẫu nhập khách hàng NỘI BỘ, có đăng nhập.
 *
 * Thay hẳn biểu mẫu công khai `sale.satarobo.vn` (nghỉ 22/08/2026). Marketing /
 * sale-admin ngồi gõ lead thu từ quảng cáo Facebook: mỗi phiếu vài giây, gõ xong
 * ở lại nhập tiếp. Khác `/admin/leads/new` (biểu mẫu ĐẦY ĐỦ: khoá quan tâm,
 * nhiều con, trạng thái…) — màn này đi qua đường nhận lead chung
 * (`ingestIntakeLead`) nên có sẵn chống trùng + tự chia; `/admin/leads/new` thì
 * không.
 *
 * Cổng đăng nhập + quyền `leads:create` nằm ở `app/(intake)/layout.tsx`; Server
 * Action tự kiểm lại lần nữa (layout gate là chưa đủ — action là endpoint riêng).
 */
export default async function NhapKhachHangPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fnhap-khach-hang");
  if (!(await checkAnyPermission(PAGE_GATES["/nhap-khach-hang"]))) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Chủ dự án chốt 04/08: LEAD KHÔNG BAO GIỜ VỀ HỘI SỞ — chỉ cơ sở dạy học mới
  // nhận lead. Dùng đúng khái niệm mà `autoAssignNewLead` dùng để chia lead, để
  // hai đường không lệch nhau. Mở CS3 = thêm data, KHÔNG sửa code.
  const [centers, nonEnrollable] = await Promise.all([
    sdb.center.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    getNonEnrollableCenterIds(),
  ]);

  const options = centers
    .filter((c) => c.code && !nonEnrollable.includes(c.id))
    .map((c) => ({ code: c.code as string, name: c.name }));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Nhập khách hàng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhập nhanh khách thu được từ quảng cáo, sự kiện, hoặc tư vấn trực tiếp.
          Hệ thống tự kiểm tra trùng số điện thoại và tự giao cho tư vấn viên theo
          cơ sở.
        </p>
      </div>
      <QuickLeadForm centers={options} />
    </div>
  );
}
