import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ClassGroupForm } from "../../_components/class-group-form";

export const metadata = { title: "Sửa nhóm lớp | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditClassGroupPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "class_group:edit")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const [group, centers] = await Promise.all([
    db.classGroup.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        displayCode: true,
        name: true,
        centerId: true,
        status: true,
        notes: true,
      },
    }),
    db.center.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);
  if (!group) notFound();

  return (
    <div className="p-6">
      <Link
        href={`/class-groups/${group.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Sửa nhóm lớp: {group.displayCode}</h1>
      <ClassGroupForm group={group} centers={centers} />
    </div>
  );
}
