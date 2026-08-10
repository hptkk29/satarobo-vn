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
 * JWT Supabase không tự chết khi force-logout → mitigation: TTL ngắn
 * + kiểm `tokenVersion` trong DB MỖI LẦN cấp (lệch = phiên đã bị thu hồi).
 */

/** Namespace UUID v5 cố định của cầu chat realtime — chỉ để derive `sub` hợp lệ hình thức. */
const REALTIME_SUB_NAMESPACE = "7d5c1af6-2b4e-4c39-9f1d-8a0e3b6d2c91";

/**
 * TTL vé realtime: **5 phút** (00-dieu-chinh mục B chỉ đặt trần "≤ 15'", đây là chọn chặt hơn).
 *
 * ⛔ ĐỪNG NÂNG LẠI 900s cho "đỡ tốn request". Con số này là CẬN TRÊN của một lỗ rò đã đo:
 * policy RLS trên `realtime.messages` chỉ được đánh giá LÚC JOIN, nên người bị gỡ khỏi
 * nhóm mà cố ý không rời kênh vẫn nhận ĐỦ tin thật, **payload có nguyên trường `body`**,
 * cho tới khi kênh bị dựng lại. Đo thật (scripts/_zztest-chat-ro-giua-phien.ts, LỖ 2):
 * ân hạn ≈ 0 giây, cửa sổ đúng bằng phần đời còn lại của vé — xác nhận chéo 3 TTL
 * (tin cuối ở exp−0,4s / exp−0,1s / exp+0,2s; CLOSED ở exp+0,3..+0,4s).
 *
 * ⚠️ CÓ HAI CẬN TRÊN KHÁC NHAU cho hai kẻ đe doạ — đừng gộp làm một:
 *
 *   • **client SỬA ĐỔI** (đúng mô hình đe doạ của LỖ 2: nó cố tình phớt lờ
 *     `participant.removed`). Nó cũng sẽ không tự gia hạn ⇒ cận trên = ĐÚNG TTL này.
 *     Muốn nghe lâu hơn thì phải JOIN LẠI, mà join lại là policy chạy lại và chặn
 *     (đo: `CHANNEL_ERROR: Unauthorized …`). Nên hằng số này, chứ không phải chu kỳ gia
 *     hạn, mới là thứ chặn kẻ tấn công: 900s → 300s là giảm cửa sổ xấu nhất 3 lần.
 *   • **client THẬT** (không sửa): gia hạn ở 80% TTL, và mỗi lần gia hạn là một chu kỳ
 *     rời-đổi-JOIN LẠI ⇒ cận trên = 0,8 × TTL = 240s.
 *     Đo thật 10/08 (`scripts/_zztest-chat-ro-giua-phien.ts`, phần B5, có đủ đối chứng
 *     dương trong cùng lần chạy — trước gia hạn CÓ rò, nhân chứng nhận 3/3, tai nạn nhân
 *     còn sống): sau MỘT chu kỳ gia hạn, người đã bị gỡ nhận **0/3** tin, và Realtime từ
 *     chối kênh của họ **4,8s** sau lời gọi `applyRealtimeAuth`.
 *
 * ĐÁNH ĐỔI đã cân: gia hạn dày gấp 3 ⇒ mỗi tab xin vé ~1 lần/4 phút cho mỗi bộ hẹn giờ.
 * Trần route là 30 lượt/phút/user (`app/api/chat/realtime-token/route.ts`) nên còn dư rất
 * xa; và tầng kết nối (`lib/chat/supabase-client.ts`) gộp hai bộ hẹn giờ lại thành ~1 chu
 * kỳ rời-join thật sự, nên số lần dựng lại kênh KHÔNG tăng gấp đôi theo số kênh.
 */
export const REALTIME_TOKEN_TTL_SECONDS = 5 * 60;

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
