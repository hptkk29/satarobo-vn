import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ClassGroupForm } from "../_components/class-group-form";

export const metadata = { title: "Thêm nhóm lớp | Admin" };
export const dynamic = "force-dynamic";

export default async function NewClassGroupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "class_group:create")) {
    redirect("/dashboard?error=unauthorized");
  }

  const centers = await db.center.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { displayOrder: "asc" },
  });

  return (
    <div className="p-6">
      <Link
        href="/class-groups"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Thêm nhóm lớp</h1>
      <ClassGroupForm centers={centers} />
    </div>
  );
}
