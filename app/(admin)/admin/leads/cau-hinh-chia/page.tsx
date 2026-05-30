import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ModeSelector } from "./_components/mode-selector";

export const metadata = { title: "Cấu hình chia lead | Admin" };
export const dynamic = "force-dynamic";

export default async function AssignConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "leads:assign")) redirect("/leads");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER") && !isSuper;

  const centers = await db.center.findMany({
    where: { isActive: true, ...(isCM && session.user.centerId ? { id: session.user.centerId } : {}) },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });
  const configs = await db.leadAssignmentConfig.findMany({
    where: { centerId: { in: centers.map((c) => c.id) } },
    select: { centerId: true, mode: true },
  });
  const modeByCenter = new Map(configs.map((c) => [c.centerId, c.mode]));

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Settings2 className="h-6 w-6 text-[#7C3AED]" /> Cấu hình chia lead
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Chọn cách chia lead trong cơ sở. Lead chưa chọn cơ sở được chia đều CS1/CS2 trước. Lead đã
          có tương tác (gọi/nhắn/ghi chú) sẽ không bị tự động chia lại.
        </p>
      </div>

      {centers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có cơ sở trong phạm vi.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {centers.map((c) => (
            <ModeSelector
              key={c.id}
              centerId={c.id}
              centerName={c.name}
              current={modeByCenter.get(c.id) ?? "ROUND_ROBIN"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
