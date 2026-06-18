import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveStudent } from "@/lib/portal/session";
import { getParentThread } from "@/lib/comms/messaging";
import { MessageForm } from "../_components/message-form";

export const dynamic = "force-dynamic";

// LMS-15 — 1 hội thoại + trả lời (PH).
export default async function PortalThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await requireActiveStudent();
  const messages = await getParentThread(ctx.parentUserId, id);
  if (!messages) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/portal/tin-nhan" className="text-sm text-orange-600">
        ← Quay lại
      </Link>

      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.mine ? "ml-auto bg-orange-100" : "mr-auto bg-muted"
            }`}
          >
            <p className="mb-0.5 text-xs font-medium text-muted-foreground">
              {m.senderName} · {new Date(m.createdAt).toLocaleString("vi-VN")}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có tin nhắn.</p>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <MessageForm threadId={id} />
      </div>
    </div>
  );
}
