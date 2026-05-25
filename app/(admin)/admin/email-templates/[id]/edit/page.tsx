import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { TemplateForm } from "../../_components/template-form";

export const metadata = { title: "Sửa email template | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "emails:manage"))
    redirect("/dashboard?error=unauthorized");

  const { id } = await params;
  const template = await db.emailTemplate.findUnique({ where: { id } });
  if (!template) notFound();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Sửa template: {template.name}</h1>
      <TemplateForm
        initial={{
          id: template.id,
          code: template.code,
          name: template.name,
          description: template.description ?? "",
          trigger: template.trigger,
          isActive: template.isActive,
          subject: template.subject,
          bodyText: template.bodyText,
          bodyHtml: template.bodyHtml,
          fromName: template.fromName ?? "",
          replyTo: template.replyTo ?? "",
        }}
      />
    </div>
  );
}
