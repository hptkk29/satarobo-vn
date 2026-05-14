import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { TimelineAdminClient } from "@/components/admin/honors/timeline-admin-client";

export const metadata = { title: "Timeline | Hall of Fame" };

export default async function TimelineAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["SUPER_ADMIN", "MANAGER"].includes(session.user.role)) {
    redirect("/admin/dashboard");
  }

  const items = await db.timelineItem.findMany({
    orderBy: { occurredAt: "asc" },
  });

  const canDelete = session.user.role === "SUPER_ADMIN";

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Timeline công ty</h1>
        <p className="mt-1 text-sm text-gray-500">
          Các mốc thời gian quan trọng của Sata Robo — hiển thị ở cuối trang /vinh-danh.
        </p>
      </div>

      <TimelineAdminClient items={items} canDelete={canDelete} />
    </div>
  );
}
