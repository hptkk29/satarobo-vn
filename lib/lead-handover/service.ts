import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";
import {
  applyLeadReassignment,
  archiveDmOfPreviousSale,
} from "@/lib/lead/assignment-core";
import type { LeadStatus, Prisma } from "@prisma/client";

// =============================================================================
// Cụm C2 — Bàn giao lead hàng loạt khi sale nghỉ. KHÔNG sửa record user cũ;
// đổi `Lead.assignedToId` + ghi LeadAssignmentHistory + audit + chuyển task đang mở,
// và KÉO THEO `Enrollment.saleId` của các ghi danh sinh ra từ chính những lead đó.
// =============================================================================
//
// ⭐ QUYẾT ĐỊNH THIẾT KẾ — VÌ SAO Ở ĐÂY **KHÔNG** GỌI `syncConversationMembership`
//
// Yêu cầu gốc là "bàn giao lead thì bàn giao cả các nhóm lớp". Đọc theo nghĩa đen thì
// phải gọi `syncConversationMembership` trong tx này — nhưng đó là hiểu SAI mô hình,
// và làm vậy chỉ tốn tiền chứ không đổi được gì:
//
//  • Thành viên nhóm lớp (`ConversationType.CLASS_GROUP`) được DẪN XUẤT từ đúng 3 nguồn
//    trong `loadDerivedMembership` (lib/chat/sync-membership.ts:260-299):
//      1. `Class.teacherId` / `Class.assistantId`            (GV, trợ giảng)
//      2. `Student.parentUserId` + `Enrollment.status`       (phụ huynh của HV trong lớp)
//      3. `UserOrgRole` / `User.roles[]` tại cơ sở của lớp   (QLCS, Giáo vụ)
//    KHÔNG nguồn nào đọc `Lead.assignedToId` hay `Enrollment.saleId`. Sale chưa bao giờ
//    là thành viên dẫn xuất của nhóm lớp. Gọi sync sau khi đổi chủ lead vì thế là một
//    no-op: nó chạy lại đúng phép tính cũ trên dữ liệu không đổi, tốn thêm
//    (1 raw Class + 1 raw Student-join + 1 OrgUnit + 2 User query) × số lớp, ngay bên
//    trong transaction của lượt bàn giao — mua rủi ro timeout để đổi 0 bản ghi.
//
//  • Muốn sale MỚI thật sự ở trong một nhóm lớp thì phải cấp cho họ MỘT trong 3 tư cách
//    trên. Cả hai đường đó đã tự gọi sync ở đúng chỗ của chúng:
//      – đổi vai QLCS/Giáo vụ → `lib/auth/rbac-service.ts` + `app/(admin)/admin/users/_actions.ts`
//        (gọi `syncCenterClassConversations` cùng tx);
//      – đổi phân công lớp   → `app/(admin)/admin/classes/_actions.ts`,
//        `app/(admin)/admin/teachers/_actions.ts` (gọi `syncConversationMembership` cùng tx).
//    Ép việc đó vào đây sẽ là NỚI QUYỀN QUÁ TAY (gán vai QLCS ⇒ người nhận thấy MỌI nhóm
//    lớp của cơ sở, không riêng lớp liên quan), hoặc phải tạo participant `MANUAL` hàng
//    loạt — mà không job đối soát nào dọn được bản ghi MANUAL (BR-15), tức rò rỉ vĩnh viễn.
//
//  • Tư cách hội thoại THẬT SỰ đi theo phân công lead là **kênh riêng Sale ↔ Phụ huynh**
//    (`DM_SALE_PARENT`). Nó sống trên cột `Enrollment.saleId` — xem định nghĩa dứt khoát
//    ở `findSaleAssignedEnrollmentIds` (lib/chat/dm.ts:226-247). Trước bản vá này, bàn
//    giao lead KHÔNG đụng cột đó ⇒ sale CŨ (kể cả đã nghỉ việc) vẫn nhắn riêng được phụ
//    huynh, sale MỚI thì không có kênh, và job đối soát đêm cũng không dọn vì `saleId`
//    vẫn khớp sale cũ. ĐÓ mới là bug, và nó được vá ở dưới.
//
// Test gim quyết định này: `service.test.ts` nhóm E ("KHÔNG gọi syncConversationMembership").
//
// ⭐ PHẦN "ĐỔI CHỦ" ĐÃ TÁCH RA `lib/lead/assignment-core.ts`
//
// Repo có 7 đường đổi `Lead.assignedToId`, và trước đây chỉ MỘT đường (chính hàm này)
// kéo theo `Enrollment.saleId`. Phần chung — `assignedToId` + `assignedAt` +
// `Enrollment.saleId` theo LUẬT L1/L2 + dòng thời gian — nay nằm ở
// {@link applyLeadReassignment}; **hai luật L1/L2 được viết đầy đủ ở khối đầu file đó,
// đọc trước khi sửa bất cứ `where` nào chạm `Enrollment.saleId`**. Tóm tắt:
//
//  L1. Bộ lọc chọn ghi danh CHỈ mang ngữ nghĩa SỞ HỮU (`saleId` = sale cũ, chưa xoá mềm,
//      truy vết về đúng lead vừa đổi chủ). Không `status`, không `parentUserId ≠ null`,
//      không cách ly cơ sở của NGƯỜI BẤM.
//  L2. Sale nhận phải CÙNG CƠ SỞ với ghi danh; khác cơ sở thì GỠ phân công
//      (`saleId = null`), không để lại cho sale cũ.
//
// Ở lại file này là phần RIÊNG của lượt bàn giao hàng loạt: bộ lọc `HandoverFilters` +
// cách ly cơ sở của người bấm, kiểm người nhận, chia lô, `LeadAssignmentHistory`,
// chuyển `LeadTask` đang mở, và khuôn audit theo từng lead.

