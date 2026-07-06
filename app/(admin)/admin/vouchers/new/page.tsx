import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { VoucherForm } from "../_components/voucher-form";

export const metadata = { title: "Tạo voucher | Admin" };
export const dynamic = "force-dynamic";

export default async function NewVoucherPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // vouchers:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("vouchers:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }

  return (
    <div>
      <Link
        href="/vouchers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">Tạo voucher mới</h1>

      <VoucherForm />
    </div>
  );
}
