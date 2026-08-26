import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import {
  applyLeadReassignment,
  archiveDmOfPreviousSale,
} from "@/lib/lead/assignment-core";
import type { LeadStatus, LeadAssignMode } from "@prisma/client";
import {
  pickRoundRobin,
  pickByCloseRate,
  pickCenterEvenly,
  type SaleStat,
} from "@/lib/lead/assign-strategy";

// Module CRM & Lead PHẦN 2 — chia lead tự động (cơ sở → chế độ) + khoá khi đã tương tác.
//
// ⭐ PHẦN "ĐỔI CHỦ" DÙNG CHUNG NẰM Ở `lib/lead/assignment-core.ts`
//
// `assignedToId` + `assignedAt` + `Enrollment.saleId` (luật L1/L2) + dòng thời gian đi qua
// {@link applyLeadReassignment}. **Hai luật L1/L2 viết đầy đủ ở khối đầu module đó.**
//
// ⚠️ HAI HÀM Ở FILE NÀY CỐ Ý KHÔNG GIỐNG NHAU về việc kéo `Enrollment.saleId` — đọc kỹ
// trước khi "sửa cho đều":
//
//  • `manualAssignLead` PHẢI kéo. Nó KHÔNG lọc status, nên gọi được trên lead `ENROLLED`
//    — đúng nhóm đã sinh `Enrollment` mang `saleId` của sale cũ, và cũng là nhóm quyết
//    định kênh riêng Sale↔PH (`DM_SALE_PARENT`, xem `findSaleAssignedEnrollmentIds` trong
//    lib/chat/dm.ts). Đây lại là đường đổi chủ 1-lead thường dùng nhất trên giao diện.
//
//  • `autoAssignNewLead` TẮT TƯỜNG MINH phần kéo. Nó thoát sớm khi `lead.assignedToId`
//    khác null (xem dòng tương ứng bên dưới) ⇒ CHỈ chạy trên lead chưa ai phụ trách; mà
//    `Enrollment.saleId` được sinh đúng bằng `lead.assignedToId ?? null` lúc convert
//    (`lib/crm/convert-lead-v2.ts`, `lib/crm/convert-lead.ts`) ⇒ mọi ghi danh truy vết về
//    lead đó có `saleId = null`. KHÔNG tồn tại "sale cũ" để kéo. Kéo ở đây không phải là
//    "làm cho đều" mà là NHẬN VƠ: lượt chia lead mới sẽ vơ hết ghi danh mà ai đó vừa cố ý
//    GỠ sale ở màn học viên của lớp (`app/(admin)/admin/classes/[id]/students/_actions.ts`
//    — đường DUY NHẤT gỡ được cột đó bằng giao diện).

export const TERMINAL_LEAD_STATUSES: LeadStatus[] = ["ENROLLED", "LOST", "DUPLICATE"];

export type Actor = { actorId: string | null; actorName: string };

/**
 * Luật E-bis #2 của module chat: transaction gánh thêm việc phải nới trần (mặc định Prisma
 * là 5s/2s). `manualAssignLead` nay còn đọc + ghi `Enrollment.saleId` trong cùng tx.
 */
const ASSIGN_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

/**
 * Lead "đã có tương tác" của sale (gọi/nhắn/email/bàn giao hoặc ghi chú KHÔNG
 * phải hệ thống) → KHÔNG auto-chia lại.
 */
export async function hasSaleInteraction(leadId: string): Promise<boolean> {
  const n = await db.leadActivity.count({
    where: {
      leadId,
      OR: [
        { type: { in: ["CALL", "MESSAGE", "EMAIL", "HANDOVER"] } },
        { AND: [{ type: "NOTE" }, { NOT: { metadata: { path: ["system"], equals: true } } }] },
      ],
    },
  });
  return n > 0;
}

/** Chế độ chia của 1 cơ sở (mặc định ROUND_ROBIN nếu chưa cấu hình). */
export async function getCenterMode(centerId: string): Promise<LeadAssignMode> {
  const cfg = await db.leadAssignmentConfig.findUnique({
    where: { centerId },
    select: { mode: true },
  });
  return cfg?.mode ?? "ROUND_ROBIN";
}

