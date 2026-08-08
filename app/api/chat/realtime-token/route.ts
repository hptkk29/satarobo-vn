import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mintRealtimeToken, RealtimeTokenError } from "@/lib/chat/realtime-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * US-02 — Cấp JWT ngắn hạn (15') cho client subscribe Supabase Realtime
 * private channel. Mọi role đăng nhập đều cấp được — quyền đọc THẬT nằm ở
 * policy RLS participant trên `realtime.messages`, không ở đây.
 * `mintRealtimeToken` tự kiểm tokenVersion trong DB (force-logout → 401).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  try {
    const { token, expiresAt } = await mintRealtimeToken({
      id: session.user.id,
      tokenVersion: session.user.tokenVersion,
    });
    return NextResponse.json(
      { token, expiresAt: expiresAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof RealtimeTokenError) {
      if (e.code === "MISSING_SECRET") {
        console.error("[chat/realtime-token] thiếu SUPABASE_JWT_SECRET");
        return NextResponse.json(
          { error: "Realtime chưa được cấu hình" },
          { status: 503 },
        );
      }
      // USER_NOT_FOUND / TOKEN_VERSION_MISMATCH — phiên không còn hiệu lực.
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }
}
