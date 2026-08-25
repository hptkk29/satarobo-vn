import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { LEAD_STATUS_LABEL, LEAD_STATUS_BADGE } from "@/lib/leads/status";
import { TRIAL_STATUS_LABEL, TRIAL_STATUS_BADGE } from "@/lib/trials/status";
import type { LeadStatus } from "@prisma/client";
import { LeadActivityPanel } from "./_components/lead-activity-panel";
import { ReassignButton } from "./_components/reassign-button";
import { AssignSelect } from "./_components/assign-select";
import { TransferDialog } from "./_components/transfer-dialog";
import { LeadChildrenManager } from "../_components/lead-children";
import { TrialEnrollWidget } from "./_components/trial-enroll-widget";
import { OrderKindSelect } from "./_components/order-kind-select";
import { LeadPaymentCard } from "../_components/lead-payment-card";
import { getLeadPaymentSummary } from "@/lib/payments/summary";
import { maskFreeText, maskPersonName, maskLeadPiiFields } from "@/lib/lead/pii";
import { canViewLeadPii } from "@/lib/auth/check-permission";
import { ShareToggle } from "./_components/share-toggle";
import { formatDateVN } from "@/lib/format/date";

export const metadata = { title: "Chi tiết Lead | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canViewAll = (await checkPermission("leads:view-all"));
  const canViewOwn = (await checkPermission("leads:view-own"));
  if (!canViewAll && !canViewOwn) redirect("/dashboard");

  // Cách ly cơ sở: Lead ∈ SCOPED_MODELS → sdb.lead.findFirst tự inject `centerId IN
  // visible` (CENTER_MANAGER@CS1 không xem lead CS2 → notFound). SUPER_ADMIN/HO bypass.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const { id } = await params;
  const lead = await sdb.lead.findFirst({
    where: { id, deletedAt: null },
    include: {
      center: { select: { name: true } },
      course: { select: { name: true } },
      assignedTo: { select: { id: true, name: true } },
      // BGĐ 31/07 — người giới thiệu (affiliate) ra lead này.
      affiliate: { select: { code: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      // LD6 — KHÔNG fetch `tasks` nữa (UI "Việc cần làm" đã gỡ; model LeadTask giữ nguyên).
      children: {
        orderBy: { createdAt: "asc" },
        include: {
          // FL-R2 (item 6/TR-4) — lịch sử "đã từng học thử" (giữ kể cả khi lead quay lại).
          trialHistory: {
            orderBy: { lastAttendedAt: "desc" },
            include: { trialClass: { select: { name: true } } },
          },
          // LD3(a) — lớp trải nghiệm ĐANG học (ACTIVE) của con → banner "đang học thử lớp Y".
          trialEnrollments: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { trialClass: { select: { id: true, name: true } } },
          },
        },
      },
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

  // Scope: SALES_CSM chỉ xem lead của mình — TRỪ lead đã bật "dùng chung" (#11 T1
  // câu 10 BGĐ): CSKH cùng cơ sở xem được (cách ly cơ sở đã do scopedDb lo ở trên).
  if (!canViewAll && lead.assignedToId !== session.user.id && !lead.isSharedWithTeam) {
    redirect("/leads?view=table");
  }

  // #11 T1 Q2 — actor chỉ vào được NHỜ "dùng chung" → read-only về UX: ẩn nút
  // sửa/chuyển/convert/xếp học thử (server action đã chặn mutator qua
  // actorMayMutateLead); GIỮ khối ghi chú/hoạt động (Q2 cho phép ghi chú).
  const isSharedViewer = !canViewAll && lead.assignedToId !== session.user.id;

  // #11 T2 — mask PII ở SERVER trước khi render/truyền client (chặn leak qua RSC
  // payload, không chỉ che ở UI). Non-holder `leads:view-pii` (vd MARKETING) thấy
  // bản mask; canViewLeadPii qua checkPermission (v1+v2 theo cờ) từ sau flip #09.
  const canViewPii = await canViewLeadPii();
  const piiLead = maskLeadPiiFields(
    {
      parentName: lead.parentName,
      phone: lead.phone,
      email: lead.email,
      childName: lead.childName,
      note: lead.note,
    },
    canViewPii,
  );

  const canAssign = (await checkPermission("leads:assign", { centerId: lead.centerId }));
  const canCloseDeal =
    (await checkPermission("students:create", { centerId: lead.centerId })) &&
    (await checkPermission("enrollments:create", { centerId: lead.centerId }));
  const status = lead.status as LeadStatus;

  // PHẦN 2 — danh sách sale để gán tay (ưu tiên sale cùng cơ sở lead).
  // User/Center/Course/Product không scoped (exempt/global) → sdb pass-through.
  const assignableSales = canAssign
    ? await sdb.user.findMany({
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
  const canTransfer = (await checkPermission("leads:edit", { centerId: lead.centerId }));
  const [transferCenters, transferSales] = canTransfer
    ? await Promise.all([
        sdb.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
        sdb.user.findMany({
          where: { roles: { has: "SALES_CSM" }, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, centerId: true },
        }),
      ])
    : [[], []];
  // GĐ5 — điều kiện "chưa chốt" nay đọc `convertedAt`, KHÔNG đọc status. Bản cũ dùng
  // `status !== "ENROLLED"` vì ENROLLED là bậc riêng sau REGISTERED; enum mới gộp hai
  // bậc đó thành DA_DANG_KY, nên nếu dịch thẳng thành `status !== "DA_DANG_KY"` thì
  // lead vừa nộp tiền (trước đây là REGISTERED) sẽ mất luôn nút Chuyển đổi — tức là
  // chặn đúng bước tiếp theo của quy trình. `convertedAt` do chính lượt convert ghi nên
  // là mốc "đã chốt" chính xác, khớp ghi chú enum trong schema.
  const dealClosable = canCloseDeal && lead.convertedAt === null && status !== "DA_MAT";

  // E2-LEAD (item 2) — tóm tắt thanh toán (đã nộp / tổng phải thu / còn thiếu).
  const paymentSummary = await getLeadPaymentSummary(sdb, lead.id);

  // R7-01 — options cho khối quản lý con (khoá quan tâm / cơ sở quan tâm).
  const [childCenters, childCourses, expectedProducts] = await Promise.all([
    sdb.center.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    sdb.course.findMany({
      where: { isActive: true, isTeachable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true, code: true },
    }),
    // G2 — sản phẩm dự kiến (loại đơn = Sản phẩm): chỉ KIT_ROBOT/SENSOR đang bán.
    sdb.product.findMany({
      where: { status: "ACTIVE", category: { in: ["KIT_ROBOT", "SENSOR"] } },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, sku: true, name: true },
    }),
  ]);
  // Lead ĐÃ MẤT (hoặc không có quyền sửa / chỉ xem nhờ "dùng chung") → con read-only.
  const childrenReadOnly = !canTransfer || status === "DA_MAT" || isSharedViewer;

  // R7-02 — lớp trải nghiệm đang mở (cùng cơ sở lead) để xếp con vào.
  const canTrialManage = (await checkPermission("trials:manage", { centerId: lead.centerId }));
  // GAP-5: dùng scopedDb (TrialClassV2 là SCOPED_MODEL) — tránh lộ lớp toàn hệ thống
  // khi lead.centerId null. Cách ly cơ sở theo visibleCenterIds của actor.
  const openTrialClasses = canTrialManage
    ? await sdb.trialClassV2.findMany({
        where: {
          status: "OPEN",
          ...(lead.centerId ? { centerId: lead.centerId } : {}),
        },
        orderBy: { startDate: "asc" },
        take: 50,
        select: {
          id: true,
          name: true,
          code: true,
          capacity: true,
          enrollments: { where: { status: "ACTIVE" }, select: { id: true } },
          // LD3(b) — buổi chưa diễn ra để chọn ngày/giờ khi xếp con.
          sessions: {
            where: { status: "SCHEDULED" },
            orderBy: { seq: "asc" },
            select: { id: true, seq: true, date: true, startTime: true, endTime: true },
          },
        },
      })
    : [];

  // LD3 (display) — buổi đã chọn (scheduledSessionId) là scalar, không có relation
  // Prisma → resolve thủ công ra ngày/giờ để hiện trong banner "đang học thử".
  // TrialClassSession không scoped; id đến từ lead ĐÃ qua scope ở trên → an toàn.
  const scheduledSessionIds = lead.children
    .map((c) => c.trialEnrollments[0]?.scheduledSessionId)
    .filter((v): v is string => Boolean(v));
  const scheduledSessions = scheduledSessionIds.length
    ? await sdb.trialClassSession.findMany({
        where: { id: { in: scheduledSessionIds } },
        select: { id: true, seq: true, date: true, startTime: true, endTime: true },
      })
    : [];
  const sessionById = new Map(scheduledSessions.map((s) => [s.id, s]));

  return (
    <div className="max-w-6xl p-6">
      <Link
        href="/leads?view=table"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">
              {piiLead.parentName}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEAD_STATUS_BADGE[status]}`}
            >
              {LEAD_STATUS_LABEL[status]}
            </span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {/* #11 T2 — non-holder: hiện SĐT mask + BỎ link tel: (href sẽ lộ số thật) */}
            {canViewPii ? (
              <a href={`tel:${lead.phone}`} className="font-medium text-primary">
                {piiLead.phone}
              </a>
            ) : (
              <span className="font-medium text-primary">{piiLead.phone}</span>
            )}
            {piiLead.email && <span> · {piiLead.email}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* #11 T1 — bật/tắt "dùng chung": chỉ OWNER hoặc QL cơ sở (leads:assign);
              server action tự guard lại (đây là gate hiển thị). */}
          {(lead.assignedToId === session.user.id || canAssign) && (
            <ShareToggle
              leadId={lead.id}
              isShared={lead.isSharedWithTeam}
              sharedAt={lead.sharedAt ? lead.sharedAt.toISOString() : null}
            />
          )}
          {/* #11 T1 Q2 — shared-viewer: ẩn nút sửa/chuyển (chỉ xem + ghi chú) */}
          {canTransfer && !isSharedViewer && (
            <Link
              href={`/leads/${lead.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Sửa
            </Link>
          )}
          {canAssign && (
            <AssignSelect
              leadId={lead.id}
              sales={assignableSales}
              current={lead.assignedToId}
            />
          )}
          {canTransfer && !isSharedViewer && (
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
        <div className="mb-4 rounded-xl border border-state-warning bg-state-warning-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-state-warning-ink">Bàn giao — đã tư vấn</p>
          {/* #11 T2 — nội dung tư vấn là PII (Q7) → non-holder thấy MASKED_TEXT */}
          <p className="mt-1 whitespace-pre-wrap text-sm text-state-warning-ink">
            {canViewPii ? lead.handoverNote : maskFreeText(lead.handoverNote)}
          </p>
        </div>
      )}

      {/* Info grid */}
      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
        <Info label="Tên con" value={piiLead.childName} />
        <Info label="Tuổi" value={lead.childAge?.toString() ?? null} />
        <Info label="Khoá quan tâm" value={lead.course?.name ?? lead.source} />
        <Info label="Cơ sở" value={lead.center?.name ?? null} />
        <Info label="Nguồn" value={lead.source} />
        {/* Ô "Link Facebook" của biểu mẫu /nhap-khach-hang (22/08/2026). Với lead
            chạy quảng cáo FB đây thường là đường liên hệ DUY NHẤT lúc mới thu về.
            Là PII (chỉ đích danh một người) ⇒ che như SĐT/email khi không có
            quyền xem PII; `rel` đủ bộ vì đây là link ra ngoài do người dùng nhập. */}
        {lead.facebookUrl && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Link Facebook
            </dt>
            <dd className="mt-1 break-words text-sm text-foreground">
              {canViewPii ? (
                <a
                  href={lead.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-primary hover:underline"
                >
                  Mở hồ sơ Facebook
                </a>
              ) : (
                "•••"
              )}
            </dd>
          </div>
        )}
        {/* BGĐ 31/07 — nguồn giới thiệu (affiliate) khi lead vào qua link ?ref= */}
        {lead.affiliate && (
          <Info
            label="Người giới thiệu"
            value={`${lead.affiliate.name} (${lead.affiliate.code})`}
          />
        )}
        <Info label="Sale phụ trách" value={lead.assignedTo?.name ?? "Chưa gán"} />
        <Info
          label="Ngày tạo"
          value={formatDateVN(lead.createdAt)}
        />
        <Info label="Ghi chú" value={piiLead.note} />
      </dl>

      {/* LD1/G2 — loại đơn dự kiến (Khoá học / Sản phẩm) + item cụ thể theo loại */}
      <div className="mb-6">
        <OrderKindSelect
          leadId={lead.id}
          current={lead.orderKind}
          currentCourseId={lead.expectedCourseId}
          currentProductId={lead.expectedProductId}
          courses={childCourses.map((c) => ({ id: c.id, name: c.name, code: c.code }))}
          products={expectedProducts}
          readOnly={!canTransfer || isSharedViewer}
        />
      </div>

      {/* R7-01 — danh sách con (LeadChild) + field phẳng cũ read-only */}
      <div className="mb-6">
        <LeadChildrenManager
          leadId={lead.id}
          childrenList={lead.children.map((c) => ({
            id: c.id,
            // #11 T2 — tên HS là PII (Q7): non-holder thấy bản mask; dob/trường
            // ẨN HẲN (truyền null — không xuống client qua RSC payload).
            fullName: canViewPii ? c.fullName : maskPersonName(c.fullName),
            dob: canViewPii && c.dob ? c.dob.toISOString() : null,
            ageYears: c.ageYears,
            gender: c.gender,
            schoolName: canViewPii ? c.schoolName : null,
            gradeLevel: c.gradeLevel,
            interestedCourseId: c.interestedCourseId,
            interestedCenterId: c.interestedCenterId,
            note: canViewPii ? c.note : maskFreeText(c.note),
            trialStatus: c.trialStatus,
            trialHistory: c.trialHistory
              .filter((h) => h.attendedCount > 0)
              .map((h) => ({
              className: h.trialClass?.name ?? "(lớp đã xoá)",
              attendedCount: h.attendedCount,
              totalSessions: h.totalSessions,
              lastAttendedAt: h.lastAttendedAt ? h.lastAttendedAt.toISOString() : null,
              outcome: h.outcome,
            })),
          }))}
          centers={childCenters}
          courses={childCourses}
          readOnly={childrenReadOnly}
          legacyChildName={piiLead.childName}
          legacyChildAge={lead.childAge}
        />
      </div>

      {/* R7-02 — xếp con vào lớp trải nghiệm (shared-viewer: ẩn — chỉ xem + ghi chú) */}
      {canTrialManage && !isSharedViewer && lead.children.length > 0 && (
        <div className="mb-6">
          <TrialEnrollWidget
            children={lead.children.map((c) => {
              const enr = c.trialEnrollments[0];
              const sess = enr?.scheduledSessionId
                ? sessionById.get(enr.scheduledSessionId)
                : null;
              return {
                id: c.id,
                fullName: canViewPii ? c.fullName : maskPersonName(c.fullName),
                currentTrial: enr?.trialClass
                  ? {
                      className: enr.trialClass.name,
                      session: sess
                        ? {
                            seq: sess.seq,
                            date: sess.date.toISOString(),
                            startTime: sess.startTime,
                            endTime: sess.endTime,
                          }
                        : null,
                    }
                  : null,
              };
            })}
            openClasses={openTrialClasses.map((cl) => ({
              id: cl.id,
              name: cl.name,
              code: cl.code,
              capacity: cl.capacity,
              used: cl.enrollments.length,
              sessions: cl.sessions.map((s) => ({
                id: s.id,
                seq: s.seq,
                date: s.date.toISOString(),
                startTime: s.startTime,
                endTime: s.endTime,
              })),
            }))}
            canOverride={(await checkPermission("trials:override-capacity", { centerId: lead.centerId }))}
          />
        </div>
      )}

      {/* E2-LEAD (item 2) — khối thanh toán: đã nộp / tổng phải thu / còn thiếu + điều kiện chốt. */}
      {(paymentSummary.hasOrder || dealClosable) && (
        <div className="mb-6">
          <LeadPaymentCard
            leadId={lead.id}
            summary={paymentSummary}
            canCreateOrder={await checkPermission("orders:create")}
          />
        </div>
      )}

      {/* Chốt deal — R7 (quyết định): Convert v2 là entry point DUY NHẤT
          (per-child, guard payment CONFIRMED, dedupe, consent). Bỏ flow gộp lead cũ. */}
      {dealClosable && !isSharedViewer && (
        <div className="mb-6">
          <Link
            href={`/leads/${lead.id}/convert`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-state-success-ink px-3 py-2 text-sm font-semibold text-white hover:bg-state-success-ink-hover"
          >
            Chuyển đổi
          </Link>
        </div>
      )}

      {/* Học thử (Phase T1.4) */}
      {lead.trialClasses.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Buổi học thử</h2>
            <Link href="/trials" className="text-xs font-medium text-primary hover:underline">
              Quản lý ở mục Học thử →
            </Link>
          </div>
          <ul className="space-y-2">
            {lead.trialClasses.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TRIAL_STATUS_BADGE[t.status]}`}
                  >
                    {TRIAL_STATUS_LABEL[t.status]}
                  </span>
                  <span className="text-foreground">
                    {t.scheduledAt.toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {t.teacher?.name && (
                    <span className="text-muted-foreground">· GV: {t.teacher.name}</span>
                  )}
                </div>
                {t.feedback ? (
                  <span className="text-xs font-medium text-state-info-ink">
                    Đã có nhận xét
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Chưa nhận xét</span>
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
          // #11 T2 — nội dung tư vấn là PII (Q7): non-holder → mask content + BỎ
          // metadata (JSON chứa notes/recipient... raw) NGAY Ở SERVER; panel gặp
          // metadata null sẽ tự fallback render `content` (đã mask).
          content: canViewPii ? a.content : (maskFreeText(a.content) ?? ""),
          metadata: canViewPii ? a.metadata : null,
          actorName: a.actorName,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}
