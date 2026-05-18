import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { StudentForm } from "../_components/student-form";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "students:create")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const centers = await db.center.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm học viên mới</h1>
      <StudentForm centers={centers} />
    </div>
  );
}
