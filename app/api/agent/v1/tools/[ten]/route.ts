// POST /api/agent/v1/tools/{ten_cong_cu} — gọi một công cụ, body `{ "tham_so": { … } }`.
// Mọi lời gọi là POST với tham số trong BODY: URL bị ghi vào log truy cập của Vercel/CDN
// (spec §7.1). Tên công cụ trên URL không phải dữ liệu nhạy cảm.
import { xuLyGoiCongCu } from "@/lib/agents/gateway/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ ten: string }> }): Promise<Response> {
  const { ten } = await params;
  // Không decode: tên công cụ chỉ gồm [a-z0-9_.], không cần mã hoá; tên lạ ⇒ 404 ở pipeline.
  return xuLyGoiCongCu(req, ten);
}
