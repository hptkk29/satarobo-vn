// app/(admin)/admin/don-tu/page.tsx — HÀNG CHỜ DUYỆT ĐƠN TỪ của cả module chấm công.
//
// Vì sao màn này tồn tại: đơn từ là thứ DUY NHẤT trong module có người khác ngồi chờ. Bản cũ xếp
// 200 thẻ dọc, mỗi thẻ 8 dòng chữ nhỏ, nên muốn biết "hôm nay còn đơn nào gấp" phải cuộn hết trang.
// Nay là một bảng: sắp theo NGÀY ÁP DỤNG (đơn cho ngày mai phải xử trước đơn cho tháng sau), và
// cột "Thay đổi" nói trước hệ quả (`S → CG`, `07:52→? ⇒ 07:30→17:30`) để người duyệt quyết định
// ngay trên bảng thay vì mở từng đơn ra đoán.
//
// Điều dễ vỡ:
//  · `WorkRequest` KHÔNG nằm trong `SCOPED_MODELS` (lib/db-scope.ts) ⇒ `scopedDb` không tự lọc.
//    Cổng thật là `centerId: { in: centerIds }`; bỏ mệnh đề đó là lộ đơn của cơ sở khác.
//  · `centerIds` PHẢI còn `HO_CENTER_ID` khi người dùng có quyền ở Hội sở — đơn PENDING cũ trên
//    prod (trước L5) mang `centerId = "hoi-so"`, bỏ khối đó là chúng tàng hình (S-19).
//  · Ngưỡng "chờ quá lâu" lấy từ `dashboard.pendingStaleDays` — CÙNG tham số với `lib/pending-tasks.ts`
//    để khu "Cần xử lý" ở dashboard và ô KPI ở đây không nói hai con số khác nhau.
//  · Href trần `/don-tu` là đích của thông báo đã ghi trong DB — không đổi đường, chỉ THÊM tham số.
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, ClipboardList, Clock, TriangleAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getSetting } from "@/lib/settings/service";
import { vnYmd } from "@/lib/time/vn";
import { ASK_WHO, loadModuleScope } from "@/lib/cham-cong/module-scope";
import { hrefWith } from "@/lib/cham-cong/scope-href";
import {
  effectHint,
  effectKey,
  effectQueryPlan,
  effectSummaries,
} from "@/lib/cham-cong/request-effect";
import {
  WR_KIND_LABEL,
  WR_STATUS_LABEL,
  type WorkRequestKindV,
  type WorkRequestStatusV,
} from "@/lib/work-request";
import { PageHeader } from "@/components/admin/ui/page-header";
import { PageHelp } from "@/components/admin/ui/page-help";
import { EmptyState, NoPermission } from "@/components/admin/ui/states";
import { KpiStrip } from "@/components/admin/cham-cong/kpi-strip";
import { ModuleNav } from "@/components/admin/cham-cong/module-nav";
import { ScopeBar } from "@/components/admin/cham-cong/scope-bar";
import { BTN_OUTLINE, CHIP, CHIP_ACTIVE, CHIP_IDLE } from "@/components/admin/cham-cong/classes";
import { RequestQueueTable, type QueueRow } from "./_components/request-queue-table";

export const metadata = { title: "Duyệt đơn từ | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Trần cũ, giữ nguyên: đọc hết đơn của mọi cơ sở là truy vấn không có đáy. */
const TRAN = 200;

const VN_TZ = "Asia/Ho_Chi_Minh";
const fmtDMY = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: VN_TZ });
const fmtDM = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: VN_TZ });
const fmtDateTime = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: VN_TZ,
});

/** Số ngày giữa hai mốc "YYYY-MM-DD" — so bằng chuỗi ngày giờ VN, không trừ mili-giây thô
 *  (trừ thô là lệch một ngày quanh mốc nửa đêm, bài học TZ của repo). */
function dayDiff(aYmd: string, bYmd: string): number {
  return Math.round((Date.parse(`${aYmd}T00:00:00Z`) - Date.parse(`${bYmd}T00:00:00Z`)) / 86_400_000);
}

