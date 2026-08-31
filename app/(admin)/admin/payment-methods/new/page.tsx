import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { loadCenterPaymentOptions } from "@/lib/payments/center-options";
import { PaymentMethodForm } from "../_components/payment-method-form";

export const metadata = { title: "Thêm phương thức thanh toán | Admin" };
export const dynamic = "force-dynamic";

export default async function NewPaymentMethodPage({
  searchParams,
}: {
  searchParams: Promise<{ centerId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate mức MÀN HÌNH gọi trần (không target): "được vào danh mục hay không" là câu
  // hỏi chung. Còn "được gắn phương thức cho cơ sở nào" thì dropdown đã lọc theo tầm
  // nhìn và Server Action kiểm lại bằng passesScope — lọc ở client không phải lớp bảo vệ.
  if (!(await checkPermission("payments:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const [centers, { centerId: rawCenterId }] = await Promise.all([
    loadCenterPaymentOptions(actor),
    searchParams,
  ]);
  // Vào từ trang Cơ sở → chọn sẵn đúng cơ sở đó. Chỉ nhận id NẰM TRONG tầm nhìn actor
  // (danh sách `centers` đã lọc), kẻo `?centerId=` bịa tay thành đường gán chéo cơ sở.
  const defaultCenterId =
    rawCenterId && centers.some((c) => c.id === rawCenterId) ? rawCenterId : null;

  return (
    <div>
      <Link
        href="/payment-methods"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-foreground">
        Thêm phương thức thanh toán
      </h1>

      <PaymentMethodForm centers={centers} defaultCenterId={defaultCenterId} />
    </div>
  );
}
