import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { CreateTrialClassForm } from "../_components/create-form";

export const metadata = { title: "Tạo lớp trải nghiệm | Admin" };
export const dynamic = "force-dynamic";

export default async function NewTrialClassPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:manage"))) redirect("/trial-classes");

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  // Scope per-model của Class cho picker GV (vá 24/07) — actor kiểu Toại
  // (TRAINING@HO + CM@CS1) chỉ thấy GV CS1, hết bày GV CS2.
  const classCenters = getModelVisibleCenterIds("Class", actor);

  // Cơ sở actor được phép tạo lớp (cách ly cơ sở).
  // GV dùng nguồn DUY NHẤT getAssignableTeachers (fix #9 — trước đây query strict
  // `roles has TEACHER` chỉ thấy 2 người, lọt GV chỉ có TeacherProfile ACTIVE).
  const [centers, rooms, teachers, activeConfig] = await Promise.all([
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
    // R2-RBAC-3 + vá 24/07 — GV theo scope per-model của Class ("ALL" → như cũ theo
    // visibleCenterIds); form lọc tiếp theo cơ sở đang chọn ở client.
    // 06/08 - GV la nguon luc chung (Hoi so dieu di moi co so): KHONG loc danh
    // sach theo co so nua, neu khong CS2 khong bao gio toi duoc form va bo loc
    // phia client co mo cung vo nghia.
    getAssignableTeachers({}),
    // FL-R2: số buổi nhập trong form; chỉ lấy 1 config active làm gợi ý mặc định (nếu có).
    sdb.trialProgramConfig.findFirst({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
      select: { sessionCount: true },
    }),
  ]);

  return (
    <div className="max-w-3xl p-6">
      <Link
        href="/trial-classes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Tạo lớp trải nghiệm</h1>

      <CreateTrialClassForm
        centers={centers}
        rooms={rooms.map((r) => ({
          id: r.id,
          label: `${r.name} (${r.code})`,
          centerId: r.centerId,
        }))}
        teachers={teachers.map((t) => ({
          id: t.id,
          name: t.name ?? "(chưa đặt tên)",
          centerId: t.centerId,
        }))}
        defaultSessionCount={activeConfig?.sessionCount ?? 2}
      />
    </div>
  );
}
