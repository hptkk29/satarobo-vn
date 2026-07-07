import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import { EmailTemplateTrigger } from "@prisma/client";
import { EMAIL_TRIGGER_LABEL } from "@/lib/validators/email-template";

export const metadata = { title: "Email Templates | Admin" };
export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("emails:view")))
    redirect("/dashboard?error=unauthorized");

  const canManage = await checkPermission("emails:manage");

  // EmailTemplate là model global (∉ SCOPED_MODELS) → sdb pass-through.
  const actor = await resolveActor(session.user.id);
  const templates = await scopedDb(actor).emailTemplate.findMany({
    orderBy: [{ trigger: "asc" }, { name: "asc" }],
  });

  const byTrigger = new Map<EmailTemplateTrigger, typeof templates>();
  for (const t of templates) {
    if (!byTrigger.has(t.trigger)) byTrigger.set(t.trigger, []);
    byTrigger.get(t.trigger)!.push(t);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-sm text-gray-600 mt-1">
            Mẫu email tự động + thủ công. Trigger integration sẽ active từ
            Sprint 5.13.1.
          </p>
        </div>
        {canManage && (
          <Link href="/email-templates/new">
            <button className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus size={16} /> Thêm template
            </button>
          </Link>
        )}
      </div>

      <div className="text-sm text-gray-600">{templates.length} templates</div>

      {Array.from(byTrigger.entries()).map(([trigger, items]) => (
        <section key={trigger} className="space-y-2">
          <h2 className="font-semibold text-sm text-gray-700">
            {EMAIL_TRIGGER_LABEL[trigger]}
          </h2>
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2">Code</th>
                  <th className="text-left px-3 py-2">Tên</th>
                  <th className="text-left px-3 py-2">Tiêu đề</th>
                  <th className="text-right px-3 py-2">Đã gửi</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-3 py-2 font-medium">
                      <Link
                        href={`/email-templates/${t.id}/edit`}
                        className="hover:underline"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {t.subject}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.sentCount.toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2">
                      {t.isActive ? (
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          Hoạt động
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                          Tắt
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage && (
                        <Link
                          href={`/email-templates/${t.id}/edit`}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Sửa
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {templates.length === 0 && (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded">
          Chưa có template nào. Tạo template đầu tiên hoặc đợi seed từ Sprint
          5.13.1.
        </div>
      )}
    </div>
  );
}
