import "server-only";
import { SignJWT } from "jose";
import { v5 as uuidv5 } from "uuid";
import { db } from "@/lib/db";

/**
 * US-02 — Cầu JWT Auth.js → Supabase Realtime (docs/chat-realtime/00 mục B).
 *
 * Repo KHÔNG dùng Supabase Auth: `User.id` là cuid, không có `auth.users`.
 * Server tự ký JWT HS256 ngắn hạn bằng `SUPABASE_JWT_SECRET` để client
 * subscribe private channel. Policy RLS trên `realtime.messages` đọc claim
 * **`app_user_id`** (cuid) — TUYỆT ĐỐI không dùng `auth.uid()` (cast cuid →
 * uuid sẽ lỗi). `sub` chỉ là UUID v5 derive từ `User.id` cho hợp lệ hình thức.
 *
 * JWT Supabase không tự chết khi force-logout → mitigation: TTL ngắn (15')
 * + kiểm `tokenVersion` trong DB MỖI LẦN cấp (lệch = phiên đã bị thu hồi).
 */

/** Namespace UUID v5 cố định của cầu chat realtime — chỉ để derive `sub` hợp lệ hình thức. */
const REALTIME_SUB_NAMESPACE = "7d5c1af6-2b4e-4c39-9f1d-8a0e3b6d2c91";

/** TTL token: 15 phút (00-dieu-chinh mục B — TTL ≤ 15'). */
export const REALTIME_TOKEN_TTL_SECONDS = 15 * 60;

export class RealtimeTokenError extends Error {
  constructor(
    /** Mã lỗi EN, message VI (quy ước API contract). */
    public readonly code: "USER_NOT_FOUND" | "TOKEN_VERSION_MISMATCH" | "MISSING_SECRET",
    message: string,
  ) {
    super(message);
    this.name = "RealtimeTokenError";
  }
}

export type RealtimeTokenUser = {
  /** `User.id` (cuid) từ session Auth.js. */
  id: string;
  /** `tokenVersion` trong session — so với DB để phát hiện force-logout. */
  tokenVersion: number;
};

export type RealtimeToken = {
  token: string;
  expiresAt: Date;
};

/** `sub` hợp lệ hình thức cho Supabase — UUID v5 derive từ cuid, KHÔNG dùng trong policy. */
export function deriveRealtimeSub(userId: string): string {
  return uuidv5(userId, REALTIME_SUB_NAMESPACE);
}

/**
 * Ký JWT HS256 cho Supabase Realtime. Từ chối khi user không còn hiệu lực
 * hoặc `tokenVersion` trong DB đã lệch với session (bị force-logout).
 */
export async function mintRealtimeToken(user: RealtimeTokenUser): Promise<RealtimeToken> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new RealtimeTokenError("MISSING_SECRET", "Thiếu cấu hình SUPABASE_JWT_SECRET");
  }

  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { tokenVersion: true, isActive: true, deletedAt: true },
  });
  if (!fresh || fresh.deletedAt || !fresh.isActive) {
    throw new RealtimeTokenError("USER_NOT_FOUND", "Tài khoản không còn hiệu lực");
  }
  if (fresh.tokenVersion !== user.tokenVersion) {
    throw new RealtimeTokenError(
      "TOKEN_VERSION_MISMATCH",
      "Phiên đăng nhập đã bị thu hồi — vui lòng đăng nhập lại",
    );
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + REALTIME_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({
    // Claim policy RLS đọc (auth.jwt() ->> 'app_user_id') — cuid thật của User.
    app_user_id: user.id,
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(deriveRealtimeSub(user.id))
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

  return { token, expiresAt: new Date(exp * 1000) };
}
