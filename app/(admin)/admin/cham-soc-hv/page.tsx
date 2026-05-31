import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { CompleteCareButton } from "../canh-bao-rui-ro/_components/alert-actions";

export const metadata = { title: "Chăm sóc học viên | Admin" };
export const dynamic = "force-dynamic";

export default async function CareTaskPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "students:view-all") && !hasRole(session.user, "SALES_CSM")) redirect("/dashboard");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");
  const isSalesOnly = hasRole(session.user, "SALES_CSM") && !isSuper && !isCM;
  const centerScope = isCM && !isSuper ? session.user.centerId : null;

  const where: Prisma.StudentCareTaskWhereInput = isSalesOnly
    ? { status: "OPEN", assignedToId: session.user.id }
    : { status: "OPEN", ...(centerScope ? { centerId: centerScope } : {}) };

  const tasks = await db.studentCareTask.findMany({
    where,
    orderBy: { dueAt: "asc" },
    take: 200,
    select: { id: true, title: true, description: true, dueAt: true, student: { select: { id: true, name: true } } },
  });
  const now = new Date();

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <HeartHandshake className="h-6 w-6 text-[#7C3AED]" /> Việc chăm sóc học viên
        </h1>
        <p className="mt-1 text-sm text-gray-500">Task chăm sóc phát sinh từ cảnh báo rủi ro / sau đăng ký.</p>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có việc chăm sóc nào.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{t.title}</p>
                <p className="text-xs text-gray-500">
                  <Link href={`/students/${t.student.id}/edit`} className="text-[#7C3AED] hover:underline">{t.student.name}</Link>
                  {" · "}hạn {new Date(t.dueAt).toLocaleDateString("vi-VN")}
                  {t.dueAt < now && <span className="ml-1 font-semibold text-rose-600">(quá hạn)</span>}
                </p>
              </div>
              <CompleteCareButton id={t.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
