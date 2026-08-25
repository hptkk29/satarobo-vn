import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import type { Prisma, LeadAssignMode } from "@prisma/client";
import {
  pickByCloseRate,
  pickCenterEvenly,
  type SaleStat,
} from "@/lib/lead/assign-strategy";
import { takeRotationTurn } from "@/lib/lead/rotation";
import { canManualAssign } from "@/lib/lead/assign-guard";
import { assignmentWrite } from "@/lib/lead/assignment";
import { LEAD_CLOSED_STATUSES } from "@/lib/leads/status";

// Module CRM & Lead PHẦN 2 — chia lead tự động (cơ sở → chế độ) + khoá khi đã tương tác.

// GĐ0 — định nghĩa chuyển về @/lib/leads/status. Giữ tên cũ vì lib/lead/intake/ingest.ts
// đang import từ đây.
/** @deprecated Tên cũ. Dùng `LEAD_CLOSED_STATUSES` từ `@/lib/leads/status`. */
export const TERMINAL_LEAD_STATUSES = LEAD_CLOSED_STATUSES;

/**
 * Điều kiện "lead còn là VIỆC ĐANG MỞ của Sale" — dùng cho MỌI phép ĐẾM TẢI.
 *
 * ⚠️ Hai vế, thiếu vế nào cũng sai:
 *   • `status notIn LEAD_CLOSED_STATUSES` — sau GĐ5 tập này chỉ còn `DA_MAT`, CỐ Ý:
 *     lead đã đăng ký mà chưa xếp lớp thì vẫn là việc Sale phải làm.
 *   • `convertedAt: null` — nhưng lead đã convert XONG (đã thành học viên) cũng mang
 *     `DA_DANG_KY`, nên nếu chỉ lọc theo status thì nó tính là tải mở VĨNH VIỄN. Hệ
 *     quả thật: Sale làm lâu năm bị coi là quá tải và ngừng nhận lead mới. `convertedAt`
 *     do chính lượt convert ghi (xem ghi chú enum LeadStatus trong schema.prisma) nên
 *     nó là dấu "đã xong thật", không phải suy từ trạng thái.
 */
const LEAD_DANG_MO = {
  deletedAt: null,
  status: { notIn: TERMINAL_LEAD_STATUSES },
  convertedAt: null,
} satisfies Prisma.LeadWhereInput;

export type Actor = { actorId: string | null; actorName: string };

