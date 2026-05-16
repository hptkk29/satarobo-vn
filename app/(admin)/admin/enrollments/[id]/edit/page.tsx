import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRightLeft, ChevronLeft, ClipboardList, History } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ChangeStatusDialog } from "../../_components/change-status-dialog";
import { TransferDialog } from "../../_components/transfer-dialog";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "HR", "SALES"];
const AUDIT_VIEWER_ROLES = new Set(["SUPER_ADMIN", "MANAGER"]);
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "WITHDREW",
  "TRANSFERRED",
  "CANCELLED",
]);
const CAPACITY_COUNT_STATUSES = ["PENDING", "CONFIRMED", "STUDYING", "ACTIVE"];

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chờ xếp", color: "bg-gray-100 text-gray-700" },
  CONFIRMED: { label: "Đã xếp", color: "bg-amber-100 text-amber-700" },
  STUDYING: { label: "Đang học", color: "bg-green-100 text-green-700" },
  PAUSED: { label: "Bảo lưu", color: "bg-yellow-100 text-yellow-700" },
  COMPLETED: { label: "Hoàn thành", color: "bg-blue-100 text-blue-700" },
  WITHDREW: { label: "Đã rút", color: "bg-red-100 text-red-700" },
  TRANSFERRED: { label: "Đã chuyển", color: "bg-purple-100 text-purple-700" },
  ACTIVE: { label: "Đang học (legacy)", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Đã huỷ", color: "bg-red-100 text-red-700" },
};

