import { type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { ok, fail } from "@/lib/api/response";
import { runDynamicAudienceSync } from "@/lib/elearning/dynamic-audience-run";
import { isElearningEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

// EL-05 — chạy lại tập ĐỘNG mỗi đêm: ai mới khớp luật thì được giao, ai rời tập
// thì REVOKED với lý do "rời tập luật".
//
// Trả về `choDuLieuNhanSu` KÈM TÊN, không chỉ con số: đây là nhóm dễ trôi nhất
// của cả module, vì đường này không ai bấm nút nên không ai đọc thông báo.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return fail("UNAUTHENTICATED", "Không có quyền gọi tác vụ nền", { status: 401 });
  }
  if (!isElearningEnabled()) return ok({ skipped: "flag OFF" });
  return ok(await runDynamicAudienceSync());
}
