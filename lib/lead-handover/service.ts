import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";
import { dmKeyOf, reconcileDmConversations } from "@/lib/chat/dm";
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
// ⭐ HAI LUẬT CỦA CỘT `Enrollment.saleId` TRONG LƯỢT BÀN GIAO (đọc trước khi sửa `where`)
//
//  L1. BỘ LỌC CHỌN GHI DANH CHỈ ĐƯỢC MANG NGỮ NGHĨA SỞ HỮU: `saleId = sale cũ`,
//      `deletedAt IS NULL`, và truy vết về đúng những lead vừa đổi chủ. KHÔNG kèm
//      `status`, KHÔNG kèm `student.parentUserId ≠ null`, KHÔNG kèm cách ly cơ sở của
//      NGƯỜI BẤM. Ba điều kiện đó phục vụ mục đích khác (chọn PH đi đóng kênh / lọc lead)
//      nhưng nếu đặt ở đây thì ghi danh rơi ra ngoài sẽ GIỮ NGUYÊN `saleId` = sale cũ,
//      mà quan hệ Sale↔PH được đánh giá TẠI THỜI ĐIỂM HỎI (`findSaleAssignedEnrollmentIds`)
//      chứ không phải lúc bàn giao ⇒ nó sống lại khi dữ liệu đổi trạng thái về sau
//      (PENDING → CONFIRMED, PH kích hoạt tài khoản), và job đối soát đêm KHÔNG dọn được
//      vì lúc đó quan hệ là THẬT.
//
//  L2. SALE NHẬN PHẢI CÙNG CƠ SỞ VỚI GHI DANH thì mới được nhận. Đây là bất biến của
//      chính cột này ở đường ghi tay (`app/(admin)/admin/classes/[id]/students/_actions.ts`
//      — "Sale phụ trách phải thuộc cùng cơ sở với lớp"). Ghi danh khác cơ sở thì
//      **GỠ phân công** (`saleId = null`), KHÔNG để lại cho sale cũ — xem
//      {@link canTakeOverEnrollment}.

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
 * Ghi danh này có được giao cho sale nhận không?
 *
 * Cùng bất biến với đường ghi TAY duy nhất còn lại của chính cột `Enrollment.saleId`
 * (`app/(admin)/admin/classes/[id]/students/_actions.ts:143` — "Sale phụ trách phải thuộc
 * cùng cơ sở với lớp", chống gán chéo CS1↔CS2 bằng POST tay). `Enrollment.centerId` là
 * bản sao cơ sở của LỚP (schema.prisma:1850-1852), tức đúng thứ màn kia so sánh.
 *
 * Ghi danh không có cơ sở (lớp HO) → không ràng buộc, y như màn kia.
 *
 * ⚠️ KHÔNG so với `visibleCenterIds`: đó là tầm nhìn của NGƯỜI BẤM, và với SUPER_ADMIN/HO
 * nó là "ALL" nên nhánh kiểm biến mất hoàn toàn — chính là lỗ để một lượt bàn giao gán cả
 * sổ ghi danh CS1 cho sale CS2.
 */
function canTakeOverEnrollment(
  enrollmentCenterId: string | null,
  saleCenterId: string | null,
): boolean {
  return enrollmentCenterId === null || enrollmentCenterId === saleCenterId;
}

/**
 * Dạng `where` của {@link canTakeOverEnrollment} — để đường GHI tự bảo vệ lặp lại đúng
 * điều kiện đã dùng lúc chia nhóm (scopedDb KHÔNG che write; giữa lúc đọc và lúc ghi có
 * khe TOCTOU).
 */
function centerMatchWhere(saleCenterId: string | null): Prisma.EnrollmentWhereInput {
  return saleCenterId === null
    ? { centerId: null }
    : { OR: [{ centerId: null }, { centerId: saleCenterId }] };
}

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

/**
 * Đóng kênh riêng của sale CŨ với những phụ huynh vừa đổi người phụ trách.
 *
 * CHẠY SAU KHI TRANSACTION COMMIT, có chủ đích:
 *  • `reconcileDmConversations` là ĐƯỜNG DUY NHẤT đóng một hội thoại 1-1 vì hết quan hệ
 *    nền (archive + tin SYSTEM giải thích lý do — lib/chat/dm.ts:673-703). Viết lại logic
 *    archive ở đây là để hai đường lệch nhau, đúng thứ dm.ts đã gộp lại để tránh.
 *  • Hàm đó chạm `db` trần chứ không nhận `tx`, nên gọi trong transaction sẽ đọc trạng
 *    thái CHƯA commit từ một kết nối khác ⇒ kết luận sai (và có nguy cơ chờ khoá).
 *  • Đây là hiệu ứng phụ KHÔNG-atomic: hỏng thì ghi log, KHÔNG rollback việc bàn giao đã
 *    commit (luật cứng module chat #2). Lưới cuối vẫn còn: job đối soát đêm.
 *
 * KHÔNG mở kênh hộ sale MỚI: mở 1-1 là hành vi chủ động của người dùng (`openDm`), tạo
 * hàng loạt hội thoại rỗng chỉ đẻ rác trong hộp thư.
 */
async function archiveDmOfPreviousSale(
  fromUserId: string,
  parentUserIds: readonly string[],
): Promise<number> {
  const peers = [...new Set(parentUserIds)].filter((id) => id && id !== fromUserId);
  if (peers.length === 0) return 0;
  try {
    const dmKeys = peers.map((parentUserId) =>
      dmKeyOf(fromUserId, parentUserId, "SALE_PARENT"),
    );
    const conversations = await db.conversation.findMany({
      where: { dmKey: { in: dmKeys }, type: "DM_SALE_PARENT", status: "ACTIVE" },
      select: { id: true },
    });
    if (conversations.length === 0) return 0;
    const res = await reconcileDmConversations({
      onlyConversationIds: conversations.map((c) => c.id),
    });
    return res.dmArchived;
  } catch (err) {
    console.error("[lead-handover] đóng kênh riêng của sale cũ lỗi:", err);
    return 0;
  }
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

        // ── Ghi danh đi theo lead (kênh riêng Sale↔PH) ──
        // Truy vết Lead → LeadChild → Enrollment (`Enrollment.leadChildId`, R7-06). Đọc
        // TRƯỚC khi đổi `Lead.assignedToId` không quan trọng, nhưng phải đọc trước khi
        // đổi `saleId` để còn biết PH nào bị ảnh hưởng.
        // Điều kiện `saleId = sale cũ` giữ cho lượt bàn giao KHÔNG cướp ghi danh mà ai
        // đó đã gán tay cho người khác ở màn học viên của lớp.
        //
        // ⚠️ LUẬT L1 (xem khối đầu file): `where` dưới đây ĐÃ ĐỦ. BA ĐIỀU KIỆN SAU ĐÃ BỊ
        // GỠ KHỎI ĐÂY, đừng thêm lại — mỗi cái để lại một ghi danh mang `saleId` của người
        // đã nghỉ, mà quan hệ Sale↔PH được đánh giá TẠI THỜI ĐIỂM HỎI nên nó sống lại sau:
        //  1. `status ∈ ENROLLMENT_ACTIVE_STATUS_LIST` — bộ này KHÔNG có `PENDING`; ghi danh
        //     chờ xếp lớp bị bỏ lại, rồi giáo vụ xếp lớp là quan hệ SỐNG LẠI.
        //  2. `student.parentUserId ≠ null` — PH chưa có tài khoản lúc bàn giao (rất phổ
        //     biến) thì sau khi kích hoạt sẽ được nối vào đúng người vừa nghỉ.
        //  3. `centerId ∈ visibleCenterIds` — `Enrollment.centerId` là bản sao cơ sở của LỚP,
        //     độc lập với `Lead.centerId`; học viên chuyển sang lớp cơ sở khác rơi ra ngoài
        //     tầm nhìn QLCS. Đó đúng là ca mà `findSaleAssignedEnrollmentIds` (dm.ts:226-247)
        //     CỐ Ý không lọc cơ sở để giữ kênh. Lead đã được cách ly ở `where` rồi.
        // Cách ly cơ sở cho cột này nằm ở chiều KHÁC: sale NHẬN phải cùng cơ sở với ghi
        // danh (luật L2) — xử lý ngay bên dưới, không phải bằng cách bỏ sót ghi danh.
        const enrollments = await tx.enrollment.findMany({
          where: {
            saleId: params.fromUserId,
            deletedAt: null,
            leadChild: { leadId: { in: ids } },
          },
          select: {
            id: true,
            centerId: true,
            leadChild: { select: { leadId: true } },
            student: { select: { parentUserId: true } },
          },
        });

        // Đường GHI tự bảo vệ (scopedDb KHÔNG che write): lặp lại ĐỦ điều kiện lọc —
        // kể cả cách ly cơ sở — trong `where` của updateMany, thay vì chỉ danh sách id.
        const leadRes = await tx.lead.updateMany({
          where: { ...where, id: { in: ids } },
          data: {
            assignedToId: params.toUserId,
            handoverNote: params.reason ?? undefined,
          },
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

        // ── LUẬT L2: chia theo cơ sở của SALE NHẬN ──
        // `takeable` = sale nhận được phép phụ trách. `stranded` = khác cơ sở ⇒ GỠ phân
        // công thay vì để nguyên sale cũ: sale cũ vừa nghỉ việc, để lại là đúng cái bug
        // mà khối đầu file tuyên bố vá (kênh riêng còn ACTIVE, job đêm không dọn vì
        // `saleId` vẫn khớp). `saleId = null` là trạng thái hợp lệ sẵn có ("gỡ" ở màn
        // học viên của lớp, và `onDelete: SetNull` của chính cột này).
        const takeable: string[] = [];
        const stranded: string[] = [];
        for (const e of enrollments) {
          if (canTakeOverEnrollment(e.centerId, toUser.centerId)) takeable.push(e.id);
          else stranded.push(e.id);
        }

        let enrollmentCount = 0;
        if (takeable.length > 0) {
          const enrRes = await tx.enrollment.updateMany({
            where: {
              id: { in: takeable },
              saleId: params.fromUserId,
              deletedAt: null,
              // Đường GHI tự bảo vệ (scopedDb KHÔNG che write): lặp lại chính điều kiện
              // đã dùng để chia nhóm, để một lượt ghi chen ngang cũng không tạo ra được
              // phân công chéo cơ sở.
              ...centerMatchWhere(toUser.centerId),
            },
            data: { saleId: params.toUserId },
          });
          enrollmentCount = enrRes.count;
        }

        let unassignedCount = 0;
        if (stranded.length > 0) {
          const strandedRes = await tx.enrollment.updateMany({
            where: { id: { in: stranded }, saleId: params.fromUserId, deletedAt: null },
            data: { saleId: null },
          });
          unassignedCount = strandedRes.count;
        }

        // Audit per-record (một dòng mỗi lead) — nhật ký bàn giao phải tra được theo lead.
        const takeableSet = new Set(takeable);
        const enrollmentsByLead = new Map<string, { moved: string[]; unassigned: string[] }>();
        for (const e of enrollments) {
          const leadId = e.leadChild?.leadId;
          if (!leadId) continue;
          const bucket = enrollmentsByLead.get(leadId) ?? { moved: [], unassigned: [] };
          if (takeableSet.has(e.id)) bucket.moved.push(e.id);
          else bucket.unassigned.push(e.id);
          enrollmentsByLead.set(leadId, bucket);
        }
        for (const leadId of ids) {
          const bucket = enrollmentsByLead.get(leadId) ?? { moved: [], unassigned: [] };
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

        // PH của MỌI ghi danh vừa đổi `saleId` (kể cả nhánh gỡ phân công): tập này đi
        // đóng kênh của sale cũ. Thừa thì vô hại — `reconcileDmConversations` tự kiểm
        // lại quan hệ; THIẾU mới là lỗ để sale đã nghỉ giữ kênh.
        const parentIds = enrollments
          .map((e) => e.student.parentUserId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);

        return {
          moved: leadRes.count,
          tasks: taskRes.count,
          enrollments: enrollmentCount,
          enrollmentsUnassigned: unassignedCount,
          parentIds,
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
