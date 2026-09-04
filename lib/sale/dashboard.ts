/**
 * Site Sale — DỮ LIỆU cho màn `/sale/dashboard`.
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/dashboard/_components/sales-dashboard.tsx` ══
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale TÁCH BẢN RIÊNG, không dùng chung
 * component với khu quản trị nữa, để thiết kế lại site Sale mà KHÔNG đụng một
 * pixel nào của khu quản trị. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn chọn
 * đường này.
 *
 * Bản admin truy vấn NGAY TRONG component (`getSalesStats` không export, phần
 * "live" nằm thẳng trong thân `SalesDashboard`) nên không có gì để gọi lại. Chép
 * vào đây thay vì vào `page.tsx` của Sale để phần trôi lệch nằm ở MỘT tệp có
 * tên, đọc được, và sau này gộp lại được — chứ không lẫn vào JSX.
 *
 * ── DÙNG LẠI ĐƯỢC GÌ Ở `lib/` (KHÔNG chép) ─────────────────────────────────
 *   `resolveActor` · `scopedDb` · `getModelVisibleCenterIds`  — cách ly cơ sở
 *   `KANBAN_COLUMNS` · `LEAD_STATUS_LABEL` · `CONVERTED_STATUSES` — lib/leads/status
 *   `groupByWeek`                                              — lib/reports/lead
 *   `getNearingEndEnrollments`                                 — lib/students/renewal
 *   `safeCache` + `CACHE_TAGS`                                 — lib/cache/*
 *   `maskPersonName`                                           — lib/lead/pii
 * Nghĩa là phần chép thật sự chỉ còn 5 truy vấn Prisma + phép ghép trial.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. Bộ 5 truy vấn của `docSoLieuSale()` (pipeline / tổng / chốt tháng / sắp
 *      hết khoá / 8 tuần).
 *   2. Cách tính `tyLeChot` (cộng theo `CONVERTED_STATUSES`, KHÔNG gõ tay tên
 *      trạng thái — xem cảnh báo trong bản admin: `countByStatus` là
 *      `Record<string, number>` nên tra khoá sai không làm tsc đỏ, và khoá
 *      "ENROLLED" cũ từng khiến MỌI sale hiện 0%).
 *   3. Cách vào lớp trải nghiệm từ `TrialClassV2` (KHÔNG truy vấn thẳng
 *      `TrialClassSession`: model đó không thuộc `SCOPED_MODELS`, vào thẳng là
 *      Sale cơ sở này thấy hẹn của cơ sở kia).
 *   4. Phép ghép `TrialEnrollment.scheduledSessionId` ↔ buổi (cột TRẦN, không
 *      FK, Prisma không join hộ) và cách đọc `@db.Date` theo UTC.
 *
 * ── MỘT CHỖ CỐ Ý KHÁC BẢN ADMIN: CHE PII ────────────────────────────────────
 * Bản admin in thẳng tên phụ huynh/con trong khối "Trải nghiệm sắp tới" mà không
 * qua tầng che nào, trong khi màn chủ của chính site Sale (`app/(sale)/sale/page.tsx`)
 * thì có. Nửa che nửa không TRONG CÙNG MỘT SITE là kiểu rò khó thấy nhất: người
 * xem tưởng cả site đã được che. Ở đây che, và che Ở MÁY CHỦ — tên chưa từng
 * rời khỏi tiến trình server dưới dạng chưa che, thay vì gửi xuống trình duyệt
 * rồi mới giấu bằng CSS/JS.
 * (Nhan đề việc `LeadTask.title` KHÔNG che — bản admin lẫn màn chủ Sale đều để
 * nguyên; che một nửa nữa ở đây là lại tạo chỗ lệch.)
 */
