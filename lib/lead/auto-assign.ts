import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import {
  applyLeadReassignment,
  archiveDmOfPreviousSale,
} from "@/lib/lead/assignment-core";
import type { LeadStatus, LeadAssignMode, Prisma } from "@prisma/client";
import type { VisibleCenterIds } from "@/lib/lead-handover/service";
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
 * Lead có nằm trong tầm nhìn cơ sở của người bấm không — cùng nghĩa với
 * `passesScope("Lead", …)`: `Lead` KHÔNG thuộc `NULL_IS_GLOBAL_MODELS` nên `centerId = null`
 * là CHẶN với actor cấp cơ sở (khớp đúng điều `scopedDb` làm ở đường đọc → trang chi tiết
 * cũng 404). `"ALL"` = SUPER_ADMIN/HO, hoặc call-site HỆ THỐNG không có người bấm.
 */
function leadOutOfSight(
  centerId: string | null,
  visibleCenterIds: VisibleCenterIds,
): boolean {
  if (visibleCenterIds === "ALL") return false;
  return !centerId || !visibleCenterIds.includes(centerId);
}

/**
 * Điều kiện cách ly cơ sở cho ĐƯỜNG GHI (`leadWhere` của `applyLeadReassignment`).
 *
 * Cổng ĐỌC ở đầu hàm chỉ chặn được ở thời điểm ĐỌC; giữa lúc đó và lúc ghi là khe TOCTOU
 * thật — repo có 7 đường đổi chủ lead cùng tồn tại, và `scopedDb` KHÔNG che đường ghi.
 * `bulkReassignLeads` (lib/lead-handover/service.ts) đã lặp lại nguyên bộ `where` kể cả
 * cách ly cơ sở ở lệnh ghi; hai đường ở file này làm y như vậy.
 *
 * `"ALL"` ⇒ KHÔNG thêm điều kiện nào: thêm `centerId IN (…)` cho SUPER_ADMIN/HO sẽ chặn
 * luôn lead chưa gán cơ sở (luồng lead từ web).
 */
function centerGuardWhere(visibleCenterIds: VisibleCenterIds): Prisma.LeadWhereInput {
  return visibleCenterIds === "ALL" ? {} : { centerId: { in: visibleCenterIds } };
}

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
 *
 * ── CÁCH LY CƠ SỞ (chống IDOR ghi) ─────────────────────────────────────────────
 * `visibleCenterIds` MẶC ĐỊNH `"ALL"` — KHÁC `manualAssignLead`, nơi nó là tham số bắt
 * buộc. Lý do: hàm này còn 4 call-site HỆ THỐNG không có người bấm (webhook
 * `app/api/leads/route.ts`, import Excel, `lib/lead/intake/ingest.ts`, và bước hậu-tạo của
 * `createLeadManual`), ở đó không tồn tại "tầm nhìn cơ sở" nào để đo. Server Action nào
 * gọi hàm này thì PHẢI truyền tập cơ sở tính từ actor.
 *
 * Vì sao cổng quyền ở tầng action KHÔNG thay được chỗ này: `leads:assign` seed
 * `scopeType: "GLOBAL"` cho CENTER_MANAGER (`prisma/seed-roles.ts`) ⇒ nhánh GLOBAL của
 * `can()` v2 khớp MỌI `target.centerId`.
 */