/** Thống kê sale active trong cơ sở: tải hiện tại + chốt/đã xử lý 30 ngày gần nhất. */
export async function getSaleStats(centerId: string | null): Promise<SaleStat[]> {
  const sales = await db.user.findMany({
    where: { roles: { has: "SALES_CSM" }, isActive: true, deletedAt: null, ...(centerId ? { centerId } : {}) },
    select: { id: true },
  });
  if (sales.length === 0) return [];
  const ids = sales.map((s) => s.id);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [openCounts, handledGroups] = await Promise.all([
    db.lead.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: ids }, deletedAt: null, status: { notIn: TERMINAL_LEAD_STATUSES } },
      _count: { id: true },
    }),
    db.lead.groupBy({
      by: ["assignedToId", "status"],
      where: {
        assignedToId: { in: ids },
        deletedAt: null,
        status: { in: ["ENROLLED", "LOST"] },
        updatedAt: { gte: since },
      },
      _count: { id: true },
    }),
  ]);

  const openMap = new Map(openCounts.map((c) => [c.assignedToId, c._count.id]));
  const closedMap = new Map<string, number>();
  const handledMap = new Map<string, number>();
  for (const g of handledGroups) {
    if (!g.assignedToId) continue;
    handledMap.set(g.assignedToId, (handledMap.get(g.assignedToId) ?? 0) + g._count.id);
    if (g.status === "ENROLLED") {
      closedMap.set(g.assignedToId, (closedMap.get(g.assignedToId) ?? 0) + g._count.id);
    }
  }

  return sales.map((s) => ({
    id: s.id,
    openCount: openMap.get(s.id) ?? 0,
    closed: closedMap.get(s.id) ?? 0,
    handled: handledMap.get(s.id) ?? 0,
  }));
}

/** Tải lead mở theo cơ sở (cho chia đều giữa các cơ sở vận hành). */
async function getCenterLoads(centerIds: string[]) {
  const counts = await db.lead.groupBy({
    by: ["centerId"],
    where: { centerId: { in: centerIds }, deletedAt: null, status: { notIn: TERMINAL_LEAD_STATUSES } },
    _count: { id: true },
  });
  const map = new Map(counts.map((c) => [c.centerId, c._count.id]));
  return centerIds.map((id) => ({ centerId: id, openCount: map.get(id) ?? 0 }));
}

export type AutoAssignResult = {
  ok: boolean;
  skipped?: boolean;
  assignedToId?: string | null;
  centerId?: string | null;
  mode?: LeadAssignMode;
  error?: string;
};

/**
 * Chia 1 lead MỚI: (1) định cơ sở (lead có cơ sở → giữ; chưa có → chia đều
 * giữa các cơ sở vận hành đang hoạt động); (2) trong cơ sở theo chế độ. Bỏ qua nếu lead đã được gán hoặc đã có
 * tương tác (khoá auto).
 */
