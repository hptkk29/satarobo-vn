import { db } from "@/lib/db";
import { sendEmail } from "./send";
import { renderTemplate } from "./render";
import type { Prisma } from "@prisma/client";

// =============================================================================
// Cụm A2 — Email queue.
// enqueueEmail(): chỉ TẠO bản ghi PENDING (gọi an toàn trong/ngoài transaction
// nghiệp vụ — KHÔNG gửi ngay). processEmailQueue(): worker/cron gửi + retry.
// =============================================================================

type Vars = Record<string, string | number | null | undefined>;

export interface EnqueueEmailInput {
  to: string;
  toName?: string | null;
  /** EmailTemplate.code để render qua template. */
  templateKey?: string | null;
  /** Inline fallback khi không dùng template (subject/body có thể chứa {{var}}). */
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  vars?: Vars;
  scheduledAt?: Date;
  context?: { type: string; id: string };
}

/** Đẩy 1 email vào hàng đợi (status PENDING). Không gửi. */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<{ ok: boolean; id?: string }> {
  const to = input.to?.trim();
  if (!to) return { ok: false };
  const row = await db.emailQueue.create({
    data: {
      toEmail: to,
      toName: input.toName ?? null,
      templateKey: input.templateKey ?? null,
      subject: input.subject ?? null,
      bodyText: input.bodyText ?? null,
      bodyHtml: input.bodyHtml ?? null,
      payload: (input.vars ?? {}) as Prisma.InputJsonValue,
      contextType: input.context?.type ?? null,
      contextId: input.context?.id ?? null,
      scheduledAt: input.scheduledAt ?? new Date(),
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export interface ProcessResult {
  processed: number;
  sent: number;
  failed: number;
}

/**
 * Worker: lấy tối đa `limit` email PENDING đến hạn, render + gửi.
 * Thành công → SENT; lỗi → tăng attempts (giữ PENDING để retry), vượt maxAttempts → FAILED.
 */
export async function processEmailQueue(limit = 25): Promise<ProcessResult> {
  const now = new Date();
  const rows = await db.emailQueue.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const vars = (row.payload ?? {}) as Vars;

    // Resolve subject/body: ưu tiên template theo code, fallback inline.
    let subject = row.subject ?? "";
    let bodyText = row.bodyText ?? "";
    let bodyHtml = row.bodyHtml ?? "";
    let templateId: string | null = null;
    let fromName: string | null = null;
    let replyTo: string | null = null;

    if (row.templateKey) {
      const tpl = await db.emailTemplate.findUnique({ where: { code: row.templateKey } });
      if (tpl && tpl.isActive) {
        subject = tpl.subject;
        bodyText = tpl.bodyText;
        bodyHtml = tpl.bodyHtml;
        templateId = tpl.id;
        fromName = tpl.fromName;
        replyTo = tpl.replyTo;
      }
    }

    subject = renderTemplate(subject, vars);
    bodyText = renderTemplate(bodyText, vars);
    bodyHtml = renderTemplate(bodyHtml || `<pre>${bodyText}</pre>`, vars);

    if (!subject || !bodyText) {
      // Thiếu nội dung (không template, không inline) → FAILED, không retry.
      await db.emailQueue.update({
        where: { id: row.id },
        data: { status: "FAILED", error: "Thiếu template/nội dung email", attempts: { increment: 1 } },
      });
      failed++;
      continue;
    }

    const result = await sendEmail({
      to: row.toEmail,
      toName: row.toName ?? undefined,
      subject,
      bodyText,
      bodyHtml,
      fromName: fromName ?? undefined,
      replyTo: replyTo ?? undefined,
      templateId,
      contextType: row.contextType,
      contextId: row.contextId,
      triggerType: "SYSTEM",
    });

    if (result.ok) {
      await db.emailQueue.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), emailLogId: result.logId, error: null },
      });
      sent++;
    } else {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= row.maxAttempts;
      await db.emailQueue.update({
        where: { id: row.id },
        data: {
          attempts,
          error: result.error,
          status: exhausted ? "FAILED" : "PENDING",
          // Lùi lịch retry ~5' mỗi lần.
          scheduledAt: exhausted ? row.scheduledAt : new Date(Date.now() + 5 * 60_000),
        },
      });
      failed++;
    }
  }

  return { processed: rows.length, sent, failed };
}

/** Gửi lại 1 email FAILED (reset về PENDING). */
export async function retryEmailQueueItem(id: string): Promise<void> {
  await db.emailQueue
    .update({ where: { id }, data: { status: "PENDING", attempts: 0, error: null, scheduledAt: new Date() } })
    .catch(() => {});
}