import "server-only";
import type { LeadStatus } from "@prisma/client";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { safeCache } from "@/lib/cache/safe-cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { KANBAN_COLUMNS, LEAD_STATUS_LABEL, CONVERTED_STATUSES } from "@/lib/leads/status";
import { getNearingEndEnrollments } from "@/lib/students/renewal";
import { groupByWeek, type LeadReportRecord } from "@/lib/reports/lead";
import { maskPersonName } from "@/lib/lead/pii";

/** Một bậc trong phễu lead của tôi. */
export type OGiaiDoan = { trangThai: LeadStatus; nhan: string; soLuong: number };

/** Một tuần trong bảng phễu 8 tuần. */
export type ODongTuan = { nhan: string; moi: number; chuyenDoi: number };

/** Một việc follow-up đến hạn. `dueAt` là Date — khối này KHÔNG được cache. */
export type OViec = { id: string; title: string; dueAt: Date; leadId: string };

/** Một buổi trải nghiệm sắp tới. `ten` ĐÃ che ở máy chủ nếu thiếu quyền PII. */
export type OTrial = { id: string; leadId: string; ten: string; luc: string };

export type SoLieuSale = {
  tongKhachCuaToi: number;
  chotTrongThang: number;
  /** Phần trăm nguyên (0–100). */
  tyLeChot: number;
  giaiDoan: OGiaiDoan[];
  tuan: ODongTuan[];
  sapHetKhoa: number;
};

export type DuLieuDashboardSale = SoLieuSale & {
  quaHan: OViec[];
  homNay: OViec[];
  trial: OTrial[];
};

/**
 * Phần TỔNG HỢP — chỉ số nguyên và chuỗi, không `Date`/`Map`, nên cache được.
 *
 * ⚠️ Khoá cache CỐ Ý khác bản admin (`sales-dashboard-stats`). Hai bản là hai
 * bản đôi sẽ trôi lệch; dùng chung khoá là để một bên sửa hình dạng dữ liệu rồi
 * bên kia đọc phải bản cũ trong 60 giây — một lỗi chỉ hiện ra sau khi deploy và
 * không tái hiện được ở máy local.
 */
async function docSoLieuSale(userId: string): Promise<SoLieuSale> {
  const now = new Date();
  const dauThang = new Date(now.getFullYear(), now.getMonth(), 1);
  const tamTuanTruoc = new Date(now.getTime() - 8 * 7 * 86_400_000);
  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);

  const [pipeline, tong, chotThang, sapHet, leadTheoTuan] = await Promise.all([
    sdb.lead.groupBy({
      by: ["status"],
      where: { assignedToId: userId, deletedAt: null },
      _count: { _all: true },
    }),
    sdb.lead.count({ where: { assignedToId: userId, deletedAt: null } }),
    sdb.lead.count({
      where: {
        assignedToId: userId,
        deletedAt: null,
        status: "DA_DANG_KY",
        updatedAt: { gte: dauThang },
      },
    }),
    getNearingEndEnrollments(),
    sdb.lead.findMany({
      where: { assignedToId: userId, deletedAt: null, createdAt: { gte: tamTuanTruoc } },
      select: { createdAt: true, status: true },
    }),
  ]);

  const theoTrangThai: Record<string, number> = {};
  for (const p of pipeline) theoTrangThai[p.status] = p._count._all;

  const banGhi: LeadReportRecord[] = leadTheoTuan.map((l) => ({
    status: l.status,
    source: null,
    centerId: null,
    commissionSource: null,
    createdAt: l.createdAt,
  }));

  // Cộng theo `CONVERTED_STATUSES` — nguồn duy nhất. Gõ tay tên trạng thái ở đây
  // là lỗi đã xảy ra một lần và không làm tsc đỏ (xem đầu tệp, nợ #2).
  const daChot = [...CONVERTED_STATUSES].reduce((s, st) => s + (theoTrangThai[st] ?? 0), 0);

  return {
    tongKhachCuaToi: tong,
    chotTrongThang: chotThang,
    tyLeChot: tong > 0 ? Math.round((daChot / tong) * 100) : 0,
    giaiDoan: KANBAN_COLUMNS.map((s) => ({
      trangThai: s,
      nhan: LEAD_STATUS_LABEL[s],
      soLuong: theoTrangThai[s] ?? 0,
    })),
    tuan: groupByWeek(banGhi, 8, now).map((w) => ({
      nhan: w.label,
      moi: w.total,
      chuyenDoi: w.converted,
    })),
    sapHetKhoa: sapHet.length,
  };
}