export async function autoAssignNewLead(leadId: string, actor: Actor): Promise<AutoAssignResult> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, centerId: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  if (lead.assignedToId) return { ok: true, skipped: true, assignedToId: lead.assignedToId };
  if (await hasSaleInteraction(leadId)) return { ok: true, skipped: true };

  // (1) Cơ sở — chia đều cho MỌI cơ sở vận hành đang hoạt động (CS3/CS4 thêm
  // không cần sửa code).
  //
  // ⚠️ Bản cũ ghi "HO không có row Center nên tự loại khỏi phân phối lead" — SAI với
  // dữ liệu thật: `Center(hoi-so)` CÓ tồn tại và `isActive: true` (đo 04/08/2026), nên
  // `pickCenterEvenly` chia được lead từ web về Hội sở. Loại tường minh qua OrgUnit tree.
  let centerId = lead.centerId;
  if (!centerId) {
    const [csAll, nonEnrollable] = await Promise.all([
      db.center.findMany({ where: { isActive: true }, select: { id: true } }),
      getNonEnrollableCenterIds(),
    ]);
    const cs = csAll.filter((c) => !nonEnrollable.includes(c.id));
    if (cs.length > 0) {
      const loads = await getCenterLoads(cs.map((c) => c.id));
      centerId = pickCenterEvenly(loads);
      if (centerId) {
        // PR-C dual-write: chia về cơ sở → suy orgUnitId tương ứng (giữ cả centerId).
        const orgUnitId = await orgUnitIdForCenter(centerId);
        await db.lead.update({ where: { id: leadId }, data: { centerId, orgUnitId } });
      }
    }
  }

  // (2) Chế độ trong cơ sở.
  const mode = centerId ? await getCenterMode(centerId) : "ROUND_ROBIN";
  if (mode === "MANUAL") {
    return { ok: true, assignedToId: null, centerId, mode }; // chờ quản lý gán tay
  }

  let stats = await getSaleStats(centerId);
  if (stats.length === 0 && centerId) stats = await getSaleStats(null); // fallback toàn hệ thống
  const target = mode === "CLOSE_RATE" ? pickByCloseRate(stats) : pickRoundRobin(stats);
  if (!target) return { ok: true, assignedToId: null, centerId, mode }; // không có sale → để trống

  const targetUser = await db.user.findUnique({
    where: { id: target },
    // `centerId` là dữ kiện của luật L2. Ở đường này phần kéo bị tắt nên nó không được
    // dùng tới, nhưng tham số `toSaleCenterId` của helper là BẮT BUỘC (cố ý — `?? null`
    // lặng lẽ ở call-site sẽ gỡ sạch mọi ghi danh có cơ sở), nên truyền giá trị THẬT
    // thay vì bịa `null`.
    select: { name: true, centerId: true },
  });
  await db.$transaction(async (tx) => {
    const res = await applyLeadReassignment({
      tx,
      leadIds: [leadId],
      // Luôn null ở đây — hàm đã thoát sớm khi lead có người phụ trách.
      fromUserId: lead.assignedToId,
      toUserId: target,
      toSaleCenterId: targetUser?.centerId ?? null,
      leadData: lead.status === "NEW" ? { status: "ASSIGNED" as LeadStatus } : undefined,
      // ⛔ TẮT TƯỜNG MINH — lý lẽ đầy đủ ở khối đầu file. Tóm tắt: hàm chỉ chạy trên lead
      // chưa ai phụ trách ⇒ không có "sale cũ"; suy diễn thành `saleId: null` là VƠ hết
      // ghi danh mà ai đó vừa cố ý gỡ sale ở màn học viên của lớp.
      skipEnrollmentPull: {
        reason:
          "chỉ chạy trên lead chưa có người phụ trách ⇒ không tồn tại sale cũ để kéo (kéo ở đây là nhận vơ ghi danh mồ côi)",
      },
      activity: {
        actorId: actor.actorId,
        actorName: actor.actorName,
        content: `Tự động chia cho ${targetUser?.name ?? target} (${mode === "CLOSE_RATE" ? "tỷ lệ chốt" : "luân phiên"})`,
        // Cờ `system: true` do helper ép vào — giữ nguyên hành vi cũ (`SYSTEM_META`).
      },
    });
    if (res.leadsMoved === 0) {
      // Bản cũ dùng `tx.lead.update` → ném P2025 khi lead biến mất giữa chừng. `updateMany`
      // trả 0 im lặng, nên phải ném lại để audit + activity không commit cho lead đã mất.
      throw new Error(`Lead ${leadId} không còn tồn tại khi ghi phân công`);
    }
    await logLeadAudit({
      leadId,
      action: "ASSIGN",
      actorId: actor.actorId,
      actorName: actor.actorName,
      oldValues: { assignedToId: null },
      newValues: { assignedToId: target },
      changedFields: ["assignedToId"],
      tx,
    });
  }, ASSIGN_TX_OPTIONS);

  return { ok: true, assignedToId: target, centerId, mode };
}

/**
 * Chuyển lead sang cơ sở mới → chia theo CHẾ ĐỘ cơ sở mới (PHẦN 3). KHÔNG bị
 * khoá tương tác (đây là chuyển có chủ đích). Trả về sale được chọn (hoặc null
 * nếu MANUAL / không có sale).
 */
export async function reassignForCenter(
  centerId: string,
  excludeSaleId?: string | null,
): Promise<string | null> {
  const mode = await getCenterMode(centerId);
  if (mode === "MANUAL") return null;
  let stats = (await getSaleStats(centerId)).filter((s) => s.id !== excludeSaleId);
  if (stats.length === 0) stats = (await getSaleStats(null)).filter((s) => s.id !== excludeSaleId);
  return mode === "CLOSE_RATE" ? pickByCloseRate(stats) : pickRoundRobin(stats);
}

/**
 * Quản lý gán tay 1 lead cho 1 sale cụ thể.
 *
 * ⚠️ Hàm KHÔNG lọc status ⇒ chạy được trên lead `ENROLLED`, nên nó phải kéo theo
 * `Enrollment.saleId` (cột quyết định kênh riêng Sale↔PH) — xem khối đầu file.
 */
