"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  emailTemplateSchema,
  TRIGGER_VARIABLES,
} from "@/lib/validators/email-template";
import { extractVariables } from "@/lib/email/render";

async function requireEmailsManage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "emails:manage"))
    redirect("/dashboard?error=unauthorized");
  return session;
}

export async function createTemplateAction(input: unknown) {
  await requireEmailsManage();
  const parsed = emailTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const data = parsed.data;

  const existing = await db.emailTemplate.findUnique({
    where: { code: data.code },
  });
  if (existing)
    return { ok: false as const, error: `Code "${data.code}" đã tồn tại` };

  const usedVars = new Set([
    ...extractVariables(data.subject),
    ...extractVariables(data.bodyText),
    ...extractVariables(data.bodyHtml),
  ]);
  const allowedVars = new Set(TRIGGER_VARIABLES[data.trigger]);
  const unknown = Array.from(usedVars).filter((v) => !allowedVars.has(v));
  if (data.trigger !== "MANUAL" && unknown.length > 0) {
    return {
      ok: false as const,
      error: `Biến không hợp lệ cho trigger ${data.trigger}: ${unknown.join(", ")}. Hợp lệ: ${TRIGGER_VARIABLES[data.trigger].join(", ")}`,
    };
  }

  const template = await db.emailTemplate.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      trigger: data.trigger,
      isActive: data.isActive,
      subject: data.subject,
      bodyText: data.bodyText,
      bodyHtml: data.bodyHtml,
      availableVariables:
        data.availableVariables.length > 0
          ? data.availableVariables
          : Array.from(usedVars),
      fromName: data.fromName ?? null,
      replyTo: data.replyTo ?? null,
    },
  });

  revalidatePath("/email-templates");
  return { ok: true as const, templateId: template.id };
}

export async function updateTemplateAction(id: string, input: unknown) {
  await requireEmailsManage();
  const parsed = emailTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const data = parsed.data;

  const existing = await db.emailTemplate.findUnique({ where: { id } });
  if (!existing)
    return { ok: false as const, error: "Template không tồn tại" };

  if (data.code !== existing.code) {
    return {
      ok: false as const,
      error: "Không thể sửa code sau khi tạo (tránh break trigger)",
    };
  }

  const usedVars = new Set([
    ...extractVariables(data.subject),
    ...extractVariables(data.bodyText),
    ...extractVariables(data.bodyHtml),
  ]);
  const allowedVars = new Set(TRIGGER_VARIABLES[data.trigger]);
  const unknown = Array.from(usedVars).filter((v) => !allowedVars.has(v));
  if (data.trigger !== "MANUAL" && unknown.length > 0) {
    return {
      ok: false as const,
      error: `Biến không hợp lệ: ${unknown.join(", ")}. Hợp lệ: ${TRIGGER_VARIABLES[data.trigger].join(", ")}`,
    };
  }

  await db.emailTemplate.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description ?? null,
      trigger: data.trigger,
      isActive: data.isActive,
      subject: data.subject,
      bodyText: data.bodyText,
      bodyHtml: data.bodyHtml,
      availableVariables:
        data.availableVariables.length > 0
          ? data.availableVariables
          : Array.from(usedVars),
      fromName: data.fromName ?? null,
      replyTo: data.replyTo ?? null,
    },
  });

  revalidatePath("/email-templates");
  revalidatePath(`/email-templates/${id}`);
  revalidatePath(`/email-templates/${id}/edit`);
  return { ok: true as const, templateId: id };
}

export async function toggleTemplateActiveAction(id: string) {
  await requireEmailsManage();
  const existing = await db.emailTemplate.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!existing)
    return { ok: false as const, error: "Template không tồn tại" };

  await db.emailTemplate.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });

  revalidatePath("/email-templates");
  return { ok: true as const, isActive: !existing.isActive };
}

export async function deleteTemplateAction(id: string) {
  await requireEmailsManage();
  const logCount = await db.emailLog.count({ where: { templateId: id } });
  if (logCount > 0) {
    return {
      ok: false as const,
      error: `Template đã có ${logCount} email logs. Đặt isActive=false thay vì xoá.`,
    };
  }
  await db.emailTemplate.delete({ where: { id } });
  revalidatePath("/email-templates");
  return { ok: true as const };
}
