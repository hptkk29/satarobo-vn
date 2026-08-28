import { db } from "@/lib/db";
import { dmKeyOf, reconcileDmConversations } from "@/lib/chat/dm";
import { fillOrgUnitOnUpdateMany } from "@/lib/org/dual-write";
import type { LeadActivityType, Prisma } from "@prisma/client";

// =============================================================================
// ĐỔI CHỦ MỘT LEAD — MỘT CHỖ DÙNG CHUNG CHO MỌI ĐƯỜNG
// =============================================================================
//
// Repo có **7 đường** đổi `Lead.assignedToId`:
//   1. `bulkReassignLeads`  (lib/lead-handover/service.ts)        — bàn giao hàng loạt
//   2. `manualAssignLead`   (lib/lead/auto-assign.ts)             — quản lý gán tay
//   3. `autoAssignLead`     (lib/lead/assign.ts)                  — round-robin bản cũ
//   4. `autoAssignNewLead`  (lib/lead/auto-assign.ts)             — chia lead MỚI
//   5. `transferLead`       (app/(admin)/admin/leads/actions.ts)  — chuyển lead/cơ sở
//   6. `reassignOpenLeads`  (lib/lead/assign.ts)                  — sale nghỉ việc
//   7. `assignSale`         (lib/crm/handover.ts)                 — MÃ CHẾT, không call-site
//
// Mỗi đường một kiểu là cách chắc chắn để bản vá của đường này không tới được đường kia:
// hôm nay chỉ đường (1) kéo theo `Enrollment.saleId`, và KHÔNG đường nào đặt `assignedAt`.
// Module này gom phần chung lại; caller giữ phần riêng của mình (audit, LeadTask,
// LeadAssignmentHistory, LeadTransfer, câu chữ activity).
//
// ⚠️ NHẬN `tx`, KHÔNG TỰ MỞ TRANSACTION — ba lý do cứng:
//   1. Luật cứng module chat #5: đổi phân công phải đồng bộ hội thoại TRONG CÙNG
//      transaction. Helper tự mở tx thứ hai là hai transaction rời ⇒ có cửa sổ lead đã
//      đổi chủ mà ghi danh chưa đổi.
//   2. Cả 6 đường sống đều ĐÃ có `db.$transaction` riêng và còn phải ghi Lead + audit
//      trong đúng tx đó.
//   3. `Prisma.TransactionClient` là khuôn đã dùng khắp repo (`lib/audit/log.ts`,
//      `lib/chat/dm.ts`, `lib/chat/sync-membership.ts`) ⇒ `logLeadAudit({ tx })` của
//      caller ăn khớp không cần ép kiểu.
//
// ⭐ VÌ SAO `Enrollment.saleId` PHẢI ĐI THEO
//
// Kênh riêng Sale ↔ Phụ huynh (`DM_SALE_PARENT`) sống trên cột này — xem định nghĩa dứt
// khoát ở `findSaleAssignedEnrollmentIds` (lib/chat/dm.ts). Đổi chủ lead mà không kéo cột
// này ⇒ sale CŨ (kể cả đã nghỉ việc) vẫn nhắn riêng được phụ huynh, sale MỚI không có
// kênh, và job đối soát đêm cũng không dọn vì `saleId` vẫn khớp sale cũ.
//
// ⭐ HAI LUẬT CỦA CỘT `Enrollment.saleId` (đọc trước khi sửa `where` bên dưới)
//
//  L1. BỘ LỌC CHỌN GHI DANH CHỈ ĐƯỢC MANG NGỮ NGHĨA SỞ HỮU: `saleId = sale cũ`,
//      `deletedAt IS NULL`, và truy vết về đúng những lead vừa đổi chủ. KHÔNG kèm
//      `status`, KHÔNG kèm `student.parentUserId ≠ null`, KHÔNG kèm cách ly cơ sở của
//      NGƯỜI BẤM. Ba điều kiện đó phục vụ mục đích khác nhưng nếu đặt ở đây thì ghi danh
//      rơi ra ngoài sẽ GIỮ NGUYÊN `saleId` = sale cũ, mà quan hệ Sale↔PH được đánh giá
//      TẠI THỜI ĐIỂM HỎI chứ không phải lúc bàn giao ⇒ nó sống lại khi dữ liệu đổi trạng
//      thái về sau (PENDING → CONFIRMED, PH kích hoạt tài khoản), và job đối soát đêm
//      KHÔNG dọn được vì lúc đó quan hệ là THẬT.
//
//  L2. SALE NHẬN PHẢI CÙNG CƠ SỞ VỚI GHI DANH thì mới được nhận. Đây là bất biến của
//      chính cột này ở đường ghi TAY duy nhất còn lại
//      (`app/(admin)/admin/classes/[id]/students/_actions.ts` — "Sale phụ trách phải
//      thuộc cùng cơ sở với lớp"). Ghi danh khác cơ sở thì KHÔNG giao cho người nhận —
//      xem {@link canTakeOverEnrollment}.
//
//      ⚠️ SỐ PHẬN CỦA GHI DANH KHÁC CƠ SỞ KHÔNG PHẢI HẰNG SỐ — nó là {@link StrandedPolicy},
//      và mặc định là GIỮ NGUYÊN sale cũ. Bất biến L2 nói về việc ĐẶT một sale mới, nó
//      KHÔNG cho phép GỠ một phân công đang chạy tốt. Chỉ đường bàn giao khi sale NGHỈ
//      VIỆC mới được gỡ (`saleId = null`) — ở đó để nguyên mới là bug (người đã nghỉ giữ
//      kênh riêng, job đối soát đêm không dọn vì `saleId` khớp một quan hệ thật). Ở ba
//      đường mà sale cũ CÒN LÀM VIỆC (gán tay · round-robin · chuyển lead), gỡ phân công
//      là xoá việc của một người còn đang chăm khách: ghi danh mất người phụ trách, phụ
//      huynh mất luôn kênh riêng, mà `findSaleAssignedEnrollmentIds` (lib/chat/dm.ts:232)
//      lại nói rõ "sale phụ trách học viên đã chuyển cơ sở vẫn phải giữ được kênh".
//
// Test gim toàn bộ: `lib/lead/assignment-core.test.ts`.