type DueTone = "danger" | "warning" | "muted";

/** "còn 3 ngày" / "hôm nay" / "quá 2 ngày" — người duyệt cần biết đơn nào đã lỡ ngày áp dụng. */
function dueOf(fromDate: Date | null, todayYmd: string): { label: string; tone: DueTone } | null {
  if (!fromDate) return null;
  const d = dayDiff(vnYmd(fromDate), todayYmd);
  if (d < 0) return { label: `quá ${-d} ngày`, tone: "danger" };
  if (d === 0) return { label: "hôm nay", tone: "warning" };
  if (d === 1) return { label: "còn 1 ngày", tone: "warning" };
  return { label: `còn ${d} ngày`, tone: "muted" };
}

function ageOf(createdAt: Date, now: Date): string {
  const ms = now.getTime() - createdAt.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} ngày`;
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours} giờ` : "vừa nộp";
}

export default async function WorkRequestsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; coSo?: string; id?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fdon-tu");

  const scope = await loadModuleScope(session.user.id);
  const approvable = scope.blocksWith("hr_attendance:approve");

  const sp = await searchParams;
  const statusFilter: WorkRequestStatusV =
    sp.status === "APPROVED" || sp.status === "REJECTED" ? sp.status : "PENDING";
  const qs = (s: WorkRequestStatusV, c?: string | null) => hrefWith("/don-tu", { coSo: c, status: s });

  if (approvable.length === 0) {
    return (
      <div className="max-w-6xl">
        <PageHeader
          title="Duyệt đơn từ"
          subtitle="Đơn đổi ca, nghỉ phép, chỉnh công của nhân sự gửi tới cơ sở chịu công."
        />
        {/* Hàng tab PHẢI còn ở nhánh không quyền: `/don-tu` là đích của thông báo đã ghi trong DB,
            nên người chỉ có `view` vẫn bị đẩy tới đây. Không có ModuleNav thì đây là trang cụt —
            không lối nào về Bảng công ngày hay Kỳ công. */}
        <ModuleNav active="don" scope={scope} ctx={{ coSo: null }} />
        <NoPermission
          permission="hr_attendance:approve"
          what="duyệt đơn từ"
          askWho={ASK_WHO["hr_attendance:approve"]}
        />
      </div>
    );
  }

  const allowed = new Set(approvable.map((b) => b.id));
  const coSo = sp.coSo && allowed.has(sp.coSo) ? sp.coSo : null;
  const centerIds = coSo ? [coSo] : [...allowed];
  const blockOf = new Map(scope.blocks.map((b) => [b.id, b]));

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const now = new Date();
  const todayYmd = vnYmd(now);

  // Cùng tham số với lib/pending-tasks.ts — hai màn phải nói cùng một con số "chờ quá lâu".
  const staleDays = await getSetting("dashboard.pendingStaleDays");
  const staleBefore = new Date(now.getTime() - staleDays * 86_400_000);
  const pendingWhere = { status: "PENDING" as const, centerId: { in: centerIds } };

  const [requests, pendingCount, lateCount, staleCount, failCount] = await Promise.all([
    sdb.workRequest.findMany({
      where: { status: statusFilter, centerId: { in: centerIds } },
      // Chờ duyệt: xếp theo NGÀY ÁP DỤNG tăng dần (việc gấp lên đầu), đơn nộp muộn nổi trước
      // trong cùng ngày. Tab đã xử lý là sổ tra cứu ⇒ mới nhất lên đầu.
      orderBy:
        statusFilter === "PENDING"
          ? [{ fromDate: "asc" as const }, { submittedLate: "desc" as const }, { createdAt: "asc" as const }]
          : [{ createdAt: "desc" as const }],
      take: TRAN,
      select: {
        id: true, kind: true, status: true, centerId: true, fromDate: true, toDate: true, startTime: true, endTime: true,
        className: true, targetUserId: true, requesterNewTemplateId: true, targetNewTemplateId: true, leaveTypeId: true,
        requestedInAt: true, requestedOutAt: true, submittedLate: true, applyError: true, appliedAt: true, detail: true,
        reason: true, reviewNote: true, reviewedByName: true, reviewedAt: true, createdAt: true, requesterId: true,
      },
    }),
    sdb.workRequest.count({ where: pendingWhere }),
    sdb.workRequest.count({ where: { ...pendingWhere, submittedLate: true } }),
    sdb.workRequest.count({ where: { ...pendingWhere, createdAt: { lt: staleBefore } } }),
    sdb.workRequest.count({ where: { ...pendingWhere, applyError: { not: null } } }),
  ]);

  // Cột "Thay đổi" tính TRƯỚC ở server: kế hoạch đọc thuần (request-effect.ts) → nạp qua scopedDb
  // → ánh xạ về từng đơn. Người duyệt thấy hệ quả trên bảng, không phải mở lưới ca ở tab khác.
  const plan = effectQueryPlan(requests);
  const userIds = [...new Set([...plan.userIds, ...requests.map((r) => r.requesterId)])];
  const shiftUserIds = [...new Set(plan.shiftKeys.map((k) => k.userId))];
  const shiftDates = [...new Map(plan.shiftKeys.map((k) => [k.workDate.getTime(), k.workDate])).values()];
  const tapUserIds = [...new Set(plan.timeLogKeys.map((k) => k.userId))];
  const tapDates = [...new Map(plan.timeLogKeys.map((k) => [k.workDate.getTime(), k.workDate])).values()];

  const [users, templates, leaves, assignments, taps] = await Promise.all([
    userIds.length
      ? sdb.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [],
    plan.templateIds.length
      ? sdb.shiftTemplate.findMany({ where: { id: { in: plan.templateIds } }, select: { id: true, code: true } })
      : [],
    plan.leaveTypeIds.length
      ? sdb.leaveType.findMany({ where: { id: { in: plan.leaveTypeIds } }, select: { id: true, code: true, name: true } })
      : [],
    shiftUserIds.length
      ? sdb.shiftAssignment.findMany({
          where: { status: "ACTIVE", userId: { in: shiftUserIds }, workDate: { in: shiftDates } },
          select: { userId: true, workDate: true, templateCode: true },
        })
      : [],
    tapUserIds.length
      ? sdb.staffTimeLog.findMany({
          where: { result: "ACCEPTED", userId: { in: tapUserIds }, workDate: { in: tapDates } },
          select: { userId: true, workDate: true, loggedAt: true },
          orderBy: { loggedAt: "asc" },
        })
      : [],
  ]);

  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const codeOf = new Map(templates.map((t) => [t.id, t.code]));
  const leaveCodeOf = new Map(leaves.map((l) => [l.id, l.code]));
  const leaveNameOf = new Map(leaves.map((l) => [l.id, l.name]));
  const shiftCodeOf = new Map(assignments.map((a) => [effectKey(a.userId, a.workDate), a.templateCode]));
  const tapsOf = new Map<string, { first: Date | null; last: Date | null }>();
  for (const t of taps) {
    const k = effectKey(t.userId, t.workDate);
    const cur = tapsOf.get(k);
    if (!cur) tapsOf.set(k, { first: t.loggedAt, last: t.loggedAt });
    else cur.last = t.loggedAt; // đã orderBy loggedAt asc ⇒ lượt sau luôn muộn hơn
  }

  const effects = effectSummaries(requests, {
    userNameById: nameOf,
    templateCodeById: codeOf,
    leaveCodeById: leaveCodeOf,
    shiftCodeByUserDay: shiftCodeOf,
    tapsByUserDay: tapsOf,
  });

  const rows: QueueRow[] = requests.map((r) => {
    const block = r.centerId ? blockOf.get(r.centerId) : undefined;
    const requesterName = nameOf.get(r.requesterId) ?? "nhân sự";
    const eff = effects.get(r.id);
    const due = r.status === "PENDING" ? dueOf(r.fromDate, todayYmd) : null;
    const sameDay = r.toDate && r.fromDate && r.toDate.getTime() === r.fromDate.getTime();
    const time = r.startTime ? `${r.startTime}${r.endTime ? `–${r.endTime}` : ""}` : null;
    const fromDM = r.fromDate ? fmtDM.format(r.fromDate) : "—";

    return {
      id: r.id,
      status: r.status as WorkRequestStatusV,
      statusLabel: WR_STATUS_LABEL[r.status as WorkRequestStatusV] ?? r.status,
      kindLabel: WR_KIND_LABEL[r.kind as WorkRequestKindV] ?? r.kind,
      requesterName,
      centerCode: block?.code ?? r.centerId ?? "—",
      centerLabel: block?.label ?? r.centerId ?? "—",
      applyLabel: `${fromDM}${r.toDate && !sameDay ? ` → ${fmtDM.format(r.toDate)}` : ""}`,
      applyTitle: r.fromDate
        ? `${fmtDMY.format(r.fromDate)}${r.toDate && !sameDay ? ` → ${fmtDMY.format(r.toDate)}` : ""}`
        : "Đơn không gắn ngày áp dụng",
      timeLabel: time,
      dueLabel: due?.label ?? null,
      dueTone: due?.tone ?? "muted",
      effectText: eff?.text ?? "—",
      effectTone: eff?.tone ?? "muted",
      effectCode: eff?.code ?? null,
      effectBlocked: eff?.blocked ?? null,
      effectHint: effectHint(r),
      ageLabel: ageOf(r.createdAt, now),
      stale: r.status === "PENDING" && r.createdAt < staleBefore,
      submittedLate: r.submittedLate,
      applyError: r.applyError,
      applied: r.appliedAt !== null,
      subject: `${requesterName} ngày ${fromDM}`,
      reason: r.reason,
      detail: r.detail,
      className: r.className,
      requestedLabel:
        r.requestedInAt || r.requestedOutAt
          ? `đề nghị vào ${r.requestedInAt ?? "—"} / ra ${r.requestedOutAt ?? "—"}`
          : null,
      newShiftCode: r.requesterNewTemplateId ? (codeOf.get(r.requesterNewTemplateId) ?? "?") : null,
      leaveName: r.leaveTypeId ? (leaveNameOf.get(r.leaveTypeId) ?? "Nghỉ") : null,
      targetName: r.targetUserId ? (nameOf.get(r.targetUserId) ?? "—") : null,
      targetShiftCode: r.targetNewTemplateId ? (codeOf.get(r.targetNewTemplateId) ?? "?") : null,
      reviewedByName: r.reviewedByName,
      reviewedAtLabel: r.reviewedAt ? fmtDateTime.format(r.reviewedAt) : null,
      reviewNote: r.reviewNote,
      createdAtLabel: fmtDateTime.format(r.createdAt),
    };
  });

  const tabs: { key: WorkRequestStatusV; label: string; badge?: number }[] = [
    { key: "PENDING", label: "Chờ duyệt", badge: pendingCount },
    { key: "APPROVED", label: "Đã duyệt" },
    { key: "REJECTED", label: "Từ chối" },
  ];
  const scopeLabel = coSo ? (blockOf.get(coSo)?.label ?? coSo) : "các cơ sở bạn duyệt";
  const capped = requests.length >= TRAN;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Duyệt đơn từ"
        subtitle="Đơn của nhân sự gửi tới cơ sở chịu công. Duyệt là áp ngay lên lịch và công."
        actions={
          <Link href="/don-tu/cua-toi" className={BTN_OUTLINE}>
            Đơn của tôi
          </Link>
        }
      />

      <ModuleNav active="don" scope={scope} ctx={{ coSo }} />

      {/* Một khối thì không có gì để LỌC — chip lúc đó chỉ để nói "bạn đang xem cơ sở nào",
          nên bỏ chip "Tất cả" và tô sáng chính khối đó (URL vẫn không mang ?coSo=).
          Chip gom dùng chữ "khối" như /khung-ca và /ghi-chu: danh sách ở đây CÓ cả Hội sở
          (người duyệt neo tại HO), nên "Tất cả cơ sở" vừa lệch tên vừa sai nghĩa. */}
      <ScopeBar
        basePath="/don-tu"
        blocks={approvable.map((b) => ({ id: b.id, label: b.label }))}
        coSo={approvable.length > 1 ? coSo : approvable[0].id}
        allLabel={approvable.length > 1 ? "Tất cả khối" : undefined}
        keep={{ status: statusFilter }}
      />

      <PageHelp guideSlug="nhan-su-giao-vien">
        <p>
          Duyệt đơn là áp hệ quả NGAY trong cùng thao tác: đổi mã ca trên lưới, ghi mã nghỉ, ghi mốc
          giờ chỉnh tay, huỷ buổi dạy hoặc gán người dạy thay. Cột <b>Thay đổi</b> cho biết trước
          việc đó đổi cái gì, ví dụ <code>S → CG</code> là ca sáng thành ca cả ngày.
        </p>
        <p className="mt-2">
          Nếu áp không được (lớp đã điểm danh, kỳ công đã khoá…), đơn tự quay lại <b>Chờ duyệt</b> kèm
          dòng lý do — không bao giờ có đơn &quot;đã duyệt&quot; mà lịch chưa đổi. Từ chối thì bắt buộc
          nhập lý do; người nộp đọc được nguyên văn lý do đó.
        </p>
      </PageHelp>

      <KpiStrip
        items={[
          {
            icon: ClipboardList,
            value: pendingCount.toLocaleString("vi-VN"),
            label: "Chờ duyệt",
            tone: "brand",
            href: qs("PENDING", coSo),
          },
          {
            icon: Clock,
            value: lateCount.toLocaleString("vi-VN"),
            label: "Nộp muộn",
            tone: "warning",
            hint: "nộp sát ngày áp dụng",
          },
          {
            icon: AlarmClock,
            value: staleCount.toLocaleString("vi-VN"),
            label: `Chờ > ${staleDays} ngày`,
            tone: "danger",
            hint: "quá hạn xử lý",
          },
          {
            icon: TriangleAlert,
            value: failCount.toLocaleString("vi-VN"),
            label: "Áp thất bại",
            tone: "danger",
            hint: "lần duyệt trước không áp được",
          },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Lọc theo trạng thái đơn" className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = statusFilter === t.key;
            return (
              <Link
                key={t.key}
                href={qs(t.key, coSo)}
                aria-current={active ? "page" : undefined}
                className={`${CHIP} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <b className="tabular-nums text-foreground">{t.badge.toLocaleString("vi-VN")}</b>
                )}
              </Link>
            );
          })}
        </nav>
        {capped && (
          <p className="ml-auto text-xs text-state-warning-ink">
            Đang hiện {TRAN} đơn mới nhất — lọc để thu hẹp
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={`Không có đơn ${WR_STATUS_LABEL[statusFilter].toLowerCase()} ở ${scopeLabel}`}
          description={
            statusFilter === "PENDING"
              ? "Mọi đơn đã được xử lý. Đơn mới sẽ hiện ở đây ngay khi nhân sự gửi, kèm thông báo cho người có quyền duyệt."
              : "Chưa có đơn nào ở trạng thái này trong phạm vi đang xem. Đổi cơ sở hoặc xem tab khác."
          }
          action={
            <Link href={qs(statusFilter === "PENDING" ? "APPROVED" : "PENDING", coSo)} className={BTN_OUTLINE}>
              {statusFilter === "PENDING" ? "Xem đơn đã duyệt" : "Xem đơn chờ duyệt"}
            </Link>
          }
        />
      ) : (
        <RequestQueueTable rows={rows} initialId={sp.id ?? null} />
      )}
    </div>
  );
}
