import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { auth } from "@/lib/auth";
import { getParentNotifications } from "@/lib/portal/notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thông báo | Sata Robo", robots: { index: false } };

export default async function ThongBaoPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") redirect("/login");
  const notifications = await getParentNotifications(session.user.id);

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
        <Bell className="h-5 w-5 text-[#7C3AED]" /> Thông báo
      </h1>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có thông báo nào.
        </p>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-neutral-900">{n.title}</h2>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                  {n.scope}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
                {n.body}
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                {new Date(n.publishedAt).toLocaleString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
