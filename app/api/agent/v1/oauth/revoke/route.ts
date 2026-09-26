// POST /api/agent/v1/oauth/revoke — agent tự huỷ token đang cầm (spec §7.1).
import { xuLyThuHoiToken } from "@/lib/agents/gateway/cap-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return xuLyThuHoiToken(req);
}
