import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { VoucherForm } from "../../_components/voucher-form";

export const metadata = { title: "Sửa voucher | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditVoucherPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // vouchers:manage chỉ HO_ACCOUNTANT (GLOBAL) — không cần target.
  if (!(await checkPermission("vouchers:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  // Voucher là catalog toàn cục (không scoped) — scopedDb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const voucher = await sdb.voucher.findUnique({ where: { id } });
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