/** Trạng thái "đã đóng" — khi lọc onlyActive thì loại các lead này. */
const TERMINAL_STATUSES = ["ENROLLED", "LOST", "DUPLICATE"] as const;

/**
 * Số lead xử lý trong MỘT transaction.
 *
 * Bản cũ mở một transaction RIÊNG cho TỪNG lead (N lần BEGIN/COMMIT) và chạy tuần tự
 * không giới hạn. Khối lượng thật cho mỗi lead ~5 lượt đi-về DB, trong đó 3 lượt là của
 * `logLeadAudit` (đọc `Lead.orgUnitId` → tra `OrgUnit` → ghi `AuditLog`).
 * Gộp lô 50 ⇒ mỗi transaction ~4 truy vấn dùng chung + 3×50 truy vấn audit ≈ 154 lượt,
 * nằm gọn dưới trần 30s đặt ở {@link HANDOVER_TX_OPTIONS} ngay cả trên đường
 * Vercel → Supabase pooler (~20 ms/lượt ⇒ ~3 s/lô), trong khi số lần BEGIN/COMMIT giảm 50 lần.
 * Con số này là ước lượng theo số truy vấn đọc từ code — chưa đo đồng hồ trên DB thật.
 */
export const HANDOVER_BATCH_SIZE = 50;

/**
 * Luật E-bis #2 của module chat: mọi transaction gánh thêm việc ngoài một thao tác đơn
 * phải nới trần, vì mặc định Prisma là 5s/2s — đứt giữa chừng ở lô lớn.
 */
export const HANDOVER_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

export interface HandoverFilters {
  statuses?: string[]; // lọc theo LeadStatus cụ thể
  campaign?: string | null; // lọc theo utmCampaign
  onlyActive?: boolean; // chỉ lead chưa đóng
}

/**
 * Cách ly cơ sở: tầm nhìn cơ sở của actor cho model Lead. "ALL" = không giới hạn
 * (SUPER_ADMIN/HO); mảng = chỉ những cơ sở này. Action phải tính qua
 * getModelVisibleCenterIds("Lead", actor) và TRUYỀN vào — service KHÔNG tự suy.
 */
export type VisibleCenterIds = "ALL" | string[];

