"use server";

// R7-07 (PR2) — "Hoàn tất buổi": server-action mỏng (auth + can + scope cơ sở).
// Logic ở lib/lms/session-lifecycle.ts. Gác sau flag SESSION_LIFECYCLE_V2 ở UI.
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { completeSession, type CompleteSessionResult } from "@/lib/lms/session-lifecycle";

/** Buổi ∈ cơ sở actor? (qua lớp chứa nó). */
async function resolveSessionScope(
  actor: Actor,
  sessionId: string,
): Promise<{ ok: true; classId: string } | { ok: false; error: string }> {
  const sdb = scopedDb(actor);
  const s = await sdb.classSession.findUnique({
    where: { id: sessionId },
    select: { classId: true, class: { select: { centerId: true } } },
  });
  if (!s) return { ok: false, error: "Không tìm thấy buổi học" };
  if (!passesScope("Class", { centerId: s.class?.centerId ?? null }, actor)) {
    return { ok: false, error: "Lớp không thuộc cơ sở bạn quản lý" };
  }
  return { ok: true, classId: s.classId };
}

export async function completeSessionAction(
  sessionId: string,
  input: {
    actualTeacherId?: string | null;
    actualRoomId?: string | null;
    actualStartAt?: string | null;
    actualEndAt?: string | null;
    classComment?: string | null;
    confirmNoAttendance?: boolean;
  },
): Promise<CompleteSessionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Chưa đăng nhập" };
  // GV phụ trách hoặc quản lý đều có thể đóng buổi → dùng sessions:edit.
  if (!can(session.user, "sessions:edit")) {
    return { ok: false, error: "Không có quyền hoàn tất buổi" };
  }

  const actor = await resolveActor(session.user.id);
  const sc = await resolveSessionScope(actor, sessionId);
  if (!sc.ok) return { ok: false, error: sc.error };

  const { actorId, actorName } = getAuditActor(session);

  const toDate = (v: string | null | undefined): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const res = await completeSession({
    sessionId,
    actualTeacherId: input.actualTeacherId ?? null,
    actualRoomId: input.actualRoomId ?? null,
    actualStartAt: toDate(input.actualStartAt),
    actualEndAt: toDate(input.actualEndAt),
    classComment: input.classComment ?? null,
    confirmNoAttendance: input.confirmNoAttendance ?? false,
    actorId,
    actorName,
  });

  if (res.ok) {
    revalidatePath(`/classes/${sc.classId}/edit`);
    revalidatePath("/sessions");
  }
  return res;
}