function fmtDateTime(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditEnrollmentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const canViewAudit = AUDIT_VIEWER_ROLES.has(session.user.role);

  const enrollment = await db.enrollment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      notes: true,
      enrolledAt: true,
      confirmedAt: true,
      startedAt: true,
      endedAt: true,
      transferReason: true,
      transferredToId: true,
      student: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          studentCode: true,
          parentName: true,
          parentPhone: true,
          phone: true,
        },
      },
      class: {
        select: {
          id: true,
          name: true,
          classCode: true,
          status: true,
          startDate: true,
          scheduleDays: true,
          startTime: true,
          endTime: true,
          center: { select: { name: true } },
          room: { select: { code: true } },
          course: { select: { name: true } },
          teacher: { select: { name: true } },
        },
      },
    },
  });
  if (!enrollment) notFound();

  const isTerminal = TERMINAL_STATUSES.has(enrollment.status);
  const statusInfo =
    STATUS_INFO[enrollment.status] ?? {
      label: enrollment.status,
      color: "bg-gray-100 text-gray-500",
    };

  const [targetClasses, auditLogs] = await Promise.all([
    db.class.findMany({
      where: {
        deletedAt: null,
        id: { not: enrollment.class.id },
        status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        classCode: true,
        status: true,
        maxStudents: true,
        center: { select: { name: true } },
        _count: {
          select: {
            enrollments: {
              where: { status: { in: CAPACITY_COUNT_STATUSES as never[] } },
            },
          },
        },
      },
      take: 200,
    }),
    canViewAudit
      ? db.enrollmentAuditLog.findMany({
          where: { enrollmentId: id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            changedByName: true,
            reason: true,
            extraData: true,
            createdAt: true,
          },
        })
      : Promise.resolve([] as never[]),
  ]);

  const scheduleDaysText = enrollment.class.scheduleDays?.length
    ? enrollment.class.scheduleDays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d])
        .join(" · ")
    : "—";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/enrollments"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900">
            <ClipboardList className="h-6 w-6 text-[#7C3AED]" />
            Đăng ký: {enrollment.student.name}
          </h1>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusInfo.color}`}
          >
            {statusInfo.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Student card */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">
            Học viên
          </h2>
          <div className="flex items-start gap-3">
            {enrollment.student.avatarUrl ? (
              <img
                src={enrollment.student.avatarUrl}
                alt={enrollment.student.name}
                className="h-14 w-14 rounded-full border border-neutral-200 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-lg font-bold text-neutral-500">
                {enrollment.student.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <div className="text-lg font-bold text-neutral-900">
                {enrollment.student.name}
              </div>
              {enrollment.student.studentCode && (
                <div className="text-xs text-neutral-400 tabular-nums">
                  {enrollment.student.studentCode}
                </div>
              )}
              {enrollment.student.parentName && (
                <div className="mt-1 text-sm text-neutral-700">
                  PH: {enrollment.student.parentName}
                  {enrollment.student.parentPhone &&
                    ` · ${enrollment.student.parentPhone}`}
                </div>
              )}
              <Link
                href={`/admin/students/${enrollment.student.id}/edit`}
                className="mt-2 inline-block text-xs font-semibold text-[#7C3AED] hover:underline"
              >
                Mở hồ sơ học viên →
              </Link>
            </div>
          </div>
        </section>

        {/* Class card */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">
            Lớp học
          </h2>
          <div className="text-lg font-bold text-neutral-900">
            {enrollment.class.name}
          </div>
          {enrollment.class.classCode && (
            <div className="text-xs text-neutral-400 tabular-nums">
              {enrollment.class.classCode}
            </div>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-neutral-500">Khoá</dt>
            <dd className="text-neutral-900">{enrollment.class.course.name}</dd>
            <dt className="text-neutral-500">Cơ sở</dt>
            <dd className="text-neutral-900">
              {enrollment.class.center?.name ?? "—"}
              {enrollment.class.room?.code &&
                ` · P. ${enrollment.class.room.code}`}
            </dd>
            <dt className="text-neutral-500">GV chính</dt>
            <dd className="text-neutral-900">
              {enrollment.class.teacher?.name ?? "—"}
            </dd>
            <dt className="text-neutral-500">Lịch</dt>
            <dd className="text-neutral-900">
              {scheduleDaysText}
              {enrollment.class.startTime && enrollment.class.endTime
                ? ` · ${enrollment.class.startTime}–${enrollment.class.endTime}`
                : ""}
            </dd>
            <dt className="text-neutral-500">Khai giảng</dt>
            <dd className="text-neutral-900">{fmtDate(enrollment.class.startDate)}</dd>
          </dl>
          <Link
            href={`/admin/classes/${enrollment.class.id}/edit`}
            className="mt-3 inline-block text-xs font-semibold text-[#7C3AED] hover:underline"
          >
            Mở chi tiết lớp →
          </Link>
        </section>
      </div>

      {/* Timeline */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">
          Mốc thời gian
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <dt className="text-neutral-500">Ngày đăng ký</dt>
          <dd className="text-neutral-900 tabular-nums">
            {fmtDateTime(enrollment.enrolledAt)}
          </dd>
          <dt className="text-neutral-500">Xác nhận xếp lớp</dt>
          <dd className="text-neutral-900 tabular-nums">
            {fmtDateTime(enrollment.confirmedAt)}
          </dd>
          <dt className="text-neutral-500">Bắt đầu học</dt>
          <dd className="text-neutral-900 tabular-nums">
            {fmtDateTime(enrollment.startedAt)}
          </dd>
          <dt className="text-neutral-500">Kết thúc</dt>
          <dd className="text-neutral-900 tabular-nums">
            {fmtDateTime(enrollment.endedAt)}
          </dd>
        </dl>
        {enrollment.transferReason && (
          <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
            <div className="flex items-center gap-1 font-semibold text-purple-800">
              <ArrowRightLeft className="h-4 w-4" /> Đã chuyển lớp
            </div>
            <div className="mt-1 text-purple-700">
              Lý do: {enrollment.transferReason}
            </div>
            {enrollment.transferredToId && (
              <Link
                href={`/admin/enrollments/${enrollment.transferredToId}/edit`}
                className="mt-1 inline-block text-xs font-semibold text-purple-800 hover:underline"
              >
                Mở enrollment mới →
              </Link>
            )}
          </div>
        )}
        {enrollment.notes && (
          <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            <strong className="text-neutral-900">Ghi chú:</strong> {enrollment.notes}
          </div>
        )}
      </section>

      {/* Actions */}
      {!isTerminal ? (
        <section className="flex flex-wrap gap-3">
          <ChangeStatusDialog
            enrollmentId={enrollment.id}
            currentStatus={enrollment.status}
            studentName={enrollment.student.name}
          />
          <TransferDialog
            enrollmentId={enrollment.id}
            currentClassId={enrollment.class.id}
            studentName={enrollment.student.name}
            targetClasses={targetClasses.map((c) => ({
              id: c.id,
              classCode: c.classCode,
              name: c.name,
              status: c.status,
              maxStudents: c.maxStudents,
              enrolledCount: c._count.enrollments,
              centerName: c.center?.name ?? null,
            }))}
          />
        </section>
      ) : (
        <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          Enrollment đã ở trạng thái cuối ({statusInfo.label}) — không thể đổi
          trạng thái hoặc chuyển lớp.
        </section>
      )}

      {/* Audit log */}
      {canViewAudit && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <History className="h-4 w-4" />
            Audit log ({auditLogs.length})
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-neutral-400">Chưa có thay đổi nào được log.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {auditLogs.map((log) => {
                const fromLabel =
                  STATUS_INFO[log.fromStatus]?.label ?? log.fromStatus;
                const toLabel =
                  STATUS_INFO[log.toStatus]?.label ?? log.toStatus;
                const extra = log.extraData as Record<string, unknown> | null;
                return (
                  <li key={log.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-neutral-900">
                        {fromLabel} → {toLabel}
                      </span>
                      <span className="text-xs text-neutral-400 tabular-nums">
                        {fmtDateTime(log.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      bởi <strong>{log.changedByName}</strong>
                    </div>
                    {log.reason && (
                      <div className="mt-1 text-sm text-neutral-700">
                        “{log.reason}”
                      </div>
                    )}
                    {extra && typeof extra === "object" && (
                      <div className="mt-1 text-xs text-neutral-500">
                        {typeof extra.transferredToId === "string" && (
                          <>
                            → Enrollment đích:{" "}
                            <Link
                              href={`/admin/enrollments/${extra.transferredToId}/edit`}
                              className="font-mono text-[#7C3AED] hover:underline"
                            >
                              {String(extra.transferredToId).slice(0, 12)}…
                            </Link>
                          </>
                        )}
                        {typeof extra.transferredFromId === "string" && (
                          <>
                            ← Enrollment gốc:{" "}
                            <Link
                              href={`/admin/enrollments/${extra.transferredFromId}/edit`}
                              className="font-mono text-[#7C3AED] hover:underline"
                            >
                              {String(extra.transferredFromId).slice(0, 12)}…
                            </Link>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
