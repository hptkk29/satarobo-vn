import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { LEAD_STATUS_LABEL, LEAD_STATUS_BADGE } from "@/lib/leads/status";
import type { LeadStatus } from "@prisma/client";
import { LeadActivityPanel } from "./_components/lead-activity-panel";
import { ReassignButton } from "./_components/reassign-button";

export const metadata = { title: "Chi tiết Lead | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canViewAll = can(session.user, "leads:view-all");
  const canViewOwn = can(session.user, "leads:view-own");
  if (!canViewAll && !canViewOwn) redirect("/dashboard");

  const { id } = await params;
  const lead = await db.lead.findFirst({
    where: { id, deletedAt: null },
    include: {
      center: { select: { name: true } },
      course: { select: { name: true } },
      assignedTo: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] },
    },
  });
  if (!lead) notFound();

  // Scope: SALES_CSM chỉ xem lead của mình.
  if (!canViewAll && lead.assignedToId !== session.user.id) {
    redirect("/leads?view=kanban");
  }

  const canAssign = can(session.user, "leads:assign");
  const status = lead.status as LeadStatus;

  return (
    <div className="max-w-6xl p-6">
      <Link
        href="/leads?view=kanban"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">
              {lead.parentName}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEAD_STATUS_BADGE[status]}`}
            >
              {LEAD_STATUS_LABEL[status]}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-600">
            <a href={`tel:${lead.phone}`} className="font-medium text-orange-600">
              {lead.phone}
            </a>
            {lead.email && <span> · {lead.email}</span>}
          </div>
        </div>
        {canAssign && <ReassignButton leadId={lead.id} />}
      </div>

      {/* Info grid */}
      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-4">
        <Info label="Tên con" value={lead.childName} />
        <Info label="Tuổi" value={lead.childAge?.toString() ?? null} />
        <Info label="Khoá quan tâm" value={lead.course?.name ?? lead.source} />
        <Info label="Cơ sở" value={lead.center?.name ?? null} />
        <Info label="Nguồn" value={lead.source} />
        <Info label="Sale phụ trách" value={lead.assignedTo?.name ?? "Chưa gán"} />
        <Info
          label="Ngày tạo"
          value={lead.createdAt.toLocaleDateString("vi-VN")}
        />
        <Info label="Ghi chú" value={lead.note} />
      </dl>

      <LeadActivityPanel
        leadId={lead.id}
        activities={lead.activities.map((a) => ({
          id: a.id,
          type: a.type,
          content: a.content,
          actorName: a.actorName,
          createdAt: a.createdAt.toISOString(),
        }))}
        tasks={lead.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          dueAt: t.dueAt.toISOString(),
          status: t.status,
          assignedToName: t.assignedToName,
          completedAt: t.completedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-800">{value || "—"}</dd>
    </div>
  );
}