const SYSTEM_META = { system: true } as Prisma.InputJsonValue;

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
      where: { assignedToId: { in: ids }, ...LEAD_DANG_MO },
      _count: { id: true },
    }),
    db.lead.groupBy({
      by: ["assignedToId", "status"],
      where: {
        assignedToId: { in: ids },
        deletedAt: null,
        // GĐ5 — ENROLLED gộp vào DA_DANG_KY, LOST thành DA_MAT. Lưu ý phạm vi
        // "đã xử lý" RỘNG hơn bản cũ: lead mới ghi nhận tiền (REGISTERED cũ) nay
        // cũng tính, vì enum không còn tách "đã đăng ký" với "đã vào lớp".
        status: { in: ["DA_DANG_KY", "DA_MAT"] },
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
    if (g.status === "DA_DANG_KY") {
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
    where: { centerId: { in: centerIds }, ...LEAD_DANG_MO },
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

  // ⚠️ Đợt D (22/08/2026) — BỎ fallback chia xuyên cơ sở (lỗi 4.3 của spec).
  //
  // Bản cũ: cơ sở không còn sale nào thì `getSaleStats(null)` lấy sale TOÀN HỆ
  // THỐNG. Nghe như "cứu lead", thực tế đẻ ra LEAD CHẾT: `scopedDb` cách ly cơ
  // sở nên người nhận KHÔNG MỞ ĐƯỢC lead vừa được giao. Đã xảy ra thật — lead CS1
  // rơi vào tay một sale CS2 và nằm im ở đó cho tới lúc chủ dự án gỡ tay 21/08.
  // Nay: không có sale trong cơ sở ⇒ để CHƯA PHÂN cho quản lý xử, đúng SS-LR-11.
  const stats = await getSaleStats(centerId);
  if (stats.length === 0) {
    console.warn(
      `[lead:auto-assign] Cơ sở ${centerId ?? "(chưa xác định)"} không có sale đủ điều kiện — lead ${leadId} để CHƯA PHÂN.`,
    );
    return { ok: true, assignedToId: null, centerId, mode };
  }

  // Chọn người nhận.
  //
  // ROUND_ROBIN (chế độ MỌI cơ sở đang dùng — đo prod 21/08) nay đi qua SỔ LƯỢT
  // bền: chủ dự án chốt Q7 "chia đều số lượt, qua ngày không reset, không phân
  // biệt người nhiều việc người ít việc". Xem lib/lead/rotation.ts.
  //
  // CLOSE_RATE giữ nguyên đường cũ (cân tải theo tỷ lệ chốt). Không cơ sở nào
  // đang bật nó; giữ lại để không lặng lẽ đổi một cấu hình ai đó cố ý đặt.
  let target: string | null;
  if (mode === "CLOSE_RATE") {
    target = pickByCloseRate(stats);
  } else {
    const orgUnitId = centerId ? await orgUnitIdForCenter(centerId) : null;
    target = orgUnitId
      ? await takeRotationTurn(orgUnitId, stats.map((s) => s.id))
      : // Không suy được đơn vị ⇒ KHÔNG có sổ lượt để ghi. Thà để chưa phân còn
        // hơn chia bằng đường khác rồi lệch sổ mà không ai biết.
        null;
    if (!target && orgUnitId === null) {
      console.warn(
        `[lead:auto-assign] Không suy được orgUnitId từ cơ sở ${centerId ?? "(null)"} — lead ${leadId} để CHƯA PHÂN.`,
      );
    }
  }
  if (!target) return { ok: true, assignedToId: null, centerId, mode }; // không có sale → để trống

  const targetUser = await db.user.findUnique({ where: { id: target }, select: { name: true } });
  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      // Đợt A — `assignmentWrite` ghi kèm `assignedAt`; thiếu mốc thì SLA-2/SLA-3
      // không bao giờ kêu (đo prod 21/08: 33 lead có vết chia, chỉ 1 có mốc).
      data: assignmentWrite(target),
    });
    // GĐ5 — ĐÃ GỠ lượt đổi trạng thái NEW→ASSIGNED ở đây.
    //
    // Cả hai giá trị cũ nay cùng ánh xạ về MOI, nên giữ nguyên khối này sẽ thành
    // `if (status === "MOI") setLeadStatus(to: "MOI")` — một vòng đọc DB trong
    // transaction chỉ để `setLeadStatus` trả về KHONG_DOI. Mốc "đã phân công"
    // không mất: `assignmentWrite(target)` ngay trên đã ghi assignedToId +
    // assignedAt, và dòng audit ASSIGN bên dưới vẫn vào sổ như cũ. Cái mất là
    // dòng LeadStatusHistory MOI→MOI — thứ không còn nghĩa gì sau khi "đã phân
    // công" thôi làm một bậc phễu.
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
    await tx.leadActivity.create({
      data: {
        leadId,
        actorId: actor.actorId,
        actorName: actor.actorName,
        type: "NOTE",
        content: `Tự động chia cho ${targetUser?.name ?? target} (${mode === "CLOSE_RATE" ? "tỷ lệ chốt" : "luân phiên"})`,
        metadata: SYSTEM_META,
      },
    });
  });

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
  // Đợt D — như autoAssignNewLead: KHÔNG còn fallback xuyên cơ sở (lỗi 4.3).
  // Chuyển lead sang cơ sở không có sale ⇒ trả null ⇒ lead nằm ở cơ sở mới, chưa
  // phân. Đúng hơn là ném cho một người không mở được nó.
  const stats = (await getSaleStats(centerId)).filter((s) => s.id !== excludeSaleId);
  if (stats.length === 0) return null;
  if (mode === "CLOSE_RATE") return pickByCloseRate(stats);

  // ⚠️ Ở đây LƯỢT BỊ TIÊU NGAY, trước khi chỗ gọi ghi xong việc chuyển. Nếu
  // transaction chuyển lead hỏng sau đó thì người này mang một lượt không có lead.
  // Chấp nhận có chủ đích: lệch tối đa 1 lượt trong một tình huống hiếm, đổi lấy
  // việc không bao giờ có hai lead cùng tiêu một lượt. Ngược lại (ghi lượt sau)
  // thì mỗi lần lỗi là một lượt BIẾN MẤT — và cái đó lệch về đúng một phía.
  const orgUnitId = await orgUnitIdForCenter(centerId);
  if (!orgUnitId) return null;
  return takeRotationTurn(orgUnitId, stats.map((s) => s.id));
}