export type HandoverResult = {
  ok: boolean;
  error?: string;
  /** Số lead đã đổi chủ và ĐÃ COMMIT (kể cả khi lượt chạy đứt giữa chừng). */
  moved: number;
  tasksMoved: number;
  /** Số ghi danh đổi sale phụ trách — kênh riêng Sale↔PH sống trên cột này. */
  enrollmentsMoved: number;
  /**
   * Số ghi danh bị GỠ phân công (`saleId = null`) vì sale nhận khác cơ sở với ghi danh.
   * KHÔNG được im lặng: người vận hành cần biết còn bao nhiêu ghi danh phải gán tay lại
   * ở màn học viên của lớp.
   */
  enrollmentsUnassigned: number;
  /** Số kênh riêng của sale CŨ đã chuyển chỉ-đọc vì hết phân công. */
  dmArchived: number;
};

/**
 * Loại bỏ trạng thái không tồn tại trong enum `LeadStatus`.
 *
 * Thay cho `as never` cũ: tầng zod của action chỉ đòi `z.array(z.string())`, nên một
 * chuỗi lạ đi thẳng xuống Prisma và NỔ LÚC CHẠY — sau khi vài lô đã commit. Lọc ở đây
 * cho kết quả fail-safe: bộ lọc toàn giá trị lạ ⇒ `{ in: [] }` ⇒ khớp 0 lead (KHÔNG
 * phải "khớp tất cả"), và preview với lượt chạy thật cho cùng một con số.
 * Nguồn danh sách là `LEAD_STATUS_LABEL` (`Record<LeadStatus, string>`) — thêm giá trị
 * mới vào enum mà quên nhãn thì typecheck đỏ ở đó, không phải ở đây.
 */
export function normalizeLeadStatuses(raw: readonly string[] | undefined): LeadStatus[] {
  if (!raw || raw.length === 0) return [];
  const valid = new Set(Object.keys(LEAD_STATUS_LABEL));
  return raw.filter((s): s is LeadStatus => valid.has(s));
}

/** Đếm số lead sẽ bị ảnh hưởng (để preview trước khi chạy). */
export async function previewHandover(
  fromUserId: string,
  filters: HandoverFilters,
  visibleCenterIds: VisibleCenterIds = "ALL",
): Promise<number> {
  return db.lead.count({ where: resolveWhere(fromUserId, filters, visibleCenterIds) });
}

function resolveWhere(
  fromUserId: string,
  filters: HandoverFilters,
  visibleCenterIds: VisibleCenterIds = "ALL",
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { assignedToId: fromUserId, deletedAt: null };
  const and: Prisma.LeadWhereInput[] = [];
  if (filters.statuses && filters.statuses.length > 0) {
    and.push({ status: { in: normalizeLeadStatuses(filters.statuses) } });
  }
  if (filters.campaign) {
    and.push({ utmCampaign: filters.campaign });
  }
  if (filters.onlyActive) {
    and.push({ status: { notIn: [...TERMINAL_STATUSES] } });
  }
  // Cách ly cơ sở (chống bàn giao chéo CS): chỉ những lead trong tầm nhìn cơ sở
  // của actor. Mảng rỗng → không match lead nào (fail-safe). "ALL" → bỏ qua.
  // Lead `centerId = null` cũng không khớp — Lead không thuộc NULL_IS_GLOBAL_MODELS.
  if (visibleCenterIds !== "ALL") {
    and.push({ centerId: { in: visibleCenterIds } });
  }
  if (and.length) where.AND = and;
  return where;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push([...items.slice(i, i + size)]);
  return out;
}

