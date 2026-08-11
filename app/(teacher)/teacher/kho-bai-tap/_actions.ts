// app/(teacher)/teacher/kho-bai-tap/_actions.ts — Site GV (L6): "Kho bài tập của tôi".
//
// GV TỰ SOẠN đề (trắc nghiệm + tự luận) → AssignmentTemplate của MÌNH, và tự XOÁ đề
// của mình. KHÁC assignments:create (TRAINING soạn kho toàn hệ thống).
//
// BẢO MẬT:
//   - Gate `assignments:author-own` (capability RIÊNG của GV — xem permissions.ts).
//   - Own-scope qua createdById: mọi đường tạo/xoá gắn/khớp ownerId (employeeId ?? userId).
//     deleteOwnTemplate CHẶN xoá đề admin/Đào tạo (createdById ≠ ownerId).
// AssignmentTemplate/Question/Choice ∉ SCOPED_MODELS → scopedDb pass-through (không
// cần centerId); cách ly ở đây là own-scope, KHÔNG phải cách ly cơ sở.
// KHÔNG import @/lib/db trần (ESLint chặn app/(teacher)/**) — đi qua scopedDb.
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { resolveTemplateOwnerId } from "./_owner";

// ── Zod: source-of-truth cho đề GV tự soạn ──────────────────────────────────
const choiceSchema = z.object({
  text: z.string().trim().min(1, "Lựa chọn không được để trống"),
  isCorrect: z.boolean(),
});

// 1 object + superRefine (KHÔNG discriminatedUnion — member có refine không hợp lệ).
const questionSchema = z
  .object({
    type: z.enum(["MULTIPLE_CHOICE", "ESSAY"]),
    text: z.string().trim().min(1, "Nhập nội dung câu hỏi"),
    choices: z.array(choiceSchema).default([]),
    correctAnswer: z.string().trim().optional().nullable(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "MULTIPLE_CHOICE") {
      if (q.choices.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Câu trắc nghiệm cần ít nhất 2 lựa chọn",
          path: ["choices"],
        });
      }
      if (!q.choices.some((c) => c.isCorrect)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Câu trắc nghiệm cần ít nhất 1 đáp án đúng",
          path: ["choices"],
        });
      }
    }
  });

// BGĐ 31/07 — file+ảnh GV upload trực tiếp (đã PUT lên R2 qua /api/admin/upload-url).
const attachmentSchema = z.object({
  fileUrl: z.string().url("URL tệp không hợp lệ"),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().nullable().optional(),
  mimeType: z.string().max(100).nullable().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề bắt buộc").max(200),
  description: z.string().trim().min(1, "Mô tả bắt buộc"),
  kind: z.enum(["HOMEWORK", "CLASSWORK"]).default("HOMEWORK"),
  totalPoints: z.coerce
    .number()
    .min(0.1, "Tổng điểm phải lớn hơn 0")
    .default(10),
  questions: z.array(questionSchema).min(1, "Cần ít nhất 1 câu hỏi"),
  attachments: z
    .array(attachmentSchema)
    .max(10, "Tối đa 10 tệp đính kèm")
    .default([]),
});

type CreateResult =
  | { ok: true; templateId: string }
  | { ok: false; error: string };
type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * Tạo 1 AssignmentTemplate do GV tự soạn + các Question (+ Choice cho trắc nghiệm)
 * + link AssignmentTemplateQuestion theo thứ tự — TẤT CẢ trong 1 transaction.
 */