/**
 * Quản lý gán tay 1 lead cho 1 sale cụ thể.
 *
 * ⚠️ Đợt G (23/08/2026) — THÊM KIỂM NGƯỜI NHẬN. Trước đó điều kiện duy nhất là
 * "có vai SALES_CSM và chưa xoá mềm": không kiểm còn làm việc, không kiểm cùng
 * cơ sở. Đó đúng là cơ chế đã đẻ ra sự cố phải gỡ tay 21/08 — một lead CS1 nằm
 * trong tay sale CS2, mà `scopedDb` cách ly cơ sở nên **người đó không mở nổi
 * nó**; lead nằm chết, không màn nào báo lỗi.
 *
 * Đợt D đã bịt đường TỰ ĐỘNG (bỏ fallback chia xuyên cơ sở) nhưng đường gán tay
 * vẫn mở nguyên — bịt một nửa thì cái nửa còn lại chính là chỗ sự cố tái diễn.
 *
 * Luật để ở `lib/lead/assign-guard.ts` (thuần, có test) chứ không viết `if` tại
 * chỗ: sẽ còn cửa gán thứ hai, thứ ba, và lần trước nó chỉ nằm ở một chỗ.
 */
export async function manualAssignLead(
  leadId: string,
  saleId: string,
  actor: Actor,
  opts: { actorIsHoLevel?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const [lead, sale] = await Promise.all([
    db.lead.findUnique({
      where: { id: leadId },
      select: { id: true, assignedToId: true, status: true, centerId: true },
    }),
    db.user.findFirst({
      where: { id: saleId, roles: { has: "SALES_CSM" } },
      select: { id: true, name: true, isActive: true, deletedAt: true, centerId: true },
    }),
  ]);
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  if (!sale) return { ok: false, error: "Sale không hợp lệ" };

  // `deletedAt` cố ý KHÔNG lọc ở truy vấn nữa: lọc ở đó thì người đã xoá mềm rơi
  // vào nhánh "Sale không hợp lệ" — đúng kết quả nhưng sai thông báo, và người
  // bấm nút không hiểu vì sao. Guard nói rõ từng lý do.
  const guard = canManualAssign({
    sale,
    leadCenterId: lead.centerId,
    actorIsHoLevel: opts.actorIsHoLevel ?? false,
  });
  if (!guard.ok) return { ok: false, error: guard.error };

  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      // GĐ5 — bỏ nhánh `NEW → ASSIGNED`: hai giá trị đó nay cùng là MOI nên lệnh
      // ghi trở thành MOI→MOI. `assignmentWrite` vẫn ghi assignedToId+assignedAt,
      // và đó mới là chỗ đọc ra "lead này đã phân cho ai, lúc nào".
      data: assignmentWrite(saleId), // Đợt A — kèm mốc phân công
    });
    await logLeadAudit({
      leadId,
      action: "ASSIGN",
      actorId: actor.actorId,
      actorName: actor.actorName,
      oldValues: { assignedToId: lead.assignedToId },
      newValues: { assignedToId: saleId },
      changedFields: ["assignedToId"],
      tx,
    });
    await tx.leadActivity.create({
      data: {
        leadId,
        actorId: actor.actorId,
        actorName: actor.actorName,
        type: "NOTE",
        content: `Gán tay cho ${sale.name ?? saleId}`,
        metadata: SYSTEM_META,
      },
    });
  });

  return { ok: true };
}
