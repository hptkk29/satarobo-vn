import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import {
  applyLeadReassignment,
  archiveDmOfPreviousSale,
  type LeadReassignOutcome,
} from "@/lib/lead/assignment-core";
import type { LeadStatus, Prisma } from "@prisma/client";
// Type-only (bị xoá lúc compile) ⇒ KHÔNG tạo vòng phụ thuộc runtime với `lib/chat/dm`.
// Cùng cách `lib/lead/auto-assign.ts` đang mượn kiểu này.
import type { VisibleCenterIds } from "@/lib/lead-handover/service";

// =============================================================================
// LEAD AUTO-ASSIGN — round-robin theo cơ sở (Phase T1.3)
// =============================================================================
//
// ⭐ PHẦN "ĐỔI CHỦ" DÙNG CHUNG NẰM Ở `lib/lead/assignment-core.ts`
//
// Repo có 7 đường đổi `Lead.assignedToId`; hai trong số đó ở file này. Phần chung —
// `assignedToId` + `assignedAt` + `Enrollment.saleId` theo LUẬT L1/L2 + dòng thời gian —
// đi qua {@link applyLeadReassignment}. **Hai luật L1/L2 viết đầy đủ ở khối đầu module đó;
// đọc ở đó trước khi sửa bất cứ `where` nào chạm `Enrollment.saleId`.** Tóm tắt:
//   L1. Bộ lọc chọn ghi danh CHỈ mang ngữ nghĩa SỞ HỮU (`saleId` = sale cũ, chưa xoá mềm,
//       truy vết về đúng lead vừa đổi chủ).
//   L2. Sale nhận phải CÙNG CƠ SỞ với ghi danh; khác cơ sở thì GỠ phân công
//       (`saleId = null`), không để lại cho sale cũ.
//
// ⚠️ VÌ SAO HAI ĐƯỜNG NÀY VẪN PHẢI KÉO `Enrollment.saleId` DÙ ĐƯỜNG THƯỜNG TRẢ 0 DÒNG
//
// Kênh riêng Sale ↔ Phụ huynh (`DM_SALE_PARENT`) sống trên cột đó (xem
// `findSaleAssignedEnrollmentIds`, lib/chat/dm.ts). Cả hai đường ở đây gần như không bao
// giờ gặp lead đã có ghi danh — nhưng "gần như" không phải "không bao giờ", và chi phí
// của lưới này là 0 truy vấn ở đường thường (helper no-op cứng khi không có sale cũ):
//
//  • `autoAssignLead`: server action KHÔNG lọc status, nên một POST tay gọi được trên lead
//    `ENROLLED`. Nút trên kanban thì chỉ hiện khi lead chưa có chủ
//    (`_components/leads-kanban.tsx` — `{!lead.assignedToName && ...}`), và đường webhook
//    chạy trên lead vừa `create` trong cùng request ⇒ hai lối đó luôn 0 dòng.
//
//  • `reassignOpenLeads`: bộ lọc loại `ENROLLED` — mà `ENROLLED` chính là trạng thái
//    convert đặt. NHƯNG `canTransitionLeadStatus` (lib/leads/status.ts) là PERMISSIVE:
//    kéo thẻ từ cột ENROLLED về CONSULTING là hợp lệ ⇒ tồn tại lead vừa có `Enrollment`
//    vừa lọt bộ lọc "đang mở".

// Lead "đang mở" = chưa kết thúc → tính tải cho round-robin.
export const TERMINAL_LEAD_STATUSES: LeadStatus[] = [
  "ENROLLED",
  "LOST",
  "DUPLICATE",
];

export type AssigneeLoad = { id: string; openCount: number };
export type Actor = { actorId: string | null; actorName: string };

// ─── Pure functions (test được, không chạm DB) ───────────────────────────────

/** Chọn sale ít lead mở nhất; tie-break theo id để ổn định. */
export function pickAssignee(candidates: AssigneeLoad[]): string | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => a.openCount - b.openCount || a.id.localeCompare(b.id),
  )[0].id;
}

/**
 * Chia danh sách lead cho các sale theo round-robin, cân bằng TRÊN tải hiện có.
 * Trả về Map leadId → assigneeId.
 */
