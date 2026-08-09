import { withCron } from "@/lib/cron/handler";
import { reconcileConversationMembership } from "@/lib/chat/reconcile-membership";

export const dynamic = "force-dynamic";

// US-04 — Đối soát thành viên nhóm chat hằng đêm, 02:00 VN (vercel.json: 0 19 * * * UTC).
// Lưới cuối cho drift khi một luồng đổi dữ liệu lớp không đi qua sync (US-03):
// REMOVE tự thi hành (rò rỉ quyền không sống qua đêm), ADD chỉ log chờ người.
// withCron = verifyCronAuth (CRON_SECRET, sai/thiếu → 401 trước mọi việc) + try/catch
// JSON có cấu trúc (API-18). Không auto-retry — đêm sau chạy lại là đủ (cron.md).
// Kill switch: xoá entry cron trên Vercel — hệ chạy tiếp, chỉ mất lưới đối soát.
export const GET = withCron("chat-membership-reconcile", async () => ({
  ok: true,
  data: await reconcileConversationMembership(),
}));