/**
 * Ghi danh này có được giao cho sale nhận không?
 *
 * `Enrollment.centerId` là bản sao cơ sở của LỚP, tức đúng thứ màn học viên của lớp so
 * sánh khi gán tay. Ghi danh không có cơ sở (lớp Hội sở) → không ràng buộc, y như màn kia.
 *
 * ⚠️ KHÔNG so với tầm nhìn cơ sở của NGƯỜI BẤM: với SUPER_ADMIN/HO nó là "ALL" nên nhánh
 * kiểm biến mất hoàn toàn — chính là lỗ để một lượt đổi chủ gán cả sổ ghi danh CS1 cho
 * sale CS2.
 */
export function canTakeOverEnrollment(
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
export function centerMatchWhere(saleCenterId: string | null): Prisma.EnrollmentWhereInput {
  return saleCenterId === null
    ? { centerId: null }
    : { OR: [{ centerId: null }, { centerId: saleCenterId }] };
}

/**
 * Dòng thời gian của lead. Câu chữ khác nhau ở từng đường ("Gán tay cho X", "Tự động
 * chia cho X (luân phiên)", "Chia lại lead → X (sale cũ nghỉ)") nên nội dung do caller
 * quyết định; helper chỉ ép phần KHÔNG được sai.
 */
export type LeadReassignActivity = {
  actorId: string | null;
  actorName: string;
  /** Mặc định `NOTE`. Đường chuyển lead dùng `HANDOVER`. */
  type?: LeadActivityType;
  /** Chuỗi dùng chung, hoặc hàm để mỗi lead một câu (lượt chia nhiều người nhận). */
  content: string | ((leadId: string) => string);
  /**
   * Trường phụ của `metadata`. Cờ `system: true` LUÔN được helper ép vào và không đè
   * được — `hasSaleInteraction` (lib/lead/auto-assign.ts) coi mọi NOTE thiếu cờ đó là
   * "sale đã tương tác" và KHOÁ auto-chia lead về sau.
   */
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Ghi danh KHÁC CƠ SỞ với sale nhận (luật L2) thì làm gì với nó?
 *
 *  • `"KEEP"` (MẶC ĐỊNH) — giữ nguyên sale CŨ. Dùng cho mọi đường mà sale cũ còn làm
 *    việc: gán tay, round-robin, chuyển lead. Không đụng gì = không mất gì.
 *  • `"UNASSIGN"` — gỡ phân công (`saleId = null`). CHỈ dùng khi sale cũ KHÔNG CÒN LÀM
 *    VIỆC (bàn giao khi nghỉ: `bulkReassignLeads`, `reassignOpenLeads`). Đây là lượt ghi
 *    PHÁ (xoá phân công), nên phải nói ra tường minh ở chỗ gọi.
 *
 * Mặc định cố ý là nhánh KHÔNG phá: caller quên khai thì mất một dòng đồng bộ, chứ không
 * mất một sổ ghi danh.
 */
export type StrandedPolicy = "KEEP" | "UNASSIGN";

export type LeadReassignParams = {
  /** Transaction của caller. Helper KHÔNG tự mở tx — xem khối đầu file. */
  tx: Prisma.TransactionClient;
  /** Tập lead đổi chủ trong lượt này (một lead thì truyền mảng một phần tử). */
  leadIds: readonly string[];
  /**
   * Điều kiện lọc mà caller đã dùng để CHỌN tập lead. Helper lặp lại nguyên vẹn trong
   * `where` của lệnh GHI: scopedDb không che write, và giữa lúc đọc với lúc ghi có khe
   * TOCTOU (7 đường đổi chủ cùng tồn tại). Chỉ truyền `{ id: ... }` là để hở khe đó.
   */
  leadWhere?: Prisma.LeadWhereInput;
  /** Sale ĐANG phụ trách. `null` ⇒ lead chưa có chủ ⇒ không có ghi danh nào để kéo. */
  fromUserId: string | null;
  /** Sale NHẬN. `null` ⇒ gỡ chủ (nhánh chuyển cơ sở mà cơ sở đích ở chế độ MANUAL). */
  toUserId: string | null;
  /**
   * Cơ sở của SALE NHẬN — KHÔNG phải `centerId` của lead (luật L2). Bắt buộc, không cho
   * optional: `?? null` lặng lẽ ở call-site sẽ gỡ sạch mọi ghi danh có cơ sở.
   */
  toSaleCenterId: string | null;
  /**
   * Field riêng của caller ghi kèm lên Lead (`handoverNote`, `status` NEW→ASSIGNED,
   * `centerId` khi chuyển cơ sở). `assignedToId` + `assignedAt` do helper giữ độc quyền
   * và KHÔNG đè được từ đây.
   *
   * Đặt `centerId` là ĐỦ: helper tự ghi kép sang `orgUnitId` (luật cứng Nền Hệ thống #3)
   * vì `updateMany` không đi qua extension ghi kép. Caller nào tự đặt `orgUnitId` thì giá
   * trị đó được tôn trọng nguyên vẹn. Đối tượng truyền vào KHÔNG bị sửa (helper làm việc
   * trên bản sao).
   */
  leadData?: Prisma.LeadUncheckedUpdateManyInput;
  /**
   * Số phận của ghi danh KHÁC CƠ SỞ với sale nhận — xem {@link StrandedPolicy}.
   * Mặc định `"KEEP"`. Chỉ đường bàn giao khi sale NGHỈ VIỆC mới khai `"UNASSIGN"`.
   */
  strandedPolicy?: StrandedPolicy;
  /**
   * Tắt phần kéo `Enrollment.saleId`. MẶC ĐỊNH là BẬT — chỉ tắt khi đường đó chắc chắn
   * không thể có ghi danh nào (vd `autoAssignNewLead` chỉ chạy trên lead chưa có chủ),
   * và kiểu bắt buộc kèm `reason` để không ai tắt được bằng một chữ `false` trống.
   */
  skipEnrollmentPull?: { reason: string };
  /** Vắng ⇒ KHÔNG ghi dòng thời gian nào (caller phải nói rõ vì sao ở chỗ gọi). */
  activity?: LeadReassignActivity;
};

export type LeadReassignOutcome = {
  /** `.count` của updateMany — KHÔNG phải `leadIds.length`: dòng bị chen ngang không tính. */
  leadsMoved: number;
  /** Số ghi danh đổi sale phụ trách — kênh riêng Sale↔PH sống trên cột này. */
  enrollmentsMoved: number;
  /**
   * Số ghi danh bị GỠ phân công (`saleId = null`) vì sale nhận khác cơ sở — chỉ khác 0 khi
   * `strandedPolicy = "UNASSIGN"`. KHÔNG được im lặng: người vận hành cần biết còn bao
   * nhiêu ghi danh phải gán tay lại.
   */
  enrollmentsUnassigned: number;
  /**
   * Số ghi danh khác cơ sở được GIỮ NGUYÊN cho sale cũ (`strandedPolicy = "KEEP"`). Cũng
   * không được im lặng, vì đây là chỗ `Lead.assignedToId` và `Enrollment.saleId` cố ý
   * KHÔNG trùng nhau — người vận hành phải biết để còn quyết định gán lại hay không.
   */
  enrollmentsKept: number;
  /** leadId → ghi danh đã đổi / đã gỡ / giữ nguyên, để caller ghi audit theo khuôn của mình. */
  enrollmentsByLead: Map<
    string,
    { moved: string[]; unassigned: string[]; kept: string[] }
  >;
  /**
   * PH của MỌI ghi danh vừa đọc lên (cả ba rổ: đổi · gỡ · giữ nguyên). Caller mang RA
   * NGOÀI transaction cho {@link archiveDmOfPreviousSale}. Thừa thì vô hại —
   * `reconcileDmConversations` tự kiểm lại quan hệ, nên PH của rổ `kept` sẽ được xác nhận
   * là VẪN CÒN quan hệ với sale cũ và kênh riêng giữ nguyên ACTIVE; THIẾU mới là lỗ để
   * sale đã nghỉ giữ kênh.
   */
  affectedParentIds: string[];
  activitiesCreated: number;
};

/**
 * Đổi chủ một (hoặc một lô) lead: `assignedToId` + `assignedAt` + `Enrollment.saleId`
 * theo luật L1/L2 + dòng thời gian. Chạy TRONG transaction của caller.
 *
 * KHÔNG làm (cố ý — mỗi đường một khuôn riêng): audit, `LeadTask`,
 * `LeadAssignmentHistory`, `LeadTransfer`, và đóng kênh DM (hiệu ứng phụ ngoài tx —
 * xem {@link archiveDmOfPreviousSale}).
 */
export async function applyLeadReassignment(
  params: LeadReassignParams,
): Promise<LeadReassignOutcome> {
  const { tx, toUserId, toSaleCenterId } = params;
  const strandedPolicy: StrandedPolicy = params.strandedPolicy ?? "KEEP";
  const leadIds = [...new Set(params.leadIds)].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  const outcome: LeadReassignOutcome = {
    leadsMoved: 0,
    enrollmentsMoved: 0,
    enrollmentsUnassigned: 0,
    enrollmentsKept: 0,
    enrollmentsByLead: new Map(),
    affectedParentIds: [],
    activitiesCreated: 0,
  };
  if (leadIds.length === 0) return outcome;

  // ── Ghi danh đi theo lead: ĐỌC TRƯỚC mọi lệnh ghi ──
  // Phải đọc trước khi đổi `saleId` để còn biết PH nào bị ảnh hưởng.
  //
  // `fromUserId = null` ⇒ KHÔNG có "sale cũ" nào để kéo (lead chưa ai phụ trách). Đây là
  // no-op CỨNG, không suy diễn thành `saleId: null`: làm vậy là lượt chia lead mới VƠ hết
  // ghi danh mồ côi — kể cả ghi danh mà ai đó vừa cố ý gỡ sale ở màn học viên của lớp.
  const pullFrom = params.skipEnrollmentPull === undefined ? params.fromUserId : null;
  const enrollments =
    pullFrom === null
      ? []
      : await tx.enrollment.findMany({
          // ⚠️ LUẬT L1: `where` này ĐÃ ĐỦ. Đừng thêm `status`, `student.parentUserId`,
          // hay cách ly cơ sở của người bấm — lý lẽ đầy đủ ở khối đầu file.
          where: {
            saleId: pullFrom,
            deletedAt: null,
            leadChild: { leadId: { in: leadIds } },
          },
          select: {
            id: true,
            centerId: true,
            leadChild: { select: { leadId: true } },
            student: { select: { parentUserId: true } },
          },
        });

  // ── Cột chủ sở hữu + mốc SLA ──
  // `assignedAt` là mốc bắt đồng hồ SLA-3 ("chưa liên hệ khách > 3 giờ", lib/crm/sla.ts).
  // Không đặt lại thì đồng hồ của sale MỚI không bao giờ chạy, hoặc chạy từ mốc của sale
  // CŨ. Gỡ chủ (`toUserId = null`) ⇒ xoá mốc: không còn ai để tính SLA.

  // ── Ghi kép `centerId` → `orgUnitId` (luật cứng Nền Hệ thống #3) ──
  // Làm trên BẢN SAO, không sửa `params.leadData` của caller — lượt bàn giao hàng loạt
  // truyền lại đúng đối tượng đó cho từng người nhận.
  // Vì sao phải tự làm: extension ghi kép CỐ Ý không hook `updateMany`
  // (lib/org/dual-write.ts), mà bản cũ của đường chuyển lead dùng `tx.lead.update` nên
  // được hook. Thiếu dòng này thì mỗi lượt chuyển cơ sở để lại một dòng `Lead` lệch:
  // `logLeadAudit` đóng dấu `AuditLog.orgUnitId` theo `Lead.orgUnitId` (lib/audit/log.ts:35)
  // ⇒ QL cơ sở vừa NHẬN lead không thấy nhật ký chuyển, còn cron đối soát đêm
  // (/api/cron/orgunit-drift) chỉ BÁO chứ không sửa.
  const leadData: Prisma.LeadUncheckedUpdateManyInput = { ...(params.leadData ?? {}) };
  await fillOrgUnitOnUpdateMany("Lead", leadData);

  const leadRes = await tx.lead.updateMany({
    where: { ...(params.leadWhere ?? {}), id: { in: leadIds } },
    data: {
      ...leadData,
      assignedToId: toUserId,
      assignedAt: toUserId === null ? null : new Date(),
    },
  });
  outcome.leadsMoved = leadRes.count;

  // ── LUẬT L2: chia theo cơ sở của SALE NHẬN ──
  // `takeable` = sale nhận được phép phụ trách. `stranded` = khác cơ sở ⇒ KHÔNG giao cho
  // người nhận; số phận do `strandedPolicy` quyết định (lý lẽ đầy đủ ở khối đầu file):
  // mặc định GIỮ NGUYÊN sale cũ, chỉ lượt bàn giao khi sale NGHỈ VIỆC mới gỡ về `null`.
  const takeable: string[] = [];
  const stranded: string[] = [];
  for (const e of enrollments) {
    if (canTakeOverEnrollment(e.centerId, toSaleCenterId)) takeable.push(e.id);
    else stranded.push(e.id);
  }

  if (takeable.length > 0) {
    const res = await tx.enrollment.updateMany({
      where: {
        id: { in: takeable },
        saleId: pullFrom,
        deletedAt: null,
        // Đường GHI tự bảo vệ (scopedDb KHÔNG che write): lặp lại chính điều kiện đã dùng
        // để chia nhóm, để một lượt ghi chen ngang cũng không tạo ra được phân công chéo
        // cơ sở.
        ...centerMatchWhere(toSaleCenterId),
      },
      data: { saleId: toUserId },
    });
    // `.count` chứ không `takeable.length`: dòng bị chen ngang không được tính.
    outcome.enrollmentsMoved = res.count;
  }

  if (stranded.length > 0) {
    if (strandedPolicy === "UNASSIGN") {
      const res = await tx.enrollment.updateMany({
        where: { id: { in: stranded }, saleId: pullFrom, deletedAt: null },
        data: { saleId: null },
      });
      outcome.enrollmentsUnassigned = res.count;
    } else {
      // KEEP: KHÔNG một lệnh ghi nào. Con số vẫn phải trả về — đây là chỗ
      // `Lead.assignedToId` và `Enrollment.saleId` cố ý không trùng nhau.
      outcome.enrollmentsKept = stranded.length;
    }
  }

  const takeableSet = new Set(takeable);
  const strandedField = strandedPolicy === "UNASSIGN" ? "unassigned" : "kept";
  for (const e of enrollments) {
    const leadId = e.leadChild?.leadId;
    if (!leadId) continue;
    const bucket = outcome.enrollmentsByLead.get(leadId) ?? {
      moved: [],
      unassigned: [],
      kept: [],
    };
    if (takeableSet.has(e.id)) bucket.moved.push(e.id);
    else bucket[strandedField].push(e.id);
    outcome.enrollmentsByLead.set(leadId, bucket);
  }

  outcome.affectedParentIds = enrollments
    .map((e) => e.student.parentUserId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  // ── Dòng thời gian ──
  const activity = params.activity;
  if (activity) {
    const resolve = activity.content;
    const rows = leadIds.map((leadId) => ({
      leadId,
      actorId: activity.actorId,
      actorName: activity.actorName,
      type: activity.type ?? ("NOTE" as LeadActivityType),
      content: typeof resolve === "function" ? resolve(leadId) : resolve,
      // `system: true` đặt SAU cùng ⇒ caller không đè được. Thiếu cờ này là lead bị KHOÁ
      // auto-chia vĩnh viễn (`hasSaleInteraction`).
      metadata: { ...(activity.metadata ?? {}), system: true } as Prisma.InputJsonValue,
    }));
    // 🔴 CỐ Ý dùng `createMany` và CỐ Ý **không** đi qua `recordLeadActivity` (N-4):
    // đây là bàn giao HÀNG LOẠT — một lượt chuyển sale có thể sinh hàng trăm dòng cho
    // hàng trăm lead khác nhau. Nếu bump `lastActivityAt` ở đây thì **đồng hồ "chưa
    // tiếp cận lại" của cả trăm lead về 0 cùng lúc**, và bảng lead treo sạch bong ngay
    // sau mỗi lần đổi người phụ trách. Đổi sale không phải là đã gọi khách.
    //
    // Cờ `metadata.system = true` ở trên là thứ đánh dấu nhóm dòng này; đường ĐỌC của
    // C5 (`loadLastContactAt` trong `lib/reports/lead-c.ts`) loại chúng theo đúng cờ đó.
    // Hai bên phải khớp nhau — sửa một bên mà quên bên kia là cột C5 sai câm.
    const res = await tx.leadActivity.createMany({ data: rows });
    outcome.activitiesCreated = res.count;
  }

  return outcome;
}

/**
 * Đóng kênh riêng của sale CŨ với những phụ huynh vừa đổi người phụ trách.
 *
 * CHẠY SAU KHI TRANSACTION COMMIT, có chủ đích:
 *  • `reconcileDmConversations` là ĐƯỜNG DUY NHẤT đóng một hội thoại 1-1 vì hết quan hệ
 *    nền (archive + tin SYSTEM giải thích lý do — lib/chat/dm.ts). Viết lại logic archive
 *    ở đây là để hai đường lệch nhau, đúng thứ dm.ts đã gộp lại để tránh.
 *  • Hàm đó chạm `db` trần chứ không nhận `tx`, nên gọi trong transaction sẽ đọc trạng
 *    thái CHƯA commit từ một kết nối khác ⇒ kết luận sai (và có nguy cơ chờ khoá).
 *  • Đây là hiệu ứng phụ KHÔNG-atomic: hỏng thì ghi log, KHÔNG rollback việc đã commit
 *    (luật cứng module chat #2). Lưới cuối vẫn còn: job đối soát đêm.
 *
 * KHÔNG mở kênh hộ sale MỚI: mở 1-1 là hành vi chủ động của người dùng (`openDm`), tạo
 * hàng loạt hội thoại rỗng chỉ đẻ rác trong hộp thư.
 *
 * (Chuyển nguyên văn từ `lib/lead-handover/service.ts` — 5 đường đổi chủ còn lại cần
 * đúng hàm này. Tiền tố log giữ nguyên `[lead-handover]` để không đứt chuỗi log cũ.)
 */
export async function archiveDmOfPreviousSale(
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
