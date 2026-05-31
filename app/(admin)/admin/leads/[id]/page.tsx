import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { LEAD_STATUS_LABEL, LEAD_STATUS_BADGE } from "@/lib/leads/status";
import { TRIAL_STATUS_LABEL, TRIAL_STATUS_BADGE } from "@/lib/trials/status";
import type { LeadStatus } from "@prisma/client";
import { LeadActivityPanel } from "./_components/lead-activity-panel";
import { ReassignButton } from "./_components/reassign-button";
import { AssignSelect } from "./_components/assign-select";
import { TransferDialog } from "./_components/transfer-dialog";
import { CloseDealButton } from "./_components/close-deal-button";

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
      trialClasses: {
        orderBy: { scheduledAt: "desc" },
        include: {
          teacher: { select: { name: true } },
          feedback: { select: { id: true } },
        },
      },
    },
  });
  if (!lead) notFound();

  // Scope: SALES_CSM chỉ xem lead của mình.
  if (!canViewAll && lead.assignedToId !== session.user.id) {
    redirect("/leads?view=kanban");
  }

  const canAssign = can(session.user, "leads:assign");
  const canCloseDeal =
    can(session.user, "students:create") && can(session.user, "enrollments:create");
  const status = lead.status as LeadStatus;

  // PHẦN 2 — danh sách sale để gán tay (ưu tiên sale cùng cơ sở lead).
  const assignableSales = canAssign
    ? await db.user.findMany({
        where: {
          roles: { has: "SALES_CSM" },
          isActive: true,
          deletedAt: null,
          ...(lead.centerId ? { centerId: lead.centerId } : {}),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // PHẦN 3 — chuyển lead: sale tự chuyển (cần leads:edit). Mọi cơ sở + mọi sale.
  const canTransfer = can(session.user, "leads:edit");
  const [transferCenters, transferSales] = canTransfer
    ? await Promise.all([
        db.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
        db.user.findMany({
          where: { roles: { has: "SALES_CSM" }, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, centerId: true },
        }),
      ])
    : [[], []];
  const dealClosable =
    canCloseDeal && status !== "ENROLLED" && status !== "LOST" && status !== "DUPLICATE";

  // Lớp đang mở để chọn khi chốt deal (ưu tiên cùng cơ sở với lead).
  const classOptions = dealClosable
    ? await db.class.findMany({
        where: {
          deletedAt: null,
          status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] },
          ...(lead.centerId ? { centerId: lead.centerId } : {}),
        },
        select: {
          id: true,
          name: true,
          classCode: true,
          course: { select: { price: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

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
        <div className="flex items-center gap-2">
          {canAssign && (
            <AssignSelect
              leadId={lead.id}
              sales={assignableSales}
              current={lead.assignedToId}
            />
          )}
          {canTransfer && (
            <TransferDialog
              leadId={lead.id}
              centers={transferCenters}
              sales={transferSales}
              currentCenterId={lead.centerId}
              currentSaleId={lead.assignedToId}
            />
          )}
          {canAssign && <ReassignButton leadId={lead.id} />}
        </div>
      </div>

      {/* PHẦN 3 — note bàn giao nổi bật */}
      {lead.handoverNote && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Bàn giao — đã tư vấn</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{lead.handoverNote}</p>
        </div>
      )}

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

      {/* Chốt deal (Phase T1.5) */}
      {dealClosable && (
        <div className="mb-6">
          <CloseDealButton
            leadId={lead.id}
            defaultStudentName={lead.childName ?? `Con của ${lead.parentName}`}
            defaultParentEmail={lead.email ?? null}
            classes={classOptions.map((c) => ({
              id: c.id,
              label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
              price: c.course?.price ?? null,
            }))}
          />
        </div>
      )}

      {/* Học thử (Phase T1.4) */}
      {lead.trialClasses.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Buổi học thử</h2>
            <Link href="/trials" className="text-xs font-medium text-orange-600 hover:underline">
              Quản lý ở mục Học thử →
            </Link>
          </div>
          <ul className="space-y-2">
            {lead.trialClasses.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TRIAL_STATUS_BADGE[t.status]}`}
                  >
                    {TRIAL_STATUS_LABEL[t.status]}
                  </span>
                  <span className="text-gray-700">
                    {t.scheduledAt.toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {t.teacher?.name && (
                    <span className="text-gray-500">· GV: {t.teacher.name}</span>
                  )}
                </div>
                {t.feedback ? (
                  <span className="text-xs font-medium text-indigo-600">
                    Đã có nhận xét
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Chưa nhận xét</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