export async function autoAssignNewLead(
  leadId: string,
  actor: Actor,
  /** Tầm nhìn cơ sở của NGƯỜI BẤM — `getModelVisibleCenterIds` KHÔNG dùng được ở cổng ghi;
   *  tính bằng `centerIdsGrantedByAction(actor, "leads:assign")`. */
  visibleCenterIds: VisibleCenterIds = "ALL",
): Promise<AutoAssignResult> {
  // `findFirst` + `deletedAt: null`: `Lead` KHÔNG nằm trong `SOFT_DELETE_MODELS`
  // (lib/soft-delete.ts) nên base `db` không tự lọc — bản cũ dùng `findUnique` trần nên
  // chia được cả lead đã xoá mềm. `orgUnitId` là giá trị CŨ cho nhật ký bước (1).
  const lead = await db.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, centerId: true, orgUnitId: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  // Thông điệp CỐ Ý trùng nhánh không-tồn-tại: đừng lộ ra rằng lead cơ sở khác có thật.
  if (leadOutOfSight(lead.centerId, visibleCenterIds)) {
    return { ok: false, error: "Lead không tồn tại" };
  }
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
        // ⭐ ĐÂY LÀ MỘT LƯỢT GHI THẬT, KHÔNG PHẢI "chuẩn bị dữ liệu".
        //
        // Bản cũ ghi bằng `db.lead.update` NGOÀI mọi transaction và TRƯỚC nhánh kiểm chế
        // độ bên dưới. Cơ sở vừa chọn ở chế độ MANUAL ⇒ hàm `return` ngay, `logLeadAudit`
        // của lượt phân công không bao giờ chạy — mà `centerId`/`orgUnitId` của lead thì
        // đã đổi vĩnh viễn. Kết cục: một lead bị định tuyến sang cơ sở khác, KHÔNG dòng
        // nhật ký nào giải thích, và vì `Lead ∉ NULL_IS_GLOBAL_MODELS` nên chính người vừa
        // bấm (nếu ở cấp cơ sở) cũng mất lead khỏi danh sách của mình.
        //
        // `centerId: null` trong `where` là compare-and-swap: ta vào được nhánh này ĐÚNG
        // vì lead chưa có cơ sở, nên một `transferLead` chen ngang vừa commit thì lượt ghi
        // này phải THUA chứ không đè lên quyết định của người vận hành.
        await db.$transaction(async (tx) => {
          const res = await tx.lead.updateMany({
            where: { id: leadId, deletedAt: null, centerId: null },
            data: { centerId, orgUnitId },
          });
          if (res.count === 0) {
            throw new Error(`Lead ${leadId} đã được đường khác gán cơ sở khi đang chia`);
          }
          await logLeadAudit({
            leadId,
            action: "UPDATE",
            actorId: actor.actorId,
            actorName: actor.actorName,
            oldValues: { centerId: null, orgUnitId: lead.orgUnitId },
            newValues: { centerId, orgUnitId },
            changedFields: ["centerId", "orgUnitId"],
            tx,
          });
        }, ASSIGN_TX_OPTIONS);
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
      // Lặp lại ở LỆNH GHI đúng hai điều kiện đã dùng lúc CHỌN (`deletedAt` + cách ly cơ
      // sở): `scopedDb` không che đường ghi, và giữa lượt đọc ngoài transaction với lượt
      // ghi là khe TOCTOU thật. Bước (1) ở trên chỉ chạy khi `visibleCenterIds === "ALL"`
      // (actor cấp cơ sở đã bị chặn ở lead chưa gán cơ sở), nên điều kiện này không bao
      // giờ tự chặn chính cơ sở mà hàm vừa gán.
      leadWhere: { deletedAt: null, ...centerGuardWhere(visibleCenterIds) },
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
 *
 * ── CÁCH LY CƠ SỞ (chống IDOR ghi) ─────────────────────────────────────────────
 * `visibleCenterIds` là THAM SỐ BẮT BUỘC, KHÔNG có giá trị mặc định. Lý do không cho
 * `?? "ALL"` như `bulkReassignLeads`: hàm này chỉ có ĐÚNG MỘT caller sản xuất
 * (`assignLeadToSaleAction`), nên tham số bắt buộc khiến typecheck bắt được caller
 * tương lai quên truyền — thay vì im lặng fail-open đúng ở cổng ghi.
 *
 * Vì sao cổng quyền ở tầng action KHÔNG thay được chỗ này: `leads:assign` seed
 * `scopeType: "GLOBAL"` cho CENTER_MANAGER (`prisma/seed-roles.ts`) ⇒ nhánh GLOBAL của
 * `can()` v2 khớp MỌI `target.centerId`. Và ô chọn sale ở trang chi tiết
 * (`app/(admin)/admin/leads/[id]/page.tsx`) tuy đã lọc đúng thì cũng chỉ là UI —
 * Server Action là endpoint công khai, một POST tay đi vòng hết.
 *
 * Khuôn lấy nguyên từ `transferLead` (`app/(admin)/admin/leads/actions.ts`): đọc lead
 * kèm `deletedAt: null` + `centerId`, so tầm nhìn cơ sở, và trả ĐÚNG thông điệp
 * "Lead không tồn tại" để không lộ sự tồn tại của lead cơ sở khác.
 */
export async function manualAssignLead(
  leadId: string,
  saleId: string,
  actor: Actor,
  /** Tầm nhìn cơ sở của NGƯỜI BẤM — tính bằng `getModelVisibleCenterIds("Lead", actor)`. */
  visibleCenterIds: VisibleCenterIds,
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
    // `findFirst` + `deletedAt: null`: `Lead` KHÔNG nằm trong `SOFT_DELETE_MODELS`
    // (lib/soft-delete.ts) nên base `db` không tự lọc — bản cũ dùng `findUnique` trần nên
    // gán tay được cho lead đã xoá mềm. `centerId` là dữ kiện BẮT BUỘC của phép so tầm
    // nhìn ngay dưới; thiếu nó thì cơ sở của lead là `undefined` và guard chặn nhầm cả
    // người hợp lệ (đúng lớp bug select-hẹp đã quét ra 28 call-site, xem `passesScope`).
    db.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { id: true, assignedToId: true, status: true, centerId: true },
    }),
    db.user.findFirst({
      // `isActive: true` — đồng bộ với `bulkReassignLeads` (lib/lead-handover/service.ts)
      // và với chính ô chọn ở trang chi tiết lead. Sale vừa bị vô hiệu hoá (nghỉ việc) mà
      // nhận được lead thì kéo luôn `Enrollment.saleId` ⇒ giữ kênh riêng với phụ huynh.
      where: { id: saleId, roles: { has: "SALES_CSM" }, isActive: true, deletedAt: null },
      // `centerId` là dữ kiện của luật L2 — so với cơ sở của SALE NHẬN, không phải cơ sở
      // của lead (`Enrollment.centerId` là bản sao cơ sở của LỚP).
      select: { id: true, name: true, centerId: true },
    }),
  ]);
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  // Cách ly cơ sở của LEAD NGUỒN — cùng nghĩa với `passesScope("Lead", ...)`: `Lead`
  // không thuộc `NULL_IS_GLOBAL_MODELS` nên `centerId = null` là CHẶN với actor cấp cơ
  // sở (khớp đúng điều `scopedDb` làm ở đường đọc → trang chi tiết cũng 404).
  // Thông điệp CỐ Ý trùng nhánh không-tồn-tại: đừng lộ ra rằng lead cơ sở khác có thật.
  if (leadOutOfSight(lead.centerId, visibleCenterIds)) {
    return { ok: false, error: "Lead không tồn tại" };
  }
  if (!sale) return { ok: false, error: "Sale không hợp lệ" };
  // Người NHẬN cũng phải nằm trong tầm nhìn của người bấm (khuôn `bulkReassignLeads`):
  // tầng zod của action chỉ đòi một chuỗi, nên thiếu bộ kiểm này thì một POST tay đẩy
  // được lead sang sale cơ sở khác.
  if (
    visibleCenterIds !== "ALL" &&
    (!sale.centerId || !visibleCenterIds.includes(sale.centerId))
  ) {
    return { ok: false, error: "Sale nhận không thuộc cơ sở bạn quản lý" };
  }
  // Sale phụ trách phải cùng cơ sở với lead — đúng bằng bộ lọc của ô chọn ở trang chi
  // tiết, và cùng khuôn với màn học viên của lớp (`classes/[id]/students/_actions.ts`).
  // ⚠️ Lead CHƯA gán cơ sở (`centerId = null`) CỐ Ý không ràng buộc: ô chọn cũng bỏ điều
  // kiện cơ sở trong ca đó (`...(lead.centerId ? { centerId: lead.centerId } : {})`), siết
  // thêm sẽ chặn luồng lead từ web chưa kịp chia cơ sở. Đổi cơ sở là việc của `transferLead`.
  if (lead.centerId && sale.centerId !== lead.centerId) {
    return { ok: false, error: "Sale phụ trách phải thuộc cùng cơ sở với lead" };
  }

  const fromUserId = lead.assignedToId;
  // Gán lại cho CHÍNH người đang phụ trách: kéo X→X vô nghĩa, nhưng luật L2 vẫn chạy ⇒
  // ghi danh khác cơ sở với X sẽ bị GỠ sạch trong một thao tác mà người dùng tưởng là
  // no-op. Tắt tường minh.
  const skipEnrollmentPull =
    fromUserId !== null && fromUserId === sale.id
      ? { reason: "gán lại cho chính người đang phụ trách — không có sale cũ để kéo" }
      : undefined;

  const outcome = await db.$transaction(async (tx) => {
    // `leadWhere` lặp lại ĐÚNG bộ lọc đã dùng lúc CHỌN — cả `deletedAt` LẪN cách ly cơ
    // sở, vì `scopedDb` không che đường ghi và `Lead` không thuộc `SOFT_DELETE_MODELS`
    // (base `db`/`tx` không tự thêm điều kiện nào).
    //
    // Vì sao cách ly cơ sở phải có mặt Ở ĐÂY chứ không chỉ ở lượt đọc phía trên: lượt đọc
    // đó nằm NGOÀI transaction. Giữa nó và lệnh ghi, một `transferLead` đồng thời chuyển
    // được lead sang cơ sở khác — khi ấy `updateMany` theo id trần vẫn khớp và ghi
    // `assignedToId` lên một lead nay thuộc cơ sở ngoài tầm nhìn người bấm (sale cơ sở này
    // đọc được PII của lead cơ sở kia qua `leads:view-own`). Cùng lý lẽ mà
    // `bulkReassignLeads` (lib/lead-handover/service.ts) đọc lại TRONG tx với nguyên bộ
    // `where`. Khớp 0 dòng ⇒ `leadsMoved === 0` ⇒ ném ở dưới ⇒ không ghi gì cả.
    //
    // ⚠️ KHÔNG thêm `assignedToId` (khác `transferLead`, nơi nó là compare-and-swap có
    // chủ đích): gán tay là hành động có chủ đích của người vận hành — thêm nó vào đây
    // biến một cuộc đua thành no-op im lặng mà vẫn báo thành công.
    const res = await applyLeadReassignment({
      tx,
      leadIds: [leadId],
      leadWhere: { deletedAt: null, ...centerGuardWhere(visibleCenterIds) },
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