export async function manualAssignLead(
  leadId: string,
  saleId: string,
  actor: Actor,
): Promise<{
  ok: boolean;
  error?: string;
  /** Số ghi danh đổi sale phụ trách — kênh riêng Sale↔PH sống trên cột này. */
  enrollmentsMoved?: number;
  /** Số ghi danh bị GỠ phân công vì sale nhận khác cơ sở (luật L2). */
  enrollmentsUnassigned?: number;
  /** Số ghi danh khác cơ sở GIỮ NGUYÊN sale cũ (luật L2, `strandedPolicy = "KEEP"`). */
  enrollmentsKept?: number;
  /** Số kênh riêng của sale CŨ đã chuyển chỉ-đọc vì hết phân công. */
  dmArchived?: number;
}> {
  const [lead, sale] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true, status: true } }),
    db.user.findFirst({
      where: { id: saleId, roles: { has: "SALES_CSM" }, deletedAt: null },
      // `centerId` là dữ kiện của luật L2 — so với cơ sở của SALE NHẬN, không phải cơ sở
      // của lead (`Enrollment.centerId` là bản sao cơ sở của LỚP).
      select: { id: true, name: true, centerId: true },
    }),
  ]);
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  if (!sale) return { ok: false, error: "Sale không hợp lệ" };

  const fromUserId = lead.assignedToId;
  // Gán lại cho CHÍNH người đang phụ trách: kéo X→X vô nghĩa, nhưng luật L2 vẫn chạy ⇒
  // ghi danh khác cơ sở với X sẽ bị GỠ sạch trong một thao tác mà người dùng tưởng là
  // no-op. Tắt tường minh.
  const skipEnrollmentPull =
    fromUserId !== null && fromUserId === sale.id
      ? { reason: "gán lại cho chính người đang phụ trách — không có sale cũ để kéo" }
      : undefined;

  const outcome = await db.$transaction(async (tx) => {
    // `leadWhere` bỏ trống có chủ đích: bản cũ ghi thẳng theo id (`tx.lead.update`), và
    // gán tay là hành động có chủ đích của người vận hành — thêm điều kiện ở đây sẽ biến
    // một cuộc đua thành no-op im lặng mà vẫn báo thành công.
    const res = await applyLeadReassignment({
      tx,
      leadIds: [leadId],
      fromUserId,
      toUserId: saleId,
      toSaleCenterId: sale.centerId,
      leadData: lead.status === "NEW" ? { status: "ASSIGNED" as LeadStatus } : undefined,
      // Sale cũ ở đây CÒN LÀM VIỆC (quản lý gán tay giữa lúc vận hành), nên ghi danh khác
      // cơ sở giữ nguyên người phụ trách. `UNASSIGN` chỉ dành cho đường sale nghỉ việc —
      // gỡ ở đây là xoá một phân công đang chạy tốt, phụ huynh mất luôn kênh riêng.
      strandedPolicy: "KEEP",
      skipEnrollmentPull,
      activity: {
        actorId: actor.actorId,
        actorName: actor.actorName,
        content: `Gán tay cho ${sale.name ?? saleId}`,
        // Cờ `system: true` do helper ép vào — giữ nguyên hành vi cũ (`SYSTEM_META`).
      },
    });
    if (res.leadsMoved === 0) {
      // Giữ đúng tính chất "hỏng thì không ghi gì" của `tx.lead.update` cũ (ném P2025).
      throw new Error(`Lead ${leadId} không còn tồn tại khi ghi phân công`);
    }
    const bucket = res.enrollmentsByLead.get(leadId);
    const extraValues: Record<string, unknown> = {};
    const extraFields: string[] = [];
    // CHỈ thêm khoá khi có dòng thật ⇒ lượt gán tay không đụng ghi danh nào (đường thường)
    // giữ nguyên `newValues` như trước bản này, nhật ký cũ và mới so được với nhau.
    if (bucket && bucket.moved.length > 0) {
      extraValues.enrollmentSaleMoved = bucket.moved;
      extraFields.push("enrollmentSaleMoved");
    }
    if (bucket && bucket.unassigned.length > 0) {
      extraValues.enrollmentSaleUnassigned = bucket.unassigned;
      extraFields.push("enrollmentSaleUnassigned");
    }
    // Ghi danh khác cơ sở GIỮ cho sale cũ: từ đây `Lead.assignedToId` và
    // `Enrollment.saleId` cố ý không trùng nhau — phải có dòng nhật ký giải thích.
    if (bucket && bucket.kept.length > 0) {
      extraValues.enrollmentSaleKept = bucket.kept;
      extraFields.push("enrollmentSaleKept");
    }
    await logLeadAudit({
      leadId,
      action: "ASSIGN",
      actorId: actor.actorId,
      actorName: actor.actorName,
      oldValues: { assignedToId: lead.assignedToId },
      newValues: { assignedToId: saleId, ...extraValues },
      changedFields: ["assignedToId", ...extraFields],
      tx,
    });
    return res;
  }, ASSIGN_TX_OPTIONS);

  // Hiệu ứng phụ NGOÀI transaction (luật cứng module chat #2: hỏng thì log, không rollback).
  const dmArchived =
    fromUserId !== null && skipEnrollmentPull === undefined
      ? await archiveDmOfPreviousSale(fromUserId, outcome.affectedParentIds)
      : 0;

  return {
    ok: true,
    enrollmentsMoved: outcome.enrollmentsMoved,
    enrollmentsUnassigned: outcome.enrollmentsUnassigned,
    enrollmentsKept: outcome.enrollmentsKept,
    dmArchived,
  };
}
