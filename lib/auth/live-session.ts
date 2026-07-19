import "server-only";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * SEC-M11 — Xác thực phiên còn "SỐNG" so với DB (không chỉ tin JWT). JWT mặc định 30d;
 * revocation (isActive/tokenVersion) trước đây chỉ enforce ở RSC layout, KHÔNG ở API Route
 * Handler → JWT trộm/stale của user đã bị disable / đổi role / thu quyền vẫn gọi được API
 * tới hết hạn tự nhiên. Helper này mang logic layout sang Route Handler nhạy cảm:
 * user bị disable / soft-delete / bump tokenVersion → chặn NGAY. Trả null nếu phiên chết.
 *
 * ⚠️ Thêm 1 DB query/call → chỉ dùng cho route NHẠY CẢM (export PII, tài chính, asset nội
 * bộ), KHÔNG rải lên mọi API. (Rút ngắn maxAge JWT = Q26, tách riêng.)
 */
export async function requireLiveSession(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, tokenVersion: true, deletedAt: true },
  });
  if (!dbUser || dbUser.deletedAt || !dbUser.isActive) return null;
  if (dbUser.tokenVersion !== session.user.tokenVersion) return null;
  return session;
}
