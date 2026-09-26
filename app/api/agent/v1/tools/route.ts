// POST /api/agent/v1/tools — danh sách công cụ TOKEN NÀY được dùng, kèm JSON Schema tham số
// (spec §7.1). Không liệt kê công cụ không được cấp.
import { xuLyDanhSachCongCu } from "@/lib/agents/gateway/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return xuLyDanhSachCongCu(req);
}
