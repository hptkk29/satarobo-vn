import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getStaffThread } from "@/lib/comms/messaging";
import { ReplyForm } from "../_components/reply-form";

export const dynamic = "force-dynamic";

// LMS-15 — 1 hội thoại + trả lời (admin).
export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const messages = await getStaffThread(session.user.id, id);
  if (!messages) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/admin/tin-nhan" className="text-sm text-blue-600">
        ← Quay lại hộp thư
      </Link>

      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.mine ? "ml-auto bg-blue-100" : "mr-auto bg-muted"
            }`}
          >
            <p className="mb-0.5 text-xs font-medium text-muted-foreground">
              {m.senderName} ({m.senderRole === "PARENT" ? "PH" : "TT"}) ·{" "}
              {new Date(m.createdAt).toLocaleString("vi-VN")}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có tin nhắn.</p>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <ReplyForm threadId={id} />
      </div>
    </div>
  );
}
