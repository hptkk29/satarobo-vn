import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { CreateTrialClassForm } from "../_components/create-form";

export const metadata = { title: "Tạo lớp trải nghiệm | Admin" };
export const dynamic = "force-dynamic";

export default async function NewTrialClassPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "trials:manage")) redirect("/trial-classes");

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Cơ sở actor được phép tạo lớp (cách ly cơ sở).
  // GV dùng nguồn DUY NHẤT getAssignableTeachers (fix #9 — trước đây query strict
  // `roles has TEACHER` chỉ thấy 2 người, lọt GV chỉ có TeacherProfile ACTIVE).
  const [centers, rooms, teachers, configs] = await Promise.all([
    sdb.center.findMany({
      where: { isActive: true, id: { in: actor.visibleCenterIds } },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    sdb.room.findMany({
      where: { status: "ACTIVE" },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, code: true, centerId: true },
    }),
    getAssignableTeachers(),
    sdb.trialProgramConfig.findMany({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, sessionCount: true },
    }),
  ]);

  return (
    <div className="max-w-3xl p-6">
      <Link
        href="/trial-classes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Tạo lớp trải nghiệm</h1>

      <CreateTrialClassForm
        centers={centers}
        rooms={rooms.map((r) => ({
          id: r.id,
          label: `${r.name} (${r.code})`,
          centerId: r.centerId,
        }))}
        teachers={teachers.map((t) => ({ id: t.id, name: t.name ?? "(chưa đặt tên)" }))}
        configs={configs}
      />
    </div>
  );
}
