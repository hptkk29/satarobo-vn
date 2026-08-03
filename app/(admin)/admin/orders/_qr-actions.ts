"use server";

// _qr-actions.ts — bridge server actions cho UI "Xuất QR theo từng đợt".
//
// File RIÊNG, không đụng orders/_actions.ts (agent khác giữ). Logic thật nằm ở
// ./_qr-core.ts — ở đây CHỈ có: auth() → checkPermission("orders:manage") →
// resolveActor() → gọi core. Core nhận `actor` tường minh nên KHÔNG được export từ
// file "use server" này (mọi export của "use server" là HTTP endpoint; client forge
// actor = leo quyền). Cách ly cơ sở do scopedDb trong core lo (phiếu cơ sở khác →
// "không tìm thấy", không lộ là nó tồn tại).

import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getAuditActor } from "@/lib/audit/log";
import { issueQrForRequestCore, regenerateQrCore, type QrIssueResult } from "./_qr-core";

async function withGate(
  run: (
    actor: Awaited<ReturnType<typeof resolveActor>>,
    auditActor: { id: string | null; name: string },
  ) => Promise<QrIssueResult>,
): Promise<QrIssueResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // orders:manage — GLOBAL (không cần target); cách ly cơ sở đã do scopedDb trong core.
  if (!(await checkPermission("orders:manage"))) {
    return { ok: false, error: "Không có quyền xuất QR thanh toán" };
  }
  const actor = await resolveActor(session.user.id);
  const { actorId, actorName } = getAuditActor(session);
  return run(actor, { id: actorId, name: actorName });
}

/** Xuất QR cho 1 phiếu thu. Còn QR ACTIVE chưa hết hạn → trả lại chính phiên đó. */
export async function issueQrForRequest(input: {
  paymentRequestId: string;
}): Promise<QrIssueResult> {
  return withGate((actor, auditActor) =>
    issueQrForRequestCore(actor, auditActor, { paymentRequestId: input.paymentRequestId }),
  );
}

/**
 * Tạo lại QR: hết hạn mọi phiên cũ, mở phiên mới TRÊN CÙNG phiếu thu.
 * `matchKey` của phiếu KHÔNG đổi → tiền của QR cũ vẫn rơi đúng đợt.
 */
export async function regenerateQr(input: {
  paymentRequestId: string;
}): Promise<QrIssueResult> {
  return withGate((actor, auditActor) =>
    regenerateQrCore(actor, auditActor, { paymentRequestId: input.paymentRequestId }),
  );
}
