"use server";

// lib/eval/session-eval-actions.ts — FL4-01: server actions cho GV điền phiếu
// đánh giá BUỔI HỌC (SESSION_EVAL). GV chỉ ĐIỀN; cấu hình form/đợt nằm ở
// app/(admin)/admin/evaluations (gate evaluations:manage). Hai action:
//  - loadSessionEvalAction: nạp phiếu đang áp cho buổi + đáp án đã lưu.
//  - saveSessionEvalAction: lưu phiếu theo từng HS (idempotent round×buổi×HS).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/auth/permissions";
import {
  getSessionEvalState,
  saveSessionEvalResponses,
  type SessionEvalState,
} from "@/lib/eval/session-eval";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Gate ĐIỀN phiếu buổi: GV chính/trợ giảng của lớp, CENTER_MANAGER cùng cơ sở,
 * hoặc SUPER_ADMIN/TRAINING. Mirror canManageSessionClass (LMS-2) nhưng cho phép
 * thêm TRAINING (Đào tạo có thể điền/sửa hộ).
 */
async function gateFill(
  sessionId: string,
): Promise<{ ok: true; classCenterId: string | null } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const sess = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, class: { select: { teacherId: true, assistantId: true, centerId: true } } },
  });
  if (!sess) return { ok: false, error: "Buổi học không tồn tại" };

  const u = session.user;
  const cls = sess.class;
  const allowed =
    hasRole(u, "SUPER_ADMIN") ||
    hasRole(u, "TRAINING") ||
    (hasRole(u, "CENTER_MANAGER") && !!cls.centerId && cls.centerId === u.centerId) ||
    (hasRole(u, "TEACHER") && (cls.teacherId === u.id || cls.assistantId === u.id));

  if (!allowed) return { ok: false, error: "Không có quyền điền phiếu buổi học này" };
  return { ok: true, classCenterId: cls.centerId };
}

/** Nạp phiếu SESSION_EVAL đang áp cho buổi (kèm đáp án đã lưu). */
export async function loadSessionEvalAction(sessionId: string): Promise<Result<SessionEvalState>> {
  const g = await gateFill(sessionId);
  if (!g.ok) return g;
  const state = await getSessionEvalState(sessionId);
  return { ok: true, data: state };
}

const saveSchema = z.object({
  sessionId: z.string().min(1),
  roundId: z.string().min(1),
  submissions: z
    .array(
      z.object({
        studentId: z.string().min(1),
        answers: z.array(
          z.object({
            questionId: z.string().min(1),
            valueNumber: z.number().int().nullable().optional(),
            valueOptions: z.array(z.string()).nullable().optional(),
            valueText: z.string().nullable().optional(),
          }),
        ),
      }),
    )
    .max(100),
});

/** Lưu phiếu SESSION_EVAL theo từng HS cho 1 buổi. */
export async function saveSessionEvalAction(input: unknown): Promise<Result<{ saved: number }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };

  const g = await gateFill(parsed.data.sessionId);
  if (!g.ok) return g;

  // Lấy form/đợt ĐANG ÁP từ server (không tin client). Đợt phải còn MỞ + khớp buổi,
  // và roundId client gửi phải trùng → chặn ghi vào đợt đã đóng/đổi giữa chừng.
  const state = await getSessionEvalState(parsed.data.sessionId);
  if (!state.active) return { ok: false, error: "Buổi học chưa có phiếu đánh giá đang mở" };
  if (state.roundId !== parsed.data.roundId) {
    return { ok: false, error: "Đợt đánh giá đã thay đổi — vui lòng tải lại phiếu" };
  }

  const res = await saveSessionEvalResponses(
    state.roundId,
    parsed.data.sessionId,
    state.questions,
    parsed.data.submissions.map((s) => ({
      studentId: s.studentId,
      answers: s.answers.map((a) => ({
        questionId: a.questionId,
        valueNumber: a.valueNumber ?? null,
        valueOptions: a.valueOptions ?? null,
        valueText: a.valueText ?? null,
      })),
    })),
  );
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(`/sessions/${parsed.data.sessionId}`);
  return { ok: true, data: { saved: res.saved } };
}
