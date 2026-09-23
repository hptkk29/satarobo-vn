import Link from "next/link";
import { safeCache } from "@/lib/cache/safe-cache";
import { Users, CheckSquare, FlaskConical, TrendingUp, GraduationCap } from "lucide-react";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import {
  KANBAN_COLUMNS,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_BADGE,
  CONVERTED_STATUSES,
} from "@/lib/leads/status";
import { getNearingEndEnrollments } from "@/lib/students/renewal";
import { groupByWeek, type LeadReportRecord } from "@/lib/reports/lead";
import { BarChart } from "@/components/charts/bar-chart";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { formatDateVN } from "@/lib/format/date";

// REQ-04: số liệu tổng hợp dashboard sale. Data THEO USER (assignedToId=userId) → cache
// key = userId. Output PRIMITIVE (countByStatus là object, weeklyBars {string,number},
// đếm số — KHÔNG Date/Map). Việc-cần-làm + học-thử (có Date) giữ LIVE ở component.
async function getSalesStats(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 86_400_000);
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);

  const [pipeline, totalMine, enrolledMonth, nearingEnd, leadsForWeekly] = await Promise.all([
    sdb.lead.groupBy({ by: ["status"], where: { assignedToId: userId, deletedAt: null }, _count: { _all: true } }),
    sdb.lead.count({ where: { assignedToId: userId, deletedAt: null } }),
    sdb.lead.count({ where: { assignedToId: userId, deletedAt: null, status: "DA_DANG_KY", updatedAt: { gte: monthStart } } }),
    getNearingEndEnrollments(),
    // Phễu lead theo TUẦN (8 tuần) — lead CỦA TÔI: tổng mới vs chuyển đổi.
    sdb.lead.findMany({
      where: { assignedToId: userId, deletedAt: null, createdAt: { gte: eightWeeksAgo } },
      select: { createdAt: true, status: true },
    }),
  ]);

  const countByStatus: Record<string, number> = {};
  for (const p of pipeline) countByStatus[p.status] = p._count._all;
  const weeklyRecords: LeadReportRecord[] = leadsForWeekly.map((l) => ({
    status: l.status,
    source: null,
    centerId: null,
    commissionSource: null,
    createdAt: l.createdAt,
  }));
  const weeklyBars = groupByWeek(weeklyRecords, 8, now).map((w) => ({
    week: w.label,
    total: w.total,
    converted: w.converted,
  }));
  // Tỉ lệ chốt = lead đã đăng ký / tổng lead của tôi.
  // ⚠️ `countByStatus` là Record<string, number> nên tra khoá sai KHÔNG làm tsc đỏ —
  // khoá "ENROLLED" cũ chỉ lặng lẽ trả undefined ⇒ mọi sale hiện 0%. Cộng theo
  // CONVERTED_STATUSES (nguồn duy nhất) thay vì gõ tay tên trạng thái.
  const convertedMine = [...CONVERTED_STATUSES].reduce(
    (sum, st) => sum + (countByStatus[st] ?? 0),
    0,
  );
  const closeRate = totalMine > 0 ? Math.round((convertedMine / totalMine) * 100) : 0;

  return { totalMine, enrolledMonth, closeRate, countByStatus, weeklyBars, nearingEndCount: nearingEnd.length };
}