/**
 * Toàn bộ dữ liệu màn `/sale/dashboard`.
 *
 * @param hienPii `false` ⇒ tên người được che NGAY TẠI ĐÂY, trước khi rời server.
 */
export async function layDuLieuDashboardSale({
  userId,
  hienPii,
}: {
  userId: string;
  hienPii: boolean;
}): Promise<DuLieuDashboardSale> {
  const now = new Date();
  const dauNgay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cuoiNgay = new Date(dauNgay);
  cuoiNgay.setDate(cuoiNgay.getDate() + 1);

  const actor = await resolveActor(userId);
  const sdb = scopedDb(actor);

  // `LeadTask` không tự được `scopedDb` cắt theo cơ sở — cắt qua lead cha.
  const thayCoSoLead = getModelVisibleCenterIds("Lead", actor);
  const phamViViec =
    thayCoSoLead === "ALL" ? {} : { lead: { centerId: { in: thayCoSoLead } } };

  const [viecMo, lopTrial, soLieu] = await Promise.all([
    sdb.leadTask.findMany({
      where: { assignedToId: userId, status: "OPEN", ...phamViViec },
      orderBy: { dueAt: "asc" },
      take: 50,
      select: { id: true, title: true, dueAt: true, leadId: true },
    }),
    // Vào từ LỚP (`TrialClassV2` ∈ SCOPED_MODELS) để giữ cách ly cơ sở — xem nợ
    // #3 ở đầu tệp. Lọc ghi danh theo Sale phụ trách lead: một lớp trải nghiệm
    // chứa con của nhiều Sale.
    sdb.trialClassV2.findMany({
      where: {
        status: { not: "CANCELLED" },
        sessions: { some: { date: { gte: dauNgay }, status: "SCHEDULED" } },
        enrollments: { some: { leadChild: { lead: { assignedToId: userId, deletedAt: null } } } },
      },
      take: 20,
      select: {
        sessions: {
          where: { date: { gte: dauNgay }, status: "SCHEDULED" },
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
    safeCache(() => docSoLieuSale(userId), ["sale-dashboard-stats", userId], {
      tags: [CACHE_TAGS.dashboard],
      revalidate: 60,
    })(),
  ]);

  const che = (v: string | null): string => (hienPii ? (v ?? "—") : maskPersonName(v));

  const trial = lopTrial
    .flatMap((c) =>
      c.enrollments.map((e) => {
        const buoi = c.sessions.find((s) => s.id === e.scheduledSessionId);
        if (!buoi) return null; // ghi danh trỏ buổi đã qua / chưa xếp → không "sắp tới"
        const d = buoi.date;
        // `@db.Date` ⇒ đọc theo UTC mới ra đúng ngày lịch VN (nợ #4).
        const ngay = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        return {
          id: e.id,
          leadId: e.leadChild.lead?.id ?? "",
          ten: che(e.leadChild.fullName || (e.leadChild.lead?.parentName ?? null)),
          luc: `${ngay} ${buoi.startTime}`,
          xep: d.getTime(),
        };
      }),
    )
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.xep - b.xep)
    .slice(0, 6)
    .map(({ xep: _xep, ...rest }) => rest);

  return {
    ...soLieu,
    quaHan: viecMo.filter((t) => t.dueAt < now),
    homNay: viecMo.filter((t) => t.dueAt >= now && t.dueAt < cuoiNgay),
    trial,
  };
}
