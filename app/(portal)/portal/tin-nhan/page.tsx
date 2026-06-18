import Link from "next/link";
import { requireActiveStudent } from "@/lib/portal/session";
import { listParentThreads } from "@/lib/comms/messaging";
import { MessageForm } from "./_components/message-form";

export const dynamic = "force-dynamic";

// LMS-15 — Hộp thư PH ↔ GV/Trung tâm (theo con đang chọn).
export default async function PortalMessagesPage() {
  const { ctx } = await requireActiveStudent();
  const threads = await listParentThreads(ctx.parentUserId);
  const activeName = ctx.activeStudent?.name ?? "con";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Tin nhắn</h1>
        <p className="text-sm text-muted-foreground">
          Trao đổi 2 chiều với giáo viên / trung tâm về {activeName}.
        </p>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Gửi tin mới</h2>
        <MessageForm withSubject />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Hội thoại</h2>
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có hội thoại nào.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/portal/tin-nhan/${t.id}`}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t.subject || "(Không tiêu đề)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{t.lastBody}</p>
                  </div>
                  {t.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">
                      {t.unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
