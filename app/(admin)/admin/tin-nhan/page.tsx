import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listStaffThreads } from "@/lib/comms/messaging";

export const dynamic = "force-dynamic";

// LMS-15 — Hộp thư admin: hội thoại PH trong phạm vi (cơ sở/lớp) của staff.
export default async function AdminMessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const threads = await listStaffThreads(session.user.id);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Tin nhắn phụ huynh</h1>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có hội thoại nào trong phạm vi của bạn.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/tin-nhan/${t.id}`}
                className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {t.studentName} — {t.subject || "(Không tiêu đề)"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t.lastBody}</p>
                </div>
                {t.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                    {t.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
