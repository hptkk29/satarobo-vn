import { checkPermission } from "@/lib/auth/check-permission";
import {
  getConversationMembers,
  getMessagesPage,
  listConversationsForUser,
} from "@/lib/chat/queries";
import { listAnnouncements } from "@/lib/chat/announcements";
import { dmWitnessClassId } from "@/lib/chat/dm";
import { listChatAttachments } from "@/lib/chat/messages";
import { ChatThread } from "@/components/chat/staff/chat-thread";
import type { StaffChatMember, StaffChatMessage } from "@/components/chat/staff/types";

// E-04 — RSC dựng nội dung hội thoại cho panel trên dashboard.
//
// 🔴 BẢN CHÉP CÓ CHỦ ĐÍCH của `ThreadPanel` trong `components/chat/staff/chat-workspace.tsx`.
// `ThreadPanel` là hàm PRIVATE của file đó (không export) và nhận `basePath` để dựng ba
// link điều hướng. Xuất nó ra để dùng lại nghĩa là chạm `components/chat/**` — thứ E-04
// cam kết **0 dòng sửa**. Chép là cái giá đã cân nhắc.
//
// ⚠️ Bản chép này PHẢI đi cùng bản gốc ở ba chỗ dễ trôi lệch nhất; sửa một bên thì sửa cả hai:
//   1. `sendClassId` — hội thoại 1-1 có `subjectType = NONE` nên không có `subjectId` làm
//      `classId`; nguồn đúng là LỚP LÀM CHỨNG (`dmWitnessClassId`), y hệt `sendTargetOf`
//      ở server. Thiếu nó là ô nhập XÁM trong mọi hội thoại riêng.
//   2. `createdById: userId` trong `sendTarget` — `chat:send` của Sale là scope **OWN**,
//      mà nhánh OWN đòi `target.createdById === actor.userId`. Bỏ khoá này là dựng một
//      target NGHÈO HƠN server ⇒ ô nhập xám trong khi Server Action vẫn cho gửi.
//      ⚠️ Và nó KHÔNG lộ ở máy local: local chạy RBAC v1 (ma trận tĩnh, không có scope)
//      nên `chat:send` luôn true. Chỉ prod mới xám.
//   3. `groupTarget` KHÔNG dùng lớp làm chứng — server cố ý không dùng nó cho 1-1. Hai
//      target khác nhau là CÓ CHỦ ĐÍCH, đừng gộp cho gọn.
//
// 🔴 BA PROP ĐIỀU HƯỚNG trỏ về CHÍNH URL hiện tại (`stayHref`). `ChatThread` render chúng
// thành `<Link>` thật, nên trỏ đi đâu khác là người dùng RỜI dashboard — đúng thứ E-04
// sinh ra để tránh. Đánh đổi đã biết: "N thành viên" và "Xem tất cả thông báo" thành nút
// chết trong panel. Chấp nhận cho P0; muốn dùng thật thì thêm prop OPTIONAL vào
// `ChatThreadProps`, và đó là ngoại lệ DUY NHẤT được phép chạm `components/chat/**`.

/** Lý do vô hiệu ô nhập KHÔNG-PHẢI-KHOÁ (LOCKED đi đường riêng qua `initialLocked`). */
function disabledReasonOf(status: string): string | null {
  return status === "ARCHIVED" ? "Hội thoại đã lưu trữ" : null;
}

export async function DashboardThreadPanel({
  userId,
  conversationId,
  stayHref,
}: {
  userId: string;
  conversationId: string;
  /** URL hiện tại (đã kèm `?chat=<id>` + mọi tham số lọc) — ba link điều hướng trỏ về đây. */
  stayHref: string;
}) {
  // Danh sách hội thoại của CHÍNH người xem là chốt chặn quyền đọc: id không thuộc họ
  // thì không tìm thấy và panel báo "không mở được". Đây là lý do KHÔNG truy vấn
  // `Conversation` theo id trực tiếp — làm thế là bỏ mất lớp kiểm tư cách thành viên.
  const conversations = await listConversationsForUser(userId);
  const selected = conversations.find((c) => c.conversationId === conversationId) ?? null;
  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Không mở được hội thoại này — có thể bạn không còn là thành viên.
      </div>
    );
  }

  const classId = selected.type === "CLASS_GROUP" ? selected.subjectId : null;
  const sendClassId =
    selected.type === "CLASS_GROUP" ? classId : await dmWitnessClassId(conversationId, userId);
  const sendTarget = { classId: sendClassId, centerId: selected.centerId, createdById: userId };
  const groupTarget = { classId, centerId: selected.centerId };

  const [page, memberViews, pinnedPage, canSend, canAnnounce, canModerate] = await Promise.all([
    getMessagesPage(conversationId, userId),
    getConversationMembers(conversationId, userId),
    listAnnouncements(conversationId, userId, { limit: 1 }),
    checkPermission("chat:send", sendTarget),
    checkPermission("chat:announce", groupTarget),
    checkPermission("chat:moderate", groupTarget),
  ]);

  // KHÔNG kèm `contact`: mọi thứ truyền vào `ChatThread` (Client Component) đều đi xuống
  // trình duyệt trong payload RSC. Dữ liệu không dùng tới mà vẫn gửi là rò rỉ vô cớ.
  const members: StaffChatMember[] = memberViews.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    roleLabel: m.roleLabel,
  }));

  const pinnedRaw = pinnedPage.announcements.find((a) => !a.deleted) ?? null;
  const initialAttachments = await listChatAttachments(
    conversationId,
    userId,
    page.messages.map((m) => m.id),
  );

  return (
    <ChatThread
      key={conversationId}
      conversationId={conversationId}
      currentUserId={userId}
      title={selected.displayName}
      subtitle={selected.type === "CLASS_GROUP" ? "Nhóm lớp" : "Hội thoại riêng"}
      initialMessages={page.messages as StaffChatMessage[]}
      initialAttachments={initialAttachments}
      initialHasMore={page.hasMore}
      initialCursor={page.nextCursor}
      members={members}
      capabilities={{ canSend, canAnnounce, canModerate }}
      pinnedAnnouncement={(pinnedRaw as StaffChatMessage | null) ?? null}
      disabledReason={disabledReasonOf(selected.status)}
      initialLocked={selected.status === "LOCKED"}
      announcementsHref={stayHref}
      membersHref={stayHref}
      backHref={stayHref}
    />
  );
}
