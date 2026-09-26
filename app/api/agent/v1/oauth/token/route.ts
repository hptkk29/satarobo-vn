// POST /api/agent/v1/oauth/token — cấp token cho agent (OAuth client_credentials, spec §4.2).
// Route MỎNG: mọi kiểm tra ở `lib/agents/gateway/cap-token.ts` (spec §2 — không logic riêng).
import { xuLyCapToken } from "@/lib/agents/gateway/cap-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return xuLyCapToken(req);
}
