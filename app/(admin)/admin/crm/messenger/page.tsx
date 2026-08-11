import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskPhone } from "@/lib/lead/pii";
import { canViewLeadPii } from "@/lib/auth/check-permission";
import { Badge } from "@/components/ui/badge";
import { ReplyBox } from "./_components/reply-box";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox Messenger | Admin" };

export default async function MessengerInboxPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // C3.3 — không có quyền lead/CRM → không vào inbox.
  if (!(await checkPermission("leads:view-all")) && !(await checkPermission("leads:view-own"))) {
    redirect("/admin/dashboard");
  }

  const actor = await resolveActor(session.user.id);
  const conversations = await scopedDb(actor).messengerConversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
  });

  // #11 T2 — SĐT là PII lead: mask ở SERVER cho actor không có leads:view-pii
  // (vd MARKETING). Nội dung tin nhắn cuối GIỮ nguyên — nghiệp vụ inbox cần đọc.
  const canViewPii = await canViewLeadPii();

  return (
    <div>
      <h1 className="mb-6 flex items-center gap-2 text-3xl font-black text-foreground">
        <MessageCircle className="h-7 w-7 text-primary" />
        Inbox Messenger
      </h1>

      {conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có hội thoại nào trong phạm vi của bạn.</p>
      ) : (
        <div className="space-y-4">
          {conversations.map((c) => (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold text-foreground">
                  {c.parentName ?? `PSID ${c.psid.slice(0, 8)}`}
                  {c.phone ? (
                    <span className="ml-2 text-sm text-muted-foreground">
                      {canViewPii ? c.phone : maskPhone(c.phone)}
                    </span>
                  ) : null}
                </div>
                <Badge variant={c.status === "QUALIFIED" ? "default" : "secondary"}>{c.status}</Badge>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                {c.messages[0]?.text ?? <span className="italic text-muted-foreground">(chưa có tin nhắn)</span>}
              </p>
              <ReplyBox conversationId={c.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
