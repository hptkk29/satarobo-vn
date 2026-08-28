import "server-only";
import { db } from "@/lib/db";
import { getModelVisibleCenterIds, scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/filters";
import { daysBetweenVN, vnMonthKey, vnParts, vnDateAt } from "@/lib/time/vn";
import {
  CLOSED_CHILD_STATUSES,
  CONTACT_ACTIVITY_TYPES,
  LOST_CHILD_STATUSES,
  NOT_IN_CARE_LEAD_STATUSES,
  describeDurations,
  safeRate,
} from "@/lib/reports/lead-kpi";

// Tầng ĐỌC của tab "Kinh doanh" (khu vực C): C1 · C2 · C3 · C4 + bảng C-03 / C-05.
// Định nghĩa nghiệp vụ nằm ở `lead-kpi.ts` (thuần, có test); file này chỉ nạp dữ liệu.
//
// ⚠️ HAI TRỤC NGÀY KHÁC NHAU, cố ý — đừng "thống nhất cho gọn":
//   • C1 · C2 · C3 neo `LeadChild.createdAt` (câu hỏi về LỨA vào hệ thống trong kỳ);
//   • C4 và bảng C-03 neo `LeadChild.closedAt` (câu hỏi về THƯƠNG VỤ chốt trong kỳ).
// Gộp về một trục là đổi câu hỏi mà số vẫn hiện ra bình thường.
//
// ⚠️ Khoảng ngày là NỬA MỞ `[dateFrom, dateTo)` ở mọi truy vấn dưới đây (CHUNG-3).
// `resolveScopeFilters` trả `dateTo` = 23:59:59.999 giờ VN, nên dùng `lt` với mốc đó
// sẽ đánh rơi 1 mili-giây cuối ngày; `nextDayStart()` đẩy về 00:00 ngày kế.

/**
 * Phạm vi cơ sở HIỆU LỰC = (bộ lọc người dùng chọn) ∩ (tầm nhìn actor với model `Lead`).
 * `null` = không giới hạn — và chỉ xảy ra khi actor thấy toàn hệ thống VÀ không lọc.
 *
 * 🔴 Đây là chỗ duy nhất được phép biến `f.centerIds = null` thành "không giới hạn".
 * `null` KHÔNG tự an toàn: `injectScope` thoát ngay với model ngoài `SCOPED_MODELS`.
 */
function effectiveCenterIds(actor: Actor, f: ScopeFilters): string[] | null {
  const visible = getModelVisibleCenterIds("Lead", actor);
  if (f.centerIds === null) return visible === "ALL" ? null : visible;
  return visible === "ALL" ? f.centerIds : f.centerIds.filter((c) => visible.includes(c));
}

/** 00:00 giờ VN của ngày KẾ TIẾP `dateTo` — biến `[from, to]` thành nửa mở `[from, to)`. */
function nextDayStart(dateTo: Date): Date {
  const p = vnParts(dateTo);
  return vnDateAt(p.year, p.month, p.day + 1);
}

/** Điều kiện `where` chung của mọi truy vấn theo con: cơ sở + lead cha chưa xoá. */
function childScopeWhere(effective: string[] | null) {
  return {
    // Sau SL-08 `LeadChild` có centerId thật và đã ∈ SCOPED_MODELS ⇒ `scopedDb` tự chèn
    // tầm nhìn actor. Mệnh đề dưới đây là phần LỌC CỦA NGƯỜI DÙNG chồng lên, không
    // phải lớp cách ly — đừng bỏ `scopedDb` vì thấy đã có nó.
    ...(effective ? { centerId: { in: effective } } : {}),
    // `LeadChild` không có `deletedAt` riêng (xoá theo cha bằng onDelete: Cascade),
    // nhưng lead SOFT-delete thì con vẫn nằm đó ⇒ phải lọc qua cha.
    lead: { deletedAt: null },
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// C1 · Tổng lead — §C.6.1
// ════════════════════════════════════════════════════════════════════════════════

/** Số HỌC SINH mới vào hệ thống trong kỳ (không phải số phụ huynh — CHUNG-2). */
export async function countLeadStudents(actor: Actor, f: ScopeFilters): Promise<number> {
  const sdb = scopedDb(actor);
  return sdb.leadChild.count({
    where: {
      createdAt: { gte: f.dateFrom, lt: nextDayStart(f.dateTo) },
      ...childScopeWhere(effectiveCenterIds(actor, f)),
    },
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// C3 · Tỷ lệ thành công theo LỨA — §C.6.3 (gộp luôn C1 để khỏi quét hai lần)
// ════════════════════════════════════════════════════════════════════════════════

export type LeadFunnelResult = {
  total: number;
  closed: number;
  lost: number;
  /** 0..1, `null` khi mẫu số 0. */
  successRate: number | null;
  /**
   * OQ-C2 (27/08): lead `DUPLICATE` **được đếm** vào mẫu số, nhưng phải hiện số riêng
   * ngay cạnh — nguyên văn *"để không ai nghi ngờ"*. Bỏ vế thứ hai là làm hỏng đúng
   * một nửa quyết định, và không cổng nào bắt được.
   */
  duplicateCount: number;
};

export async function getLeadFunnel(actor: Actor, f: ScopeFilters): Promise<LeadFunnelResult> {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);
  const range = { gte: f.dateFrom, lt: nextDayStart(f.dateTo) };
  const base = { createdAt: range, ...childScopeWhere(effective) };

  const [total, closed, lost, duplicateCount] = await Promise.all([
    sdb.leadChild.count({ where: base }),
    // Tử số KHÔNG neo `closedAt` vào kỳ — đó chính là điều làm nó thành tỷ lệ theo LỨA
    // (OQ-C8): hai vế nói về cùng một tập người nên không bao giờ vượt 100%.
    sdb.leadChild.count({
      where: { ...base, status: { in: [...CLOSED_CHILD_STATUSES] }, closedAt: { not: null } },
    }),
    sdb.leadChild.count({ where: { ...base, status: { in: [...LOST_CHILD_STATUSES] } } }),
    sdb.leadChild.count({
      where: { ...base, lead: { deletedAt: null, status: "DUPLICATE" } },
    }),
  ]);

  return { total, closed, lost, successRate: safeRate(closed, total), duplicateCount };
}

// ════════════════════════════════════════════════════════════════════════════════
// C2 · Tỷ lệ đạt mục tiêu lead — §C.6.2
// ════════════════════════════════════════════════════════════════════════════════

export type LeadTargetResult = {
  actual: number;
  /** `null` = CHƯA ĐẶT mục tiêu cho kỳ này (khác hẳn "mục tiêu = 0"). */
  target: number | null;
  /** 0..1, `null` khi chưa đặt mục tiêu. */
  achievedRate: number | null;
  /**
   * Bẫy B2 §C.6.2: bộ lọc mặc định là "01 → hôm nay", nên ngày 05 hằng tháng tỷ lệ
   * luôn ~15% và trông như thảm hoạ. Tỷ lệ này chia thêm cho phần tháng đã trôi qua.
   * `null` khi range không nằm gọn trong một tháng (so tiến độ lúc đó vô nghĩa).
   */
  paceRate: number | null;
  /** Các kỳ "YYYY-MM" mà range chạm tới — để UI nói rõ mẫu số là mục tiêu CẢ THÁNG. */
  periods: string[];
};

export async function getLeadTargetAchievement(
  actor: Actor,
  f: ScopeFilters,
): Promise<LeadTargetResult> {
  const effective = effectiveCenterIds(actor, f);
  const periods = monthsInRange(f.dateFrom, f.dateTo);

  const [actual, rows] = await Promise.all([
    countLeadStudents(actor, f),
    // 🔴 Bẫy B1 §C.6.2 — ĐẾM ĐÔI. Postgres coi NULL là DISTINCT nên "mục tiêu toàn hệ
    // thống tháng 8" và "mục tiêu CS1 tháng 8" TỒN TẠI CÙNG LÚC được. Hai nhánh dưới
    // đây loại trừ nhau: xem toàn hệ thống → CHỈ dòng centerId = null; xem N cơ sở →
    // CHỈ dòng của N cơ sở đó. Không bao giờ trộn.
    //
    // ⚠️ `LeadTarget` ∈ SCOPE_EXEMPT nên `db` trần ở đây là CỐ Ý: đưa vào scopedDb thì
    // dòng `centerId = null` tàng hình với mọi người trừ SUPER_ADMIN. Cách ly nằm ở
    // `effective` — đã giao với tầm nhìn actor ngay trên.
    db.leadTarget.findMany({
      where: {
        period: { in: periods },
        ...(effective ? { centerId: { in: effective } } : { centerId: null }),
      },
      select: { targetCount: true },
    }),
  ]);

  const target = rows.length === 0 ? null : rows.reduce((s, r) => s + r.targetCount, 0);
  const achievedRate = target == null ? null : safeRate(actual, target);

  return { actual, target, achievedRate, paceRate: pace(achievedRate, f), periods };
}

/** Danh sách khoá tháng "YYYY-MM" theo LỊCH VN mà `[from, to]` chạm tới. */
function monthsInRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  const end = vnMonthKey(to);
  let p = vnParts(from);
  // Chặn 120 vòng: range do người dùng nhập, và một `dateTo` rác (năm 9999) sẽ treo
  // server chứ không báo lỗi. 10 năm là quá thừa cho một bộ lọc báo cáo.
  for (let i = 0; i < 120; i++) {
    const cur = vnMonthKey(vnDateAt(p.year, p.month, 1));
    out.push(cur);
    if (cur >= end) break;
    p = vnParts(vnDateAt(p.year, p.month + 1, 1));
  }
  return out;
}

/** Tỷ lệ "so với tiến độ tháng" — chỉ có nghĩa khi range nằm gọn trong MỘT tháng. */
function pace(achievedRate: number | null, f: ScopeFilters): number | null {
  if (achievedRate == null) return null;
  if (vnMonthKey(f.dateFrom) !== vnMonthKey(f.dateTo)) return null;
  const p = vnParts(f.dateTo);
  const daysInMonth = vnParts(vnDateAt(p.year, p.month + 1, 0)).day;
  const elapsed = p.day;
  const progress = elapsed / daysInMonth;
  return progress <= 0 ? null : achievedRate / progress;
}

// ════════════════════════════════════════════════════════════════════════════════
// C4 · Thời gian chốt trung bình — §C.6.4
// ════════════════════════════════════════════════════════════════════════════════

export type CloseTimeResult = {
  /** Số thương vụ chốt TRONG KỲ (mẫu số của avg/median/p90). */
  count: number;
  /** Đơn vị: NGÀY (số thực). `null` khi không có thương vụ nào. */
  avg: number | null;
  median: number | null;
  p90: number | null;
  /**
   * Số dòng bị LOẠI vì `closedAt < createdAt` (dữ liệu bẩn). Hiện ra thay vì lặng lẽ
   * bỏ: một con số âm lọt vào avg sẽ kéo trung bình xuống mà không ai biết vì sao.
   */
  droppedNegative: number;
};

export async function getCloseTimeStats(actor: Actor, f: ScopeFilters): Promise<CloseTimeResult> {
  const sdb = scopedDb(actor);
  const rows = await sdb.leadChild.findMany({
    where: {
      // Trục ngày ở đây là `closedAt`, KHÁC C1/C2/C3 — xem ghi chú đầu file.
      closedAt: { gte: f.dateFrom, lt: nextDayStart(f.dateTo) },
      status: { in: [...CLOSED_CHILD_STATUSES] },
      ...childScopeWhere(effectiveCenterIds(actor, f)),
    },
    select: { createdAt: true, closedAt: true },
  });

  const days: number[] = [];
  let droppedNegative = 0;
  for (const r of rows) {
    if (!r.closedAt) continue;
    const d = (r.closedAt.getTime() - r.createdAt.getTime()) / 86_400_000;
    if (d < 0) {
      droppedNegative++;
      continue;
    }
    days.push(d);
  }

  return { count: days.length, ...describeDurations(days), droppedNegative };
}

// ════════════════════════════════════════════════════════════════════════════════
// C-03 · Bảng "Lead đã chuyển đổi" — §C.6.7
// ════════════════════════════════════════════════════════════════════════════════

export type ConvertedChildRow = {
  leadChildId: string;
  leadId: string;
  parentName: string;
  studentName: string;
  courseName: string | null;
  centerName: string | null;
  saleName: string | null;
  /** THỰC THU quy về con này (VND). Xem ghi chú về `Order.leadChildId` bên dưới. */
  revenue: number;
  /** 0..1 — tử là `revenue`, mẫu là B1 của CÙNG phạm vi + CÙNG kỳ. `null` khi mẫu 0. */
  revenueShare: number | null;
  createdAt: Date;
  closedAt: Date | null;
  /** Số ngày thực từ vào hệ thống đến chốt. */
  daysToClose: number | null;
};

export type ConvertedChildrenResult = {
  rows: ConvertedChildRow[];
  /** Mẫu số của cột "% trên tổng doanh thu" — B1 của cùng phạm vi + kỳ. */
  totalRevenue: number;
  /**
   * 🔴 Số tiền THỰC THU trong kỳ **chưa quy được về con nào** (`Order.leadChildId` null
   * — lead nhiều con nên migration cố ý không đoán). Bảng BẮT BUỘC hiện dòng này:
   * không hiện thì tổng các dòng nhỏ hơn tổng doanh thu và người đọc kết luận là mất
   * tiền, hoặc tệ hơn — không nhận ra chênh lệch.
   */
  unattributedRevenue: number;
};

export async function getConvertedChildren(
  actor: Actor,
  f: ScopeFilters,
  limit = 100,
): Promise<ConvertedChildrenResult> {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);
  const from = f.dateFrom;
  const to = nextDayStart(f.dateTo);

  const children = await sdb.leadChild.findMany({
    where: {
      closedAt: { gte: from, lt: to },
      status: { in: [...CLOSED_CHILD_STATUSES] },
      ...childScopeWhere(effective),
    },
    select: {
      id: true,
      fullName: true,
      centerId: true,
      createdAt: true,
      closedAt: true,
      interestedCourseId: true,
      lead: { select: { id: true, parentName: true, courseId: true, assignedTo: { select: { name: true } } } },
    },
    orderBy: { closedAt: "desc" },
    take: limit,
  });

  // Thực thu quy về con — CHỈ `Payment` đã xác nhận (QĐ B1/B3: "thực thu" = Payment
  // CONFIRMED, KHÔNG dùng `Order.totalAmount`).
  const childIds = children.map((c) => c.id);
  const [paymentsByChild, totalAgg, unattributedAgg] = await Promise.all([
    childIds.length === 0
      ? Promise.resolve([] as { leadChildId: string; amount: number }[])
      : db.payment
          .findMany({
            where: {
              deletedAt: null,
              accountantStatus: "CONFIRMED",
              order: { leadChildId: { in: childIds } },
            },
            select: { amount: true, order: { select: { leadChildId: true } } },
          })
          .then((ps) =>
            ps.map((p) => ({ leadChildId: p.order?.leadChildId ?? "", amount: p.amount })),
          ),
    db.payment.aggregate({
      _sum: { amount: true },
      where: {
        deletedAt: null,
        accountantStatus: "CONFIRMED",
        paidDate: { gte: from, lt: to },
        ...(effective ? { centerId: { in: effective } } : {}),
      },
    }),
    db.payment.aggregate({
      _sum: { amount: true },
      where: {
        deletedAt: null,
        accountantStatus: "CONFIRMED",
        paidDate: { gte: from, lt: to },
        ...(effective ? { centerId: { in: effective } } : {}),
        // `Payment.orderId` là NOT NULL (schema) nên chỉ còn một đường "chưa quy được":
        // đơn tồn tại nhưng chưa gắn con. Đừng thêm nhánh `orderId: null` — Prisma từ
        // chối kiểu, và nếu ép được thì đó là nhánh chết.
        order: { leadChildId: null },
      },
    }),
  ]);

  const revenueByChild = new Map<string, number>();
  for (const p of paymentsByChild) {
    if (!p.leadChildId) continue;
    revenueByChild.set(p.leadChildId, (revenueByChild.get(p.leadChildId) ?? 0) + p.amount);
  }

  const [courseNames, centerNames] = await Promise.all([
    loadCourseNames(children.map((c) => c.interestedCourseId ?? c.lead.courseId)),
    loadCenterNames(children.map((c) => c.centerId)),
  ]);

  const totalRevenue = totalAgg._sum.amount ?? 0;

  return {
    totalRevenue,
    unattributedRevenue: unattributedAgg._sum.amount ?? 0,
    rows: children.map((c) => {
      const revenue = revenueByChild.get(c.id) ?? 0;
      const courseId = c.interestedCourseId ?? c.lead.courseId;
      return {
        leadChildId: c.id,
        leadId: c.lead.id,
        parentName: c.lead.parentName,
        studentName: c.fullName,
        courseName: courseId ? (courseNames.get(courseId) ?? null) : null,
        centerName: c.centerId ? (centerNames.get(c.centerId) ?? null) : null,
        saleName: c.lead.assignedTo?.name ?? null,
        revenue,
        revenueShare: safeRate(revenue, totalRevenue),
        createdAt: c.createdAt,
        closedAt: c.closedAt,
        daysToClose: c.closedAt
          ? (c.closedAt.getTime() - c.createdAt.getTime()) / 86_400_000
          : null,
      };
    }),
  };
}

/**
 * `LeadChild.interestedCourseId` là THAM CHIẾU MỀM (không FK) — Prisma không sinh
 * relation nên phải tự nạp tên. Cố ý không thêm FK cứng: đó là migration đổi ràng buộc
 * trên bảng đang có dữ liệu prod, không thuộc story này.
 */
async function loadCourseNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map();
  const rows = await db.course.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function loadCenterNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map();
  const rows = await db.center.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ════════════════════════════════════════════════════════════════════════════════
// C-05 · Bảng "Lead rớt" + cột "số ngày chưa tiếp cận lại" — §C.6.5 · §C.6.8
// ════════════════════════════════════════════════════════════════════════════════

export type LostChildRow = {
  leadChildId: string;
  leadId: string;
  parentName: string;
  studentName: string;
  courseName: string | null;
  saleName: string | null;
  createdAt: Date;
  lastContactAt: Date | null;
  daysSinceContact: number;
  /** QĐ 12(b): ô ghi chú TỰ DO ở cấp phụ huynh — không lọc/nhóm/đếm theo lý do được. */
  lostNote: string | null;
  lostAt: Date | null;
};

export async function getLostChildren(
  actor: Actor,
  f: ScopeFilters,
  now = new Date(),
  limit = 100,
): Promise<LostChildRow[]> {
  const sdb = scopedDb(actor);
  const children = await sdb.leadChild.findMany({
    where: {
      status: { in: [...LOST_CHILD_STATUSES] },
      updatedAt: { gte: f.dateFrom, lt: nextDayStart(f.dateTo) },
      ...childScopeWhere(effectiveCenterIds(actor, f)),
    },
    select: {
      id: true,
      fullName: true,
      createdAt: true,
      interestedCourseId: true,
      lead: {
        select: {
          id: true,
          parentName: true,
          courseId: true,
          createdAt: true,
          lostNote: true,
          lostAt: true,
          assignedTo: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const lastContact = await loadLastContactAt(children.map((c) => c.lead.id));
  const courseNames = await loadCourseNames(
    children.map((c) => c.interestedCourseId ?? c.lead.courseId),
  );

  return children.map((c) => {
    const contactAt = lastContact.get(c.lead.id) ?? null;
    const courseId = c.interestedCourseId ?? c.lead.courseId;
    return {
      leadChildId: c.id,
      leadId: c.lead.id,
      parentName: c.lead.parentName,
      studentName: c.fullName,
      courseName: courseId ? (courseNames.get(courseId) ?? null) : null,
      saleName: c.lead.assignedTo?.name ?? null,
      createdAt: c.createdAt,
      lastContactAt: contactAt,
      // Chưa tiếp cận lần nào ⇒ đồng hồ chạy từ lúc lead vào hệ thống (cùng cách
      // `isLeadIdle` xử lý), KHÔNG phải bỏ trống — lead chưa ai gọi mới là lead đáng lo nhất.
      daysSinceContact: daysBetweenVN(contactAt ?? c.lead.createdAt, now),
      lostNote: c.lead.lostNote,
      lostAt: c.lead.lostAt,
    };
  });
}

export type StaleLeadRow = {
  leadId: string;
  parentName: string;
  phone: string;
  saleName: string | null;
  lastContactAt: Date | null;
  daysSinceContact: number;
};

/**
 * C-05-2 — cột "số ngày chưa tiếp cận lại" cho bảng lead ĐANG CHĂM (chưa chốt/rớt).
 *
 * 🔴 Dùng BIẾN THỂ A (đọc thẳng `LeadActivity`), KHÔNG dùng `Lead.lastActivityAt`.
 * Cột đó hiện sai theo hướng TRẤN AN: 12/15 đường tạo `LeadActivity` không bump nó, nên
 * lead treo trông như vừa được chăm. Chuyển sang biến thể B chỉ khi N-4 đã vá XONG và
 * đã backfill — và lúc đó phải đo lại, đừng tin cột.
 */
export async function getStaleLeads(
  actor: Actor,
  f: ScopeFilters,
  now = new Date(),
  limit = 100,
): Promise<StaleLeadRow[]> {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);
  const leads = await sdb.lead.findMany({
    where: {
      deletedAt: null,
      status: { notIn: [...NOT_IN_CARE_LEAD_STATUSES] },
      ...(effective ? { centerId: { in: effective } } : {}),
    },
    select: {
      id: true,
      parentName: true,
      phone: true,
      createdAt: true,
      assignedTo: { select: { name: true } },
    },
    // Bảng này để tìm lead BỊ BỎ QUÊN nên không giới hạn theo range ngày của bộ lọc:
    // một lead treo từ tháng trước vẫn phải hiện khi đang xem tháng này.
    take: 500,
  });

  const lastContact = await loadLastContactAt(leads.map((l) => l.id));
  return leads
    .map((l) => {
      const contactAt = lastContact.get(l.id) ?? null;
      return {
        leadId: l.id,
        parentName: l.parentName,
        phone: l.phone,
        saleName: l.assignedTo?.name ?? null,
        lastContactAt: contactAt,
        daysSinceContact: daysBetweenVN(contactAt ?? l.createdAt, now),
      };
    })
    .sort((a, b) => b.daysSinceContact - a.daysSinceContact)
    .slice(0, limit);
}

/**
 * Mốc TIẾP CẬN gần nhất của từng lead — §C.6.5 biến thể A.
 *
 * BA điều kiện, không phải một:
 *  1. `type ∈ {CALL, MESSAGE, NOTE, EMAIL}` — loại `STATUS_CHANGE`/`HANDOVER` (OQ-C4);
 *  2. `actorId != null` — dòng do hệ thống sinh mang `actorId` rỗng;
 *  3. 🔴 `metadata.system != true` — **điều kiện PRD không nêu, thêm sau khi đo mã**.
 *
 * Vì sao cần điều kiện 3. Đường bàn giao lead hàng loạt (`lib/lead/assignment-core.ts`)
 * ghi `createMany` với `type` mặc định **`NOTE`** và `actorId` là **người thật** đang
 * bấm bàn giao — tức nó lọt qua cả hai điều kiện đầu. Hệ quả nếu bỏ điều kiện 3: mỗi
 * lần chuyển sale, đồng hồ "chưa tiếp cận lại" của **cả trăm lead về 0 cùng lúc** và
 * bảng lead treo sạch bong — đúng thứ "làm đẹp giả" mà OQ-C4 muốn chặn, chỉ đi bằng
 * cửa khác. Những dòng đó tự đánh dấu bằng `metadata.system = true`; cờ đó đặt SAU cùng
 * trong object nên caller không đè được.
 */
async function loadLastContactAt(leadIds: string[]): Promise<Map<string, Date>> {
  const uniq = [...new Set(leadIds)];
  if (uniq.length === 0) return new Map();
  const rows = await db.leadActivity.groupBy({
    by: ["leadId"],
    where: {
      leadId: { in: uniq },
      type: { in: [...CONTACT_ACTIVITY_TYPES] },
      actorId: { not: null },
      NOT: { metadata: { path: ["system"], equals: true } },
    },
    _max: { createdAt: true },
  });
  const out = new Map<string, Date>();
  for (const r of rows) if (r._max.createdAt) out.set(r.leadId, r._max.createdAt);
  return out;
}
