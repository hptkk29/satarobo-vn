import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { VoucherForm } from "../../_components/voucher-form";

export const metadata = { title: "Sửa voucher | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditVoucherPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "vouchers:manage")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const voucher = await db.voucher.findUnique({ where: { id } });
  if (!voucher) notFound();

  return (
    <div>
      <Link
        href="/vouchers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-gray-900">{voucher.name}</h1>
      <p className="mb-6 font-mono text-sm text-gray-500">{voucher.code}</p>

      <VoucherForm voucher={voucher} />
    </div>
  );
}