export async function createOwnTemplateAction(
  input: unknown,
): Promise<CreateResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  if (!(await checkPermission("assignments:author-own"))) {
    return { ok: false, error: "Không có quyền soạn bài" };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const data = parsed.data;

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const { ownerId, employeeId } = await resolveTemplateOwnerId(
    sdb,
    session.user.id,
  );

  let templateId: string;
  try {
    templateId = await sdb.$transaction(async (tx) => {
      const tpl = await tx.assignmentTemplate.create({
        data: {
          title: data.title,
          description: data.description,
          kind: data.kind,
          totalPoints: data.totalPoints,
          allowText: true,
          allowFile: true,
          createdById: ownerId, // CHỦ SỞ HỮU — khớp filter "Kho của tôi"
        },
        select: { id: true },
      });

      // BGĐ 31/07 — file+ảnh đề bài GV upload trực tiếp.
      if (data.attachments.length > 0) {
        await tx.assignmentAttachment.createMany({
          data: data.attachments.map((f) => ({
            templateId: tpl.id,
            fileUrl: f.fileUrl,
            fileName: f.fileName,
            fileSize: f.fileSize ?? null,
            mimeType: f.mimeType ?? null,
            uploadedById: session.user.id,
          })),
        });
      }

      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i]!;
        const isMcq = q.type === "MULTIPLE_CHOICE";
        const created = await tx.question.create({
          data: {
            type: q.type,
            text: q.text,
            // Tự luận: đáp án mẫu (tuỳ chọn). Trắc nghiệm: đáp án nằm ở Choice.isCorrect.
            correctAnswer: !isMcq ? q.correctAnswer?.trim() || null : null,
            isPublic: false,
            authorId: employeeId, // FK Employee — null nếu GV chưa gắn hồ sơ nhân sự
            ...(isMcq
              ? {
                  choices: {
                    create: q.choices.map((c, idx) => ({
                      order: idx,
                      text: c.text,
                      isCorrect: c.isCorrect,
                    })),
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        await tx.assignmentTemplateQuestion.create({
          data: { templateId: tpl.id, questionId: created.id, order: i },
        });
      }

      return tpl.id;
    });
  } catch (err) {
    console.error("[createOwnTemplateAction]", err);
    return { ok: false, error: "Lỗi cơ sở dữ liệu — không lưu được bài" };
  }

  try {
    const { actorId, actorName } = getAuditActor(session);
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "assignments",
      entityType: "AssignmentTemplate",
      entityId: templateId,
      action: "assignment-template.authored-by-teacher",
      newValues: {
        title: data.title,
        kind: data.kind,
        questions: data.questions.length,
      },
    });
  } catch (err) {
    console.error("[createOwnTemplateAction] audit:", err);
  }

  revalidatePath("/kho-bai-tap");
  revalidatePath("/teacher/kho-bai-tap");
  revalidatePath("/cham-bai");
  revalidatePath("/teacher/cham-bai");
  return { ok: true, templateId };
}

/**
 * Xoá 1 đề GV tự soạn. CHỈ đề của MÌNH (createdById = ownerId) — chặn xoá đề
 * admin/Đào tạo. Dọn luôn Question mồ côi (assignmentId null) + Choice (cascade).
 * Bài ĐÃ GIAO cho lớp (Assignment) không ảnh hưởng: câu hỏi đã được CLONE sang bản
 * riêng (assignmentId set) + Assignment.templateId onDelete=SetNull.
 */
export async function deleteOwnTemplateAction(
  templateId: string,
): Promise<DeleteResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!templateId) return { ok: false, error: "Thiếu mã đề" };

  if (!(await checkPermission("assignments:author-own"))) {
    return { ok: false, error: "Không có quyền" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const { ownerId } = await resolveTemplateOwnerId(sdb, session.user.id);

  const tpl = await sdb.assignmentTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, createdById: true, title: true },
  });
  if (!tpl) return { ok: false, error: "Không tìm thấy đề" };
  if (tpl.createdById !== ownerId) {
    return { ok: false, error: "Chỉ xoá được đề bạn tự soạn" };
  }

  try {
    await sdb.$transaction(async (tx) => {
      const links = await tx.assignmentTemplateQuestion.findMany({
        where: { templateId },
        select: { questionId: true },
      });
      // Xoá template → cascade AssignmentTemplateQuestion; Assignment.templateId → null.
      await tx.assignmentTemplate.delete({ where: { id: templateId } });
      const qids = links.map((l) => l.questionId);
      if (qids.length > 0) {
        // Chỉ dọn câu hỏi mồ côi của template (chưa gắn Assignment nào) — cascade Choice.
        await tx.question.deleteMany({
          where: { id: { in: qids }, assignmentId: null },
        });
      }
    });
  } catch (err) {
    console.error("[deleteOwnTemplateAction]", err);
    return { ok: false, error: "Lỗi — không xoá được đề" };
  }

  try {
    const { actorId, actorName } = getAuditActor(session);
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "assignments",
      entityType: "AssignmentTemplate",
      entityId: templateId,
      action: "assignment-template.deleted-by-teacher",
      oldValues: { title: tpl.title },
    });
  } catch (err) {
    console.error("[deleteOwnTemplateAction] audit:", err);
  }

  revalidatePath("/kho-bai-tap");
  revalidatePath("/teacher/kho-bai-tap");
  revalidatePath("/cham-bai");
  revalidatePath("/teacher/cham-bai");
  return { ok: true };
}
