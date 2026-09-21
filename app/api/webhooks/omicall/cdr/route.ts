import { NextResponse, type NextRequest } from "next/server";
import { xuLyWebhookCdr } from "@/lib/calls/webhook";
import { isOmicallEnabled } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook nhận bản ghi cuộc gọi (CDR) của OmiCall.
//
// Toàn bộ chuỗi 7 bước nằm ở `lib/calls/webhook.ts` (chép khuôn
// `lib/lead/webhook.ts:260-338`). Route này CỐ Ý mỏng: nó chỉ là cửa HTTP.
//
// ⚠️ Cờ `OMICALL_ENABLED` mặc định OFF ⇒ endpoint trả 404 như thể không tồn tại.
// Chọn 404 chứ không 503: khi tính năng chưa bật thì không có lý do gì để lộ ra
// rằng địa chỉ này có thật.
export async function POST(req: NextRequest) {
  if (!isOmicallEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const kq = await xuLyWebhookCdr(req);
  return NextResponse.json(kq.body, { status: kq.httpStatus });
}