export async function bulkReassignLeads(params: {
  fromUserId: string;
  toUserId: string;
  filters: HandoverFilters;
  actorId: string | null;
  actorName: string;
  reason?: string | null;
  /** Cách ly cơ sở — chỉ bàn giao lead trong tầm nhìn cơ sở của actor. Mặc định "ALL". */
  visibleCenterIds?: VisibleCenterIds;
}): Promise<HandoverResult> {
  const empty = {
    moved: 0,
    tasksMoved: 0,
    enrollmentsMoved: 0,
    enrollmentsUnassigned: 0,
    dmArchived: 0,
  };
  const fail = (error: string): HandoverResult => ({ ok: false, error, ...empty });

  if (params.fromUserId === params.toUserId) {
    return fail("Sale nhận trùng sale bàn giao");
  }
  const visibleCenterIds = params.visibleCenterIds ?? "ALL";

  // ── Người NHẬN: phải là tư vấn viên còn hoạt động, trong tầm nhìn cơ sở của người bấm ──
  // Cùng khuôn với `manualAssignLead` (lib/lead/auto-assign.ts:223) và `transferLead`
  // (app/(admin)/admin/leads/actions.ts:917-922). Thiếu bộ kiểm này thì một POST tay với
  // `toUserId` bất kỳ gán được cả sổ lead cho tài khoản TEACHER/PARENT, hoặc cho sale cơ
  // sở khác — tầng zod của action chỉ đòi `z.string().min(1)`.
  //
  // ⚠️ Sale CŨ thì CỐ Ý không kiểm gì: bàn giao xảy ra đúng lúc người đó vừa nghỉ việc,
  // tài khoản thường đã bị vô hiệu hoá hoặc gỡ vai trước khi ai đó mở màn bàn giao.
  const toUser = await db.user.findFirst({
    where: {
      id: params.toUserId,
      isActive: true,
      deletedAt: null,
      roles: { has: "SALES_CSM" },
    },
    select: { id: true, name: true, centerId: true },
  });
  if (!toUser) return fail("Sale nhận không hợp lệ");
  if (
    visibleCenterIds !== "ALL" &&
    (!toUser.centerId || !visibleCenterIds.includes(toUser.centerId))
  ) {
    return fail("Sale nhận không thuộc cơ sở bạn quản lý");
  }

  const where = resolveWhere(params.fromUserId, params.filters, visibleCenterIds);
  const leads = await db.lead.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (leads.length === 0) return { ok: true, ...empty };

  let moved = 0;
  let tasksMoved = 0;
  let enrollmentsMoved = 0;
  let enrollmentsUnassigned = 0;
  const affectedParentIds: string[] = [];
  let batchError: string | null = null;

  for (const batch of chunk(
    leads.map((l) => l.id),
    HANDOVER_BATCH_SIZE,
  )) {
    try {
      const res = await db.$transaction(async (tx) => {
        // Đọc lại TRONG tx: giữa lúc liệt kê và lúc ghi, lead có thể đã được đường khác
        // gán đi (7 đường đổi chủ lead cùng tồn tại — xem documentation/flows.md).
        const rows = await tx.lead.findMany({
          where: { ...where, id: { in: batch } },
          select: { id: true },
        });
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) {
          return {
            moved: 0,
            tasks: 0,
            enrollments: 0,
            enrollmentsUnassigned: 0,
            parentIds: [] as string[],
          };
        }

        // ── Phần "đổi chủ" dùng chung (lib/lead/assignment-core.ts) ──
        // Đổi `assignedToId` + đặt `assignedAt` + kéo `Enrollment.saleId` theo luật L1/L2.
        // Truy vết Lead → LeadChild → Enrollment (`Enrollment.leadChildId`, R7-06) và
        // toàn bộ lý lẽ của hai luật nằm trong module đó — ĐỌC Ở ĐÓ trước khi sửa `where`.
        //
        // `leadWhere` truyền NGUYÊN bộ lọc (kể cả cách ly cơ sở) chứ không chỉ danh sách
        // id: đường GHI phải tự bảo vệ vì scopedDb không che write.
        //
        // KHÔNG truyền `activity`: lượt bàn giao hàng loạt hiện KHÔNG ghi `LeadActivity`
        // (dòng thời gian của lead không hiện gì sau khi bàn giao). Giữ nguyên hành vi ở
        // bước tách helper này; bật lên là thay đổi có chủ ý, phải đi kèm câu chữ + quyết
        // định về cờ `metadata.system` (nó khoá/mở auto-chia lead về sau).
        const reassigned = await applyLeadReassignment({
          tx,
          leadIds: ids,
          leadWhere: where,
          fromUserId: params.fromUserId,
          toUserId: params.toUserId,
          // Cơ sở của SALE NHẬN — KHÔNG phải `Lead.centerId` (luật L2).
          toSaleCenterId: toUser.centerId,
          // Đây là đường bàn giao KHI SALE NGHỈ VIỆC: ghi danh khác cơ sở phải GỠ phân
          // công. Để nguyên mới là bug — người đã nghỉ giữ kênh riêng với phụ huynh, và
          // job đối soát đêm không dọn vì `saleId` vẫn khớp một quan hệ THẬT.
          strandedPolicy: "UNASSIGN",
          leadData: { handoverNote: params.reason ?? undefined },
        });

        await tx.leadAssignmentHistory.createMany({
          data: ids.map((leadId) => ({
            leadId,
            fromUserId: params.fromUserId,
            toUserId: params.toUserId,
            assignedById: params.actorId,
            reason: params.reason ?? null,
          })),
        });

        // Chuyển task đang mở của sale cũ sang sale mới — MỘT lời gọi cho cả lô.
        const taskRes = await tx.leadTask.updateMany({
          where: { leadId: { in: ids }, assignedToId: params.fromUserId, status: "OPEN" },
          data: { assignedToId: params.toUserId, assignedToName: toUser.name ?? null },
        });

        // Audit per-record (một dòng mỗi lead) — nhật ký bàn giao phải tra được theo lead.
        for (const leadId of ids) {
          const bucket = reassigned.enrollmentsByLead.get(leadId) ?? {
            moved: [],
            unassigned: [],
            kept: [],
          };
          const changedFields = ["assignedToId"];
          if (bucket.moved.length > 0) changedFields.push("enrollmentSaleMoved");
          if (bucket.unassigned.length > 0) changedFields.push("enrollmentSaleUnassigned");
          await logLeadAudit({
            leadId,
            action: "ASSIGN",
            actorId: params.actorId,
            actorName: params.actorName,
            oldValues: { assignedToId: params.fromUserId },
            newValues: {
              assignedToId: params.toUserId,
              // Ghi rõ ghi danh nào đổi sale phụ trách: đó là thứ quyết định ai còn
              // nhắn riêng được với phụ huynh. Ghi cả nhánh bị gỡ vì khác cơ sở —
              // không có dòng này thì không ai tra được vì sao ghi danh mất sale.
              enrollmentSaleMoved: bucket.moved,
              enrollmentSaleUnassigned: bucket.unassigned,
            },
            changedFields,
            reason: params.reason ?? "Bàn giao lead",
            tx,
          });
        }

        return {
          moved: reassigned.leadsMoved,
          tasks: taskRes.count,
          enrollments: reassigned.enrollmentsMoved,
          enrollmentsUnassigned: reassigned.enrollmentsUnassigned,
          // PH của MỌI ghi danh vừa đụng tới (kể cả nhánh gỡ phân công): tập này đi đóng
          // kênh của sale cũ SAU khi tx commit.
          parentIds: reassigned.affectedParentIds,
        };
      }, HANDOVER_TX_OPTIONS);

      moved += res.moved;
      tasksMoved += res.tasks;
      enrollmentsMoved += res.enrollments;
      enrollmentsUnassigned += res.enrollmentsUnassigned;
      affectedParentIds.push(...res.parentIds);
    } catch (err) {
      // Lô này KHÔNG commit; các lô trước ĐÃ commit. Không rollback ngược được, nên
      // trả về tiến độ thật và dừng. Chạy lại an toàn: lead đã chuyển không còn khớp
      // `assignedToId = sale cũ` nên không bị xử lý hai lần.
      console.error("[lead-handover] lô bàn giao lỗi:", err);
      batchError = `Bàn giao dừng giữa chừng sau ${moved} lead (đã lưu). Hãy chạy lại để tiếp tục phần còn lại.`;
      break;
    }
  }

  // Hiệu ứng phụ ngoài transaction — xem chú thích của hàm.
  const dmArchived = await archiveDmOfPreviousSale(params.fromUserId, affectedParentIds);

  if (batchError) {
    return {
      ok: false,
      error: batchError,
      moved,
      tasksMoved,
      enrollmentsMoved,
      enrollmentsUnassigned,
      dmArchived,
    };
  }
  return { ok: true, moved, tasksMoved, enrollmentsMoved, enrollmentsUnassigned, dmArchived };
}