export function distributeRoundRobin(
  leadIds: string[],
  initial: AssigneeLoad[],
): Map<string, string> {
  const result = new Map<string, string>();
  if (initial.length === 0) return result;
  const load = initial.map((a) => ({ ...a }));
  for (const leadId of leadIds) {
    load.sort((a, b) => a.openCount - b.openCount || a.id.localeCompare(b.id));
    const target = load[0];
    result.set(leadId, target.id);
    target.openCount++;
  }
  return result;
}

/**
 * Luật E-bis #2 của module chat: mọi transaction gánh thêm việc ngoài một thao tác đơn
 * phải nới trần — mặc định Prisma là 5s/2s. Từ khi hai đường ở file này kéo thêm
 * `Enrollment.saleId` (1 lượt đọc + tối đa 2 lượt ghi) và `reassignOpenLeads` gom cả một
 * LÔ lead vào một transaction, trần mặc định là đứt giữa chừng.
 */
export const REASSIGN_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

/**
 * Số lead xử lý trong MỘT transaction của {@link reassignOpenLeads}.
 *
 * Bản cũ nhét TOÀN BỘ sổ lead đang mở của người nghỉ vào MỘT `$transaction` không truyền
 * option ⇒ trần mặc định 5000ms. Khối lượng thật mỗi lead ~3 lượt đi-về DB chỉ riêng
 * `logLeadAudit` (đọc `Lead.orgUnitId` → tra `OrgUnit` → ghi `AuditLog`), nên một sale
 * nghỉ việc với vài trăm lead chắc chắn vượt trần — và thất bại đó bị NUỐT ở call-site
 * (`toggleUserActive` bọc `.catch(console.error)`).
 *
 * Lô 50 ⇒ mỗi transaction ≈ 3×50 truy vấn audit + vài truy vấn dùng chung ≈ 160 lượt,
 * nằm gọn dưới trần 30s ở {@link REASSIGN_TX_OPTIONS} ngay cả trên đường
 * Vercel → Supabase pooler (~20 ms/lượt ⇒ ~3 s/lô). Cùng con số với lượt bàn giao hàng
 * loạt (`HANDOVER_BATCH_SIZE`, lib/lead-handover/service.ts) — cố ý giữ bằng nhau, nhưng
 * KHÔNG import chéo: `lib/lead/*` → `lib/lead-handover/*` là vòng phụ thuộc với
 * `lib/chat/dm`. Con số là ước lượng theo số truy vấn đọc từ code, chưa đo trên DB thật.
 */
export const REASSIGN_BATCH_SIZE = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push([...items.slice(i, i + size)]);
  return out;
}

/**
 * Phần audit nói về ghi danh, gộp về một chỗ vì hai đường ở file này ghi giống hệt nhau.
 *
 * CHỈ thêm khoá khi có dòng thật: lượt đổi chủ không đụng ghi danh nào (đường thường của
 * cả hai hàm) giữ nguyên `newValues` như trước bản này, nên nhật ký cũ và mới so được với
 * nhau. Có dòng thì phải ghi rõ — không có nó thì không ai tra được vì sao một ghi danh
 * mất sale phụ trách.
 */
