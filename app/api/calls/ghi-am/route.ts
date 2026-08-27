import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { ok, fail } from "@/lib/api/response";
import { capVeNgheGhiAm } from "@/lib/calls/nghe-ghi-am";
import { isOmicallEnabled } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OC-3 / QT-36 — ĐIỂM KIỂM QUYỀN DUY NHẤT để nghe lại ghi âm.
//
// Route này KHÔNG trả tệp và KHÔNG trả liên kết của nhà cung cấp. Nó trả một URL
// đã ký, hạn ngắn, trỏ vào bucket R2 RIÊNG — sau khi đã ghi một dòng `AuditLog`
// cho lượt nghe (`lib/calls/nghe-ghi-am.ts` giữ đúng thứ tự audit-trước-cấp-sau).
//
// POST chứ không GET: lượt nghe đòi LÝ DO (≥10 ký tự) và là hành vi có ghi vết —
// không để nó nằm trong lịch sử trình duyệt hay được prefetch.
export async function POST(req: NextRequest) {
  if (!isOmicallEnabled()) {
    return fail("NOT_FOUND", "Không tìm thấy", { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return fail("UNAUTHENTICATED", "Chưa đăng nhập", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const actor = await resolveActor(session.user.id);
  const kq = await capVeNgheGhiAm(actor, session.user.name ?? session.user.email ?? "", body);

  if (!kq.ok) {
    const status =
      kq.ma === "PERMISSION_DENIED"
        ? 403
        : kq.ma === "CALL_NOT_FOUND" || kq.ma === "RECORDING_NOT_FOUND"
          ? 404
          : kq.ma === "AUDIT_FAILED" || kq.ma === "STORAGE_NOT_CONFIGURED"
            ? 503
            : 400;
    return fail(kq.ma, kq.thongDiep, { status, field: kq.field });
  }

  // `no-store`: cache KHÔNG được sống lâu hơn vé. Đường phát SCORM từng đặt
  // `max-age=3600` trong khi vé sống 600s — tệp còn tải được sau khi vé hết hạn,
  // tức vé mất tác dụng đúng lúc nó cần có.
  return ok(kq.data, { headers: { "Cache-Control": "no-store" } });
}
