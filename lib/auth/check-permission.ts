// lib/auth/check-permission.ts — A0-03: điểm vào RUNTIME thống nhất cho quyền.
// Chạy can() v1 (matrix) + can() v2 (actor) SONG SONG, log lệch (shadow), trả kết
// quả theo cờ RBAC_V2_ENABLED. API mới cho code mới; callsite cũ migrate ở Phase C.
// KHÔNG đổi hành vi prod khi flag OFF (vẫn dùng v1). Lõi thuần ở permission-eval.ts.
import { auth } from "@/lib/auth";
import { resolveActor, type Target } from "@/lib/auth/actor";
import { PermissionError } from "@/lib/auth/can";
import { isRbacV2Enabled } from "@/lib/flags";
import { evaluatePermission } from "@/lib/auth/permission-eval";
import { recordPermissionShadow } from "@/lib/auth/shadow-report";

export { evaluatePermission };

function targetKey(target?: Target): string | null {
  if (!target) return null;
  return target.centerId ?? target.classId ?? target.createdById ?? null;
}

/** Runtime: lấy session + resolveActor (1 query/request) → evaluatePermission.
 *  R6-F2: persist shadow-diff khi v1≠v2 (fire-and-forget) để dựng report bật flag. */
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
    onEvaluated: ({ v1, v2 }) => {
      if (v1 !== v2) {
        void recordPermissionShadow({ action, userId: actor.userId, v1, v2, targetKey: targetKey(target) });
      }
    },
  });
}

/** Ném PermissionError nếu không đủ quyền (dùng đầu Server Action/route). */
export async function assertPermission(action: string, target?: Target): Promise<void> {
  if (!(await checkPermission(action, target))) throw new PermissionError();
}
