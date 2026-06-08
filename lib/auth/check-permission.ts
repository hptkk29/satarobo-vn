// lib/auth/check-permission.ts — A0-03: điểm vào RUNTIME thống nhất cho quyền.
// Chạy can() v1 (matrix) + can() v2 (actor) SONG SONG, log lệch (shadow), trả kết
// quả theo cờ RBAC_V2_ENABLED. API mới cho code mới; callsite cũ migrate ở Phase C.
// KHÔNG đổi hành vi prod khi flag OFF (vẫn dùng v1). Lõi thuần ở permission-eval.ts.
import { auth } from "@/lib/auth";
import { resolveActor, type Target } from "@/lib/auth/actor";
import { PermissionError } from "@/lib/auth/can";
import { isRbacV2Enabled } from "@/lib/flags";
import { evaluatePermission } from "@/lib/auth/permission-eval";

export { evaluatePermission };

/** Runtime: lấy session + resolveActor (1 query/request) → evaluatePermission. */
export async function checkPermission(action: string, target?: Target): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  const actor = await resolveActor(session.user.id);
  return evaluatePermission({
    sessionUser: session.user,
    actor,
    action,
    target,
    flagOn: isRbacV2Enabled(),
  });
}

/** Ném PermissionError nếu không đủ quyền (dùng đầu Server Action/route). */
export async function assertPermission(action: string, target?: Target): Promise<void> {
  if (!(await checkPermission(action, target))) throw new PermissionError();
}
