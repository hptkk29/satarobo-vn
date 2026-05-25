import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { TemplateForm } from "../_components/template-form";

export const metadata = { title: "Thêm email template | Admin" };
export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "emails:manage"))
    redirect("/dashboard?error=unauthorized");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Thêm email template</h1>
      <TemplateForm />
    </div>
  );
}
