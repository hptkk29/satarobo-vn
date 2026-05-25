import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { EmailLogStatus, type Prisma } from "@prisma/client";
import {
  EMAIL_LOG_STATUS_LABEL,
  EMAIL_LOG_STATUS_COLOR,
} from "@/lib/validators/email-template";

export const metadata = { title: "Email Logs | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    q?: string;
    status?: string;
    templateId?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 30;
const STATUS_VALUES = Object.values(EmailLogStatus) as EmailLogStatus[];

export default async function EmailLogsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "emails:view"))
    redirect("/dashboard?error=unauthorized");

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const statusParam =
    sp.status && STATUS_VALUES.includes(sp.status as EmailLogStatus)
      ? (sp.status as EmailLogStatus)
      : undefined;
  const templateId = sp.templateId || "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.EmailLogWhereInput = {};
  if (q) {
    where.OR = [
      { toEmail: { contains: q, mode: "insensitive" } },
      { subject: { contains: q, mode: "insensitive" } },
    ];
  }
  if (statusParam) where.status = statusParam;
  if (templateId) where.templateId = templateId;

  const [totalCount, logs, templates] = await Promise.all([
    db.emailLog.count({ where }),
    db.emailLog.findMany({
      where,
      include: {
        template: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.emailTemplate.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function urlFor(
    p: Partial<{
      q: string;
      status: string;
      templateId: string;
      page: number;
    }>,
  ) {
    const u = new URLSearchParams();
    if (p.q) u.set("q", p.q);
    if (p.status) u.set("status", p.status);
    if (p.templateId) u.set("templateId", p.templateId);
    if (p.page && p.page > 1) u.set("page", String(p.page));
    return `/email-logs${u.toString() ? "?" + u.toString() : ""}`;
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Email Logs</h1>
        <p className="text-sm text-gray-600 mt-1">
          Lịch sử email đã gửi qua hệ thống
        </p>
      </div>

      <form className="flex flex-wrap gap-2 items-end p-3 bg-gray-50 rounded">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tìm</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Email hoặc subject..."
            className="px-3 py-1.5 border rounded text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Status</label>
          <select
            name="status"
            defaultValue={statusParam ?? ""}
            className="px-3 py-1.5 border rounded text-sm"
          >
            <option value="">Tất cả</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {EMAIL_LOG_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Template</label>
          <select
            name="templateId"
            defaultValue={templateId}
            className="px-3 py-1.5 border rounded text-sm"
          >
            <option value="">Tất cả</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button className="px-3 py-1.5 bg-gray-800 text-white rounded text-sm">
          Áp dụng
        </button>
      </form>

      <div className="text-sm text-gray-600">
        {totalCount.toLocaleString("vi-VN")} email logs
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2">Thời gian</th>
              <th className="text-left px-3 py-2">Đến</th>
              <th className="text-left px-3 py-2">Subject</th>
              <th className="text-left px-3 py-2">Template</th>
              <th className="text-left px-3 py-2">Trigger</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Người gửi</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  Chưa có email log
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-600">
                  {log.createdAt.toLocaleString("vi-VN")}
                </td>
                <td className="px-3 py-2">
                  <div className="text-sm">{log.toName ?? "—"}</div>
                  <div className="text-xs text-gray-500 font-mono">
                    {log.toEmail}
                  </div>
                </td>
                <td className="px-3 py-2 text-sm">{log.subject}</td>
                <td className="px-3 py-2 text-xs">
                  {log.template ? (
                    <Link
                      href={`/email-templates/${log.template.id}/edit`}
                      className="text-blue-600 hover:underline"
                    >
                      {log.template.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{log.triggerType}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      "px-2 py-0.5 rounded text-xs " +
                      EMAIL_LOG_STATUS_COLOR[log.status]
                    }
                  >
                    {EMAIL_LOG_STATUS_LABEL[log.status]}
                  </span>
                  {log.failureReason && (
                    <div
                      className="text-xs text-red-600 mt-1 max-w-xs truncate"
                      title={log.failureReason}
                    >
                      ⚠ {log.failureReason}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {log.triggeredByName ?? "Hệ thống"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            Trang {page} / {totalPages}
          </div>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={urlFor({ q, status: statusParam, templateId, page: page - 1 })}
                className="px-3 py-1 border rounded hover:bg-gray-50"
              >
                ← Trước
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={urlFor({ q, status: statusParam, templateId, page: page + 1 })}
                className="px-3 py-1 border rounded hover:bg-gray-50"
              >
                Sau →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
