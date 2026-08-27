// Tạo đơn cho một khách — bước chốt của phễu bán.
//
// Không có Order ⇒ không ghi nhận được tiền ⇒ không đủ điều kiện chuyển đổi ⇒
// Sale không chốt được khách, phải nhờ quản lý hoặc quay về khu quản trị.
//
// Quyền: `orders:create` (mở hẹp cho Sale ở Đợt 0) — KHÔNG phải `orders:manage`.
// Phạm vi "chỉ đơn gắn khách của mình" do `checkOrderCreateOwnership()` gác ngay
// trong `createOrderManualAction`; trang này chỉ dựng vỏ và chặn sớm cho đỡ phí
// một vòng gọi.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkAnyPermission, canViewLeadPii } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { getMyLeadDetail } from "@/lib/lead/sale-leads";
import { loadCreateOrderFormData } from "@/app/(admin)/admin/orders/_actions";
import { CreateOrderForm } from "../_components/create-order-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tạo đơn | Tư vấn tuyển sinh" };

export default async function SaleChotDonPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fkhach-cua-toi");
  if (!(await checkAnyPermission(PAGE_GATES["/sale/chot-don"]))) redirect("/sale");

  const { leadId } = await params;
  const actor = await resolveActor(session.user.id);
  const canViewPii = await canViewLeadPii();

  // Khách phải là của người đang xem — `getMyLeadDetail` trả null cho cả
  // "không tồn tại" lẫn "không phải của bạn".
  const lead = await getMyLeadDetail(actor, session.user.id, leadId, canViewPii);
  if (!lead) notFound();

  const form = await loadCreateOrderFormData();

  // ⚠️ Cắt `stockOnHand` Ở ĐÂY, tầng dữ liệu. Sale không có quyền tồn kho; chỉ
  // "không vẽ ra" là vẫn gửi con số xuống trình duyệt trong payload RSC.
  const products = form.products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    salePrice: p.salePrice,
  }));

  return (
    <div>
      <Link
        href={`/sale/khach-cua-toi/${lead.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại khách
      </Link>

      <h1 className="text-2xl font-bold text-foreground">Tạo đơn</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cho khách <strong className="text-foreground">{lead.parentName || "(chưa có tên)"}</strong>
        {lead.phone ? ` · ${lead.phone}` : ""}
      </p>

      <div className="mt-5">
        <CreateOrderForm
          leadId={lead.id}
          // N-2 — con của phiếu; `getMyLeadDetail` đã đọc kèm và đã qua cổng "khách của
          // mình", nên danh sách này không bao giờ chứa con của phiếu người khác.
          leadChildren={lead.children.map((c) => ({ id: c.id, fullName: c.fullName }))}
          // Thông tin người mua lấy sẵn từ hồ sơ khách — gõ lại là chỗ sinh sai
          // lệch giữa đơn và lead, và sai số điện thoại thì mọi tin nhắn xác nhận
          // đi lạc.
          // S-1 — `lead` ở đây ĐÃ che theo `canViewPii` (getMyLeadDetail). Điền bản
          // che vào ô ghi là tạo ra đơn mang tên "Nguyễn T. L." — `customerName`
          // không có validator nào chặn (chỉ `customerPhone` có `phoneVn`). Thiếu
          // quyền thì để trống: form chặn ngay, hỏng sớm và thấy được.
          defaultCustomerName={canViewPii ? (lead.parentName ?? "") : ""}
          defaultCustomerPhone={canViewPii ? (lead.phone ?? "") : ""}
          defaultCustomerEmail={canViewPii ? (lead.email ?? "") : ""}
          paymentMethods={form.paymentMethods}
          courses={form.courses}
          products={products}
        />
      </div>
    </div>
  );
}
