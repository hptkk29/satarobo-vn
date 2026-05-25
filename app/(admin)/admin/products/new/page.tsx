import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ProductForm } from "../_components/product-form";

export const metadata = { title: "Thêm sản phẩm | Admin" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "products:manage")) {
    redirect("/dashboard?error=unauthorized");
  }

  const zmroboKits = await db.zMRoboKit.findMany({
    where: { isPublished: true },
    select: { id: true, title: true, code: true },
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Thêm sản phẩm</h1>
      <ProductForm zmroboKits={zmroboKits} />
    </div>
  );
}