function enrollmentAudit(
  outcome: LeadReassignOutcome,
  leadId: string,
): { newValues: Record<string, unknown>; changedFields: string[] } {
  const bucket = outcome.enrollmentsByLead.get(leadId);
  const newValues: Record<string, unknown> = {};
  const changedFields: string[] = [];
  if (bucket && bucket.moved.length > 0) {
    newValues.enrollmentSaleMoved = bucket.moved;
    changedFields.push("enrollmentSaleMoved");
  }
  if (bucket && bucket.unassigned.length > 0) {
    newValues.enrollmentSaleUnassigned = bucket.unassigned;
    changedFields.push("enrollmentSaleUnassigned");
  }
  // Ghi danh khác cơ sở được GIỮ cho sale cũ: `Lead.assignedToId` và `Enrollment.saleId`
  // cố ý không trùng nhau từ đây, nên phải có dòng nhật ký giải thích vì sao.
  if (bucket && bucket.kept.length > 0) {
    newValues.enrollmentSaleKept = bucket.kept;
    changedFields.push("enrollmentSaleKept");
  }
  return { newValues, changedFields };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Tải hiện tại của SALES_CSM active (trong cùng cơ sở nếu có centerId). */
export async function getSalesLoad(
  centerId: string | null,
): Promise<AssigneeLoad[]> {
  const sales = await db.user.findMany({
    where: {
      // Đa vai trò (3B): tính cả người có SALES_CSM ở vị trí PHỤ.
      roles: { has: "SALES_CSM" },
      isActive: true,
      deletedAt: null,
      ...(centerId ? { centerId } : {}),
    },
    select: { id: true },
  });
  if (sales.length === 0) return [];

  const counts = await db.lead.groupBy({
    by: ["assignedToId"],
    where: {
      assignedToId: { in: sales.map((s) => s.id) },
      deletedAt: null,
      status: { notIn: TERMINAL_LEAD_STATUSES },
    },
    _count: { id: true },
  });
  const loadMap = new Map(
    counts.map((c) => [c.assignedToId, c._count.id] as const),
  );
  return sales.map((s) => ({ id: s.id, openCount: loadMap.get(s.id) ?? 0 }));
}

/**
 * Tự động gán 1 lead cho SALES_CSM ít tải nhất trong cùng cơ sở.
 * Fallback toàn hệ thống nếu cơ sở không có sale. Ghi audit + activity.
 *
 * ── CÁCH LY CƠ SỞ (chống IDOR ghi) ─────────────────────────────────────────────
 * Hàm này đi qua ĐÚNG cổng quyền của `manualAssignLead` (`leads:assign`, không target) và
 * gây thiệt hại BẰNG HOẶC HƠN: nó đổi `Lead.assignedToId`, kéo theo `Enrollment.saleId`
 * (luật L2) rồi đóng kênh riêng `DM_SALE_PARENT` của sale cũ với phụ huynh. Rào chỉ bọc
 * đường gán tay thì kẻ bị chặn ở cửa trước đi cửa bên cạnh — nên nó ở cả đây.
 *
 * Cổng quyền ở tầng action KHÔNG thay được chỗ này: `leads:assign` seed `scopeType:
 * "GLOBAL"` cho CENTER_MANAGER (`prisma/seed-roles.ts`) ⇒ nhánh GLOBAL của `can()` v2
 * khớp MỌI `target.centerId`. Nút trên kanban có gate `{!lead.assignedToName && …}`
 * (`_components/leads-kanban.tsx`) nhưng đó là UI — Server Action là endpoint công khai.
 *
 * `visibleCenterIds` MẶC ĐỊNH `"ALL"` (khác `manualAssignLead`, nơi nó bắt buộc): hàm còn
 * một call-site HỆ THỐNG không có người bấm — `lib/lead/intake/ingest.ts` (webhook
 * legacy) — và ở đó không tồn tại "tầm nhìn cơ sở" nào để đo.
 */
export async function autoAssignLead(
  leadId: string,
  actor: Actor,
  /** Tầm nhìn cơ sở của NGƯỜI BẤM — tính bằng `centerIdsGrantedByAction(actor, "leads:assign")`. */
  visibleCenterIds: VisibleCenterIds = "ALL",
): Promise<{
  ok: boolean;
  assignedToId?: string;
  /** Số ghi danh đổi sale phụ trách — kênh riêng Sale↔PH sống trên cột này. */
  enrollmentsMoved?: number;
  /** Số ghi danh bị GỠ phân công vì người nhận khác cơ sở (luật L2). */
  enrollmentsUnassigned?: number;
  /** Số ghi danh khác cơ sở GIỮ NGUYÊN sale cũ (luật L2, `strandedPolicy = "KEEP"`). */
  enrollmentsKept?: number;
  /** Số kênh riêng của sale CŨ đã chuyển chỉ-đọc vì hết phân công. */
  dmArchived?: number;
  error?: string;
}> {
  // `findFirst` + `deletedAt: null`: `Lead` KHÔNG nằm trong `SOFT_DELETE_MODELS`
  // (lib/soft-delete.ts) nên base `db` không tự lọc — bản cũ dùng `findUnique` trần nên
  // gán được cả lead đã xoá mềm.
  const lead = await db.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, centerId: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  // Cách ly cơ sở của LEAD NGUỒN — cùng nghĩa `passesScope("Lead", …)`: `Lead` không thuộc
  // `NULL_IS_GLOBAL_MODELS` nên `centerId = null` là CHẶN với actor cấp cơ sở. Thông điệp
  // CỐ Ý trùng nhánh không-tồn-tại: đừng lộ ra rằng lead cơ sở khác có thật.
  if (
    visibleCenterIds !== "ALL" &&
    (!lead.centerId || !visibleCenterIds.includes(lead.centerId))
  ) {
    return { ok: false, error: "Lead không tồn tại" };
  }

  let load = await getSalesLoad(lead.centerId);
  if (load.length === 0 && lead.centerId) {
    load = await getSalesLoad(null); // fallback: mọi SALES_CSM
  }
  const target = pickAssignee(load);
  if (!target) return { ok: false, error: "Không có SALES_CSM active để gán" };

  // `centerId` của NGƯỜI NHẬN là dữ kiện của luật L2 — không phải `Lead.centerId`.
  // `Enrollment.centerId` là bản sao cơ sở của LỚP, độc lập với cơ sở của lead.
  const targetUser = await db.user.findUnique({
    where: { id: target },
    select: { name: true, centerId: true },
  });
  // Người NHẬN cũng phải nằm trong tầm nhìn của người bấm (khuôn `manualAssignLead` +
  // `bulkReassignLeads`). Có răng ở ĐÚNG nhánh fallback ngay trên: cơ sở của lead không
  // còn sale active ⇒ `getSalesLoad(null)` quét TOÀN hệ thống, và không có rào này thì
  // một lượt auto-chia đẩy lead sang sale cơ sở khác — kéo luôn `Enrollment.saleId`.
  if (
    visibleCenterIds !== "ALL" &&
    (!targetUser?.centerId || !visibleCenterIds.includes(targetUser.centerId))
  ) {
    return { ok: false, error: "Sale nhận không thuộc cơ sở bạn quản lý" };
  }

  const fromUserId = lead.assignedToId;
  // Hai ca KHÔNG được đụng tới ghi danh, cả hai đều là fail-safe chứ không phải tối ưu:
  const skipEnrollmentPull =
    targetUser === null
      ? {
          // Không đọc được cơ sở của người nhận ⇒ không áp được luật L2. Đoán bừa
          // `centerId = null` sẽ GỠ sạch phân công của mọi ghi danh CÓ cơ sở.
          reason: "không đọc được cơ sở của sale nhận ⇒ không áp được luật L2",
        }
      : fromUserId !== null && fromUserId === target
        ? {
            // Round-robin chọn trúng chính người đang phụ trách. Kéo X→X vô nghĩa, nhưng
            // luật L2 vẫn chạy ⇒ ghi danh khác cơ sở với X bị GỠ sạch trong một thao tác
            // mà người dùng tưởng là no-op.
            reason: "gán lại cho chính người đang phụ trách — không có sale cũ để kéo",
          }
        : undefined;

  const outcome = await db.$transaction(async (tx) => {
    // `leadWhere` lặp lại ĐÚNG bộ lọc đã dùng lúc CHỌN (`deletedAt` + cách ly cơ sở):
    // đường GHI phải tự bảo vệ vì `scopedDb` không che write, và lượt đọc ở trên nằm NGOÀI
    // transaction (khe TOCTOU — repo có 7 đường đổi chủ lead cùng tồn tại).
    // Khớp 0 dòng ⇒ `leadsMoved === 0` ⇒ ném ngay bên dưới, KHÔNG phải no-op im lặng.
    // `"ALL"` ⇒ chỉ còn `deletedAt`, không thêm điều kiện cơ sở nào.
    const res = await applyLeadReassignment({
      tx,
      leadIds: [leadId],
      leadWhere: {
        deletedAt: null,
        ...(visibleCenterIds === "ALL" ? {} : { centerId: { in: visibleCenterIds } }),
      },
      fromUserId,
      toUserId: target,
      toSaleCenterId: targetUser?.centerId ?? null,
      leadData: lead.status === "NEW" ? { status: "ASSIGNED" as LeadStatus } : undefined,
      // Sale cũ ở đây CÒN LÀM VIỆC (round-robin trong lúc vận hành bình thường), nên ghi
      // danh khác cơ sở giữ nguyên người phụ trách — gỡ là xoá một phân công đang chạy
      // tốt và phụ huynh mất luôn kênh riêng. `UNASSIGN` chỉ dành cho đường sale nghỉ việc.
      strandedPolicy: "KEEP",
      skipEnrollmentPull,
      activity: {
        actorId: actor.actorId,
        actorName: actor.actorName,
        content: `Phân công cho ${targetUser?.name ?? target} (round-robin)`,
        // ⚠️ Bản cũ KHÔNG có `system: true` ở đây; helper ép vào và không đè được.
        // Đây là sửa một phân loại SAI: `hasSaleInteraction` (lib/lead/auto-assign.ts)
        // coi mọi NOTE thiếu cờ đó là "sale đã tương tác" và khoá auto-chia về sau.
        // Thực tế đổi hành vi bằng 0: hàm này LUÔN đặt `assignedToId` khác null, mà
        // `autoAssignNewLead` đã thoát sớm khi lead có chủ (auto-assign.ts:127) nên
        // không bao giờ hỏi tới `hasSaleInteraction`; đường duy nhất gỡ chủ về null
        // (`transferLead`) lại ghi activity type `HANDOVER` — thứ khoá auto-chia bất kể
        // cờ này.
        metadata: { assignedToId: target },
      },
    });
    if (res.leadsMoved === 0) {
      // Bản cũ dùng `tx.lead.update` → ném P2025 khi lead biến mất giữa chừng. `updateMany`
      // trả 0 im lặng, nên phải ném lại để giữ đúng tính chất "hỏng thì không ghi gì" —
      // nếu không, audit + activity vẫn commit cho một lead không còn tồn tại.
      throw new Error(`Lead ${leadId} không còn tồn tại khi ghi phân công`);
    }
    const extra = enrollmentAudit(res, leadId);
    await logLeadAudit({
      leadId,
      action: "ASSIGN",
      actorId: actor.actorId,
      actorName: actor.actorName,
      oldValues: { assignedToId: lead.assignedToId },
      newValues: { assignedToId: target, ...extra.newValues },
      changedFields: ["assignedToId", ...extra.changedFields],
      tx,
    });
    return res;
  }, REASSIGN_TX_OPTIONS);

  // Hiệu ứng phụ NGOÀI transaction (luật cứng module chat #2: hỏng thì log, không rollback).
  const dmArchived =
    fromUserId !== null && skipEnrollmentPull === undefined
      ? await archiveDmOfPreviousSale(fromUserId, outcome.affectedParentIds)
      : 0;

  return {
    ok: true,
    assignedToId: target,
    enrollmentsMoved: outcome.enrollmentsMoved,
    enrollmentsUnassigned: outcome.enrollmentsUnassigned,
    enrollmentsKept: outcome.enrollmentsKept,
    dmArchived,
  };
}

export type ReassignOpenLeadsResult = {
  ok: boolean;
  /**
   * Số lead ĐÃ ĐỔI CHỦ VÀ ĐÃ COMMIT — đếm bằng `.count` của `updateMany`, không phải số
   * lead dự kiến. Bản cũ trả `openLeads.length` (con số dự kiến): lượt chạy đứt ở lô 3/9
   * vẫn báo đủ, và lead bị đường khác lấy mất giữa chừng cũng được tính.
   */
  reassigned: number;
  /** Tổng số lead "đang mở" tìm thấy lúc bắt đầu — để so với `reassigned`. */
  total: number;
  /** Đứt ở đâu: bao nhiêu lô đã commit trên tổng số lô. */
  batchesDone: number;
  batchesTotal: number;
  enrollmentsMoved: number;
  enrollmentsUnassigned: number;
  /** Số kênh riêng của sale nghỉ đã chuyển chỉ-đọc vì hết phân công. */
  dmArchived: number;
  error?: string;
};

/**
 * Chia lại toàn bộ lead "đang mở" của 1 sale (vd khi nghỉ việc) cho các sale còn lại theo
 * round-robin. Gọi SAU khi user đã deactivate để `getSalesLoad` không tính người này.
 *
 * ⭐ VÌ SAO CHIA LÔ (mục C)
 *
 * Bản cũ gom TOÀN BỘ sổ lead vào MỘT `$transaction` KHÔNG truyền option ⇒ trần mặc định
 * 5000ms của Prisma. Với ~3 lượt đi-về DB mỗi lead chỉ riêng `logLeadAudit`, một sale nghỉ
 * việc mang vài trăm lead là chắc chắn vượt trần — và cú vượt đó rơi vào đúng chỗ không ai
 * thấy: call-site thật (`toggleUserActive`) gọi best-effort `.catch(console.error)` và BỎ
 * LUÔN giá trị trả về. Người vừa vô hiệu hoá tài khoản không có cách nào biết lead đã chia
 * xong chưa; toàn bộ transaction rollback nên sổ lead vẫn treo cho người đã nghỉ.
 *
 * Nay: lô {@link REASSIGN_BATCH_SIZE} lead / transaction, trần {@link REASSIGN_TX_OPTIONS},
 * và mọi thất bại đi bằng GIÁ TRỊ TRẢ VỀ chứ không ném ra ngoài — kèm tiến độ thật để chạy
 * lại được. Chạy lại an toàn: lead đã chuyển không còn khớp `assignedToId = người nghỉ`
 * nên không bị xử lý hai lần.
 *
 * ⚠️ Call-site `app/(admin)/admin/users/_actions.ts` VẪN đang bỏ giá trị trả về (file đó
 * ngoài phạm vi đợt này). Cho tới khi nó được nới kiểu trả về, đường duy nhất để người vận
 * hành biết là dòng log tổng kết ở cuối hàm.
 */
export async function reassignOpenLeads(
  userId: string,
  actor: Actor,
): Promise<ReassignOpenLeadsResult> {
  const empty = {
    reassigned: 0,
    total: 0,
    batchesDone: 0,
    batchesTotal: 0,
    enrollmentsMoved: 0,
    enrollmentsUnassigned: 0,
    dmArchived: 0,
  };

  const leaving = await db.user.findUnique({
    where: { id: userId },
    select: { centerId: true },
  });

  // Bộ lọc chọn lead — dùng LẠI NGUYÊN VẸN trong `where` của lệnh ghi (đường GHI phải tự
  // bảo vệ: scopedDb không che write, và 7 đường đổi chủ lead cùng tồn tại).
  const where: Prisma.LeadWhereInput = {
    assignedToId: userId,
    deletedAt: null,
    status: { notIn: TERMINAL_LEAD_STATUSES },
  };

  const openLeads = await db.lead.findMany({ where, select: { id: true } });
  if (openLeads.length === 0) return { ok: true, ...empty };

  let load = await getSalesLoad(leaving?.centerId ?? null);
  // loại trừ chính người đang nghỉ (phòng trường hợp gọi trước khi deactivate)
  load = load.filter((l) => l.id !== userId);
  if (load.length === 0 && leaving?.centerId) {
    load = (await getSalesLoad(null)).filter((l) => l.id !== userId);
  }
  if (load.length === 0) {
    return { ok: false, ...empty, total: openLeads.length, error: "Không còn SALES_CSM để chia" };
  }

  // Thứ tự lead giữ nguyên từ lượt đọc đầu: `dist`, các lô, và nhật ký đều đi theo nó.
  const orderedIds = openLeads.map((l) => l.id);
  const dist = distributeRoundRobin(orderedIds, load);

  // `centerId` đi kèm `name`: nó là dữ kiện của luật L2 (ghi danh khác cơ sở với người
  // nhận thì GỠ phân công thay vì để lại cho người đã nghỉ).
  const saleMap = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(dist.values())] } },
        select: { id: true, name: true, centerId: true },
      })
    ).map((u) => [u.id, u] as const),
  );

  const batches = chunk(orderedIds, REASSIGN_BATCH_SIZE);

  let reassigned = 0;
  let enrollmentsMoved = 0;
  let enrollmentsUnassigned = 0;
  let batchesDone = 0;
  const affectedParentIds: string[] = [];
  let batchError: string | null = null;

  for (const batch of batches) {
    try {
      const res = await db.$transaction(async (tx) => {
        // Đọc lại TRONG tx: giữa lúc liệt kê và lúc ghi, lead có thể đã được đường khác
        // gán đi hoặc đóng lại. Không đọc lại thì audit + activity ghi cho những lead
        // `updateMany` không đụng tới.
        const rows = await tx.lead.findMany({
          where: { ...where, id: { in: batch } },
          select: { id: true },
        });
        const alive = new Set(rows.map((r) => r.id));

        // Gom theo NGƯỜI NHẬN: helper đổi chủ cho cả lô trong một lượt ghi, mà mỗi lô có
        // thể chia cho nhiều người. Giữ thứ tự lead gốc để nhật ký đọc theo thứ tự cũ.
        const byAssignee = new Map<string, string[]>();
        for (const leadId of batch) {
          if (!alive.has(leadId)) continue;
          const assigneeId = dist.get(leadId);
          if (!assigneeId) continue;
          const bucket = byAssignee.get(assigneeId) ?? [];
          bucket.push(leadId);
          byAssignee.set(assigneeId, bucket);
        }

        let moved = 0;
        let eMoved = 0;
        let eUnassigned = 0;
        const parentIds: string[] = [];

        for (const [assigneeId, ids] of byAssignee) {
          const sale = saleMap.get(assigneeId);
          const outcome = await applyLeadReassignment({
            tx,
            leadIds: ids,
            leadWhere: where,
            // `dist` không bao giờ trỏ về chính người nghỉ (`load` đã lọc `id !== userId`),
            // nên đây luôn là "sale cũ ≠ sale mới" thật.
            fromUserId: userId,
            toUserId: assigneeId,
            toSaleCenterId: sale?.centerId ?? null,
            // Sale cũ vừa NGHỈ VIỆC: ghi danh khác cơ sở phải GỠ phân công, để nguyên là
            // người đã nghỉ giữ kênh riêng với phụ huynh và job đối soát đêm không dọn
            // được (vì `saleId` vẫn khớp một quan hệ THẬT).
            strandedPolicy: "UNASSIGN",
            // Fail-safe y như `autoAssignLead`: không đọc được cơ sở người nhận thì không
            // áp được luật L2, mà đoán `null` sẽ GỠ sạch ghi danh CÓ cơ sở.
            skipEnrollmentPull:
              sale === undefined
                ? { reason: "không đọc được cơ sở của sale nhận ⇒ không áp được luật L2" }
                : undefined,
            activity: {
              actorId: actor.actorId,
              actorName: actor.actorName,
              // ⚠️ Bản cũ tạo NOTE KHÔNG metadata; helper ép `system: true`. Lý lẽ đầy đủ
              // ghi ở `autoAssignLead` — tóm tắt: đó là sửa một phân loại SAI, và thực tế
              // đổi hành vi bằng 0 vì hàm này luôn đặt `assignedToId` khác null.
              content: `Chia lại lead → ${sale?.name ?? assigneeId} (sale cũ nghỉ)`,
            },
          });
          moved += outcome.leadsMoved;
          eMoved += outcome.enrollmentsMoved;
          eUnassigned += outcome.enrollmentsUnassigned;
          parentIds.push(...outcome.affectedParentIds);

          for (const leadId of ids) {
            const extra = enrollmentAudit(outcome, leadId);
            await logLeadAudit({
              leadId,
              action: "ASSIGN",
              actorId: actor.actorId,
              actorName: actor.actorName,
              oldValues: { assignedToId: userId },
              newValues: { assignedToId: assigneeId, ...extra.newValues },
              changedFields: ["assignedToId", ...extra.changedFields],
              tx,
            });
          }
        }

        return { moved, eMoved, eUnassigned, parentIds };
      }, REASSIGN_TX_OPTIONS);

      reassigned += res.moved;
      enrollmentsMoved += res.eMoved;
      enrollmentsUnassigned += res.eUnassigned;
      affectedParentIds.push(...res.parentIds);
      batchesDone += 1;
    } catch (err) {
      // Lô này KHÔNG commit; các lô trước ĐÃ commit. Không rollback ngược được, nên trả về
      // tiến độ thật và dừng.
      console.error("[reassignOpenLeads] lô chia lại lead lỗi:", err);
      batchError = `Chia lại lead dừng giữa chừng sau ${reassigned}/${orderedIds.length} lead (đã lưu). Hãy chạy lại để tiếp tục phần còn lại.`;
      break;
    }
  }

  // Hiệu ứng phụ NGOÀI transaction: đóng kênh riêng của người đã nghỉ với những phụ huynh
  // vừa đổi sale phụ trách. Hỏng thì hàm này tự log và trả 0 — KHÔNG rollback việc đã
  // commit (luật cứng module chat #2). Chạy cả khi đứt giữa chừng: phần đã commit vẫn phải
  // được dọn kênh.
  const dmArchived = await archiveDmOfPreviousSale(userId, affectedParentIds);

  const result: ReassignOpenLeadsResult = {
    ok: batchError === null,
    reassigned,
    total: orderedIds.length,
    batchesDone,
    batchesTotal: batches.length,
    enrollmentsMoved,
    enrollmentsUnassigned,
    dmArchived,
    ...(batchError ? { error: batchError } : {}),
  };
  if (batchError) {
    // Call-site thật bỏ giá trị trả về (xem chú thích của hàm) ⇒ dòng này là đường duy
    // nhất để thất bại đến được người vận hành cho tới khi nó được nới kiểu trả về.
    console.error(
      `[reassignOpenLeads] user=${userId}: ${batchError} (lô ${batchesDone}/${batches.length})`,
    );
  }
  return result;
}