// Đợt 3C — Dashboard SALES_CSM. Chỉ lead/việc CỦA TÔI. KHÔNG tài chính/quản trị.
export async function SalesDashboard({ userId, name, embedded = false }: { userId: string; name: string; embedded?: boolean }) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Live (KHÔNG cache — có Date so sánh/hiển thị): việc cần làm (dueAt) + học thử sắp tới.
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);
  const visibleLeadCenters = getModelVisibleCenterIds("Lead", actor);
  const leadTaskScope =
    visibleLeadCenters === "ALL" ? {} : { lead: { centerId: { in: visibleLeadCenters } } };
  const [openTasks, trialClasses] = await Promise.all([
    sdb.leadTask.findMany({
      where: { assignedToId: userId, status: "OPEN", ...leadTaskScope },
      orderBy: { dueAt: "asc" },
      take: 50,
      select: { id: true, title: true, dueAt: true, leadId: true },
    }),
    // 26/08 — đọc V2 sau khi gộp hai hệ Trial.
    //
    // Vào từ LỚP (TrialClassV2 ∈ SCOPED_MODELS) để giữ cách ly cơ sở: `TrialClassSession`
    // không được scopedDb tự lọc, truy vấn thẳng nó là Sale cơ sở này thấy hẹn cơ sở kia.
    // Lọc ghi danh theo Sale phụ trách lead — một lớp trải nghiệm chứa con của nhiều Sale.
    sdb.trialClassV2.findMany({
      where: {
        status: { not: "CANCELLED" },
        sessions: { some: { date: { gte: dayStart }, status: "SCHEDULED" } },
        enrollments: { some: { leadChild: { lead: { assignedToId: userId, deletedAt: null } } } },
      },
      take: 20,
      select: {
        sessions: {
          where: { date: { gte: dayStart }, status: "SCHEDULED" },
          select: { id: true, date: true, startTime: true },
        },
        enrollments: {
          where: {
            status: { in: ["ACTIVE", "COMPLETED"] },
            leadChild: { lead: { assignedToId: userId, deletedAt: null } },
          },
          select: {
            id: true,
            scheduledSessionId: true,
            leadChild: {
              select: { fullName: true, lead: { select: { id: true, parentName: true } } },
            },
          },
        },
      },
    }),
  ]);
  // Ghép ghi danh ↔ buổi của nó. `TrialEnrollment.scheduledSessionId` là cột TRẦN
  // (không FK) nên Prisma không join hộ được — ghép tay ở đây.
  // Ngày format bằng `@db.Date` ⇒ đọc theo UTC mới ra đúng ngày lịch VN.
  const trials = trialClasses
    .flatMap((c) =>
      c.enrollments.map((e) => {
        const ses = c.sessions.find((s) => s.id === e.scheduledSessionId);
        if (!ses) return null; // ghi danh trỏ buổi đã qua / chưa xếp → không phải "sắp tới"
        const d = ses.date;
        const ngay = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        return {
          id: e.id,
          leadId: e.leadChild.lead?.id ?? "",
          name: e.leadChild.fullName || (e.leadChild.lead?.parentName ?? "—"),
          when: `${ngay} ${ses.startTime}`,
          sort: d.getTime(),
        };
      }),
    )
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 6);

  const overdue = openTasks.filter((t) => t.dueAt < now);
  const dueToday = openTasks.filter((t) => t.dueAt >= now && t.dueAt < dayEnd);

  // REQ-04: cache số liệu tổng hợp theo USER (userId), TTL 60s.
  const { totalMine, enrolledMonth, closeRate, countByStatus, weeklyBars, nearingEndCount } =
    await safeCache(
      () => getSalesStats(userId),
      ["sales-dashboard-stats", userId],
      { tags: [CACHE_TAGS.dashboard], revalidate: 60 },
    )();

  return (
    <div className="space-y-6">
      {!embedded && <h1 className="text-2xl font-bold text-foreground">Chào {name || "bạn"} 👋</h1>}

      {/* ═══ Việc của tôi ═══════════════════════════════════════════════════
          CHỐT 27/08/2026 — LỰA CHỌN CÓ CHỦ ĐÍCH, ĐỪNG "SỬA CHO ĐÚNG":
          bốn ô này lọc theo `assignedToId = tôi` và PHẢI giữ nguyên như vậy.

          Bảng điều khiển của Sale tồn tại để trả lời "hôm nay tôi gọi ai", không
          phải để đếm thành tích của cơ sở. Mở bốn ô này ra thành số của cả cơ sở
          nghe thì "đầy đủ hơn", nhưng nó biến màn hành động thành bảng xếp hạng —
          và Sale mất đúng cái duy nhất họ cần khi vừa đăng nhập.

          Người sau nhìn "Lead của tôi" trên một bảng điều khiển rất dễ tưởng là
          thiếu sót. Nó không phải. Muốn xem theo cơ sở thì đã có màn Danh sách
          khách với bộ lọc riêng. `sales-dashboard.test.ts` canh cả cách lọc lẫn
          nhãn, nên đổi một trong hai sẽ đỏ chứ không lặng lẽ trôi.

          Nhãn cố ý KHÔNG ghi "hôm nay": chỉ "Việc của tôi quá hạn" mới thật sự là
          việc trong ngày; ba ô còn lại là tồn kho / tháng này / tỉ lệ luỹ kế. Ghi
          "hôm nay" lên chúng là thay một nhãn mơ hồ bằng một nhãn sai. */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Việc của tôi
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DashStat label="Khách tôi đang giữ" value={totalMine} href="/leads" icon={<Users className="h-5 w-5" />} />
          <DashStat label="Tôi chốt trong tháng" value={enrolledMonth} href="/leads" tone="ok" icon={<TrendingUp className="h-5 w-5" />} />
          <DashStat label="Tỷ lệ chốt của tôi" value={`${closeRate}%`} href="/leads" icon={<TrendingUp className="h-5 w-5" />} />
          <DashStat label="Việc của tôi quá hạn" value={overdue.length} href="/leads?view=kanban" tone={overdue.length > 0 ? "danger" : "ok"} icon={<CheckSquare className="h-5 w-5" />} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Bốn ô trên chỉ tính phiếu <b>được giao cho bạn</b> — đây là bảng để biết hôm
          nay gọi ai, không phải bảng thành tích. Xem theo cơ sở hoặc theo bộ lọc khác
          thì vào <Link href="/leads" className="underline hover:text-primary">Danh sách khách</Link>.
        </p>
      </section>

      {/* ⚠️ KHỐI NÀY NẰM NGOÀI "Việc của tôi" — CÓ CHỦ ĐÍCH.
          `getNearingEndEnrollments()` gọi KHÔNG tham số ⇒ nó đếm học viên sắp hết
          khoá của MỌI cơ sở: không lọc theo người được giao, cũng không lọc theo cơ
          sở của người đang xem (`lib/students/renewal.ts` dùng `db` trần, tham số
          `centerId` bỏ trống). Nó khác bản chất với bốn ô trên, nên không được đội
          nhãn "của tôi".
          Cách lọc của nó chưa sửa (ngoài phạm vi đợt 27/08 — chốt là "giữ nguyên
          cách lọc, chỉ đổi nhãn"). Đây là việc còn treo, đã báo lại chủ dự án. */}
      {nearingEndCount > 0 && (
        <Link
          href="/students/sap-het-khoa"
          className="flex items-center gap-2 rounded-xl border border-state-warning-soft bg-state-warning-soft p-3 text-sm text-state-warning-ink hover:border-state-warning"
        >
          <GraduationCap className="h-5 w-5 shrink-0" />
          <span>
            <b>{nearingEndCount}</b> học viên sắp hết khoá (≤ 5 buổi) — nhắc phụ huynh tái tục.
          </span>
        </Link>
      )}

      {/* Pipeline của tôi */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Lead của tôi theo giai đoạn</h2>
        <div className="flex flex-wrap gap-2">
          {KANBAN_COLUMNS.map((s) => (
            <Link key={s} href={`/leads?status=${s}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${LEAD_STATUS_BADGE[s]}`}>
              {LEAD_STATUS_LABEL[s]}: <strong>{countByStatus[s] ?? 0}</strong>
            </Link>
          ))}
        </div>
      </section>

      {/* Phễu lead theo TUẦN — lead của tôi: mới vs chuyển đổi (8 tuần gần nhất). */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">Phễu lead theo tuần</h2>
        <p className="mb-4 text-xs text-muted-foreground">Lead mới vs đã chuyển đổi mỗi tuần (8 tuần gần nhất)</p>
        <BarChart
          data={weeklyBars}
          xKey="week"
          bars={[
            { key: "total", name: "Lead mới", color: "#F97316" },
            { key: "converted", name: "Chuyển đổi", color: "#7C3AED" },
          ]}
          height={240}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Việc cần làm */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Việc cần làm ({overdue.length} quá hạn · {dueToday.length} hôm nay)
          </h2>
          {overdue.length + dueToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có việc đến hạn.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {[...overdue, ...dueToday].slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link href={`/leads/${t.leadId}`} className="truncate font-medium text-foreground hover:text-primary">{t.title}</Link>
                  <span className={`shrink-0 text-xs ${t.dueAt < now ? "font-semibold text-state-danger-ink" : "text-muted-foreground"}`}>
                    {formatDateVN(t.dueAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Học thử sắp tới */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <FlaskConical className="h-4 w-4" /> Trải nghiệm sắp tới
          </h2>
          {trials.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có buổi trải nghiệm nào.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {trials.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link href={`/leads/${t.leadId}`} className="truncate font-medium text-foreground hover:text-primary">
                    {t.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.when}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function DashStat({
  label, value, href, tone = "neutral", icon,
}: {
  label: string; value: number | string; href: string; tone?: "neutral" | "ok" | "danger"; icon: React.ReactNode;
}) {
  const toneCls = tone === "danger" ? "text-state-danger-ink" : tone === "ok" ? "text-state-success-ink" : "text-primary";
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 hover:border-primary">
      <div className={`flex items-center gap-2 ${toneCls}`}>{icon}<span className="text-2xl font-bold tabular-nums">{value}</span></div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </Link>
  );
}
