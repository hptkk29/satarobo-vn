import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import { recordLeadStatusChange } from "@/lib/lead/status-trail-write";
import { assignmentWrite } from "@/lib/lead/assignment";
import { takeRotationTurn, takeRotationTurns } from "@/lib/lead/rotation";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import type { LeadStatus, Prisma } from "@prisma/client";

// =============================================================================
// LEAD AUTO-ASSIGN — round-robin theo cơ sở (Phase T1.3)
// =============================================================================

// Lead "đang mở" = chưa kết thúc → tính tải cho round-robin.
export const TERMINAL_LEAD_STATUSES: LeadStatus[] = [
  "ENROLLED",
  "LOST",
  "DUPLICATE",
];

export type AssigneeLoad = { id: string; openCount: number };
export type Actor = { actorId: string | null; actorName: string };

// ─── Pure functions (test được, không chạm DB) ───────────────────────────────

/**
 * Chọn sale ít lead mở nhất; tie-break theo id để ổn định.
 *
 * ⚠️ KHÔNG CÒN ĐƯỜNG CHIA NÀO GỌI HÀM NÀY (Đợt D, 22/08/2026) — chủ dự án chốt
 * chia đều theo SỐ LƯỢT, không theo tải. Giữ lại vì hàm thuần, có test riêng, và
 * còn là bản đối chứng khi cần so hai cách chia. Đừng nối lại vào luồng chia.
 */
export function pickAssignee(candidates: AssigneeLoad[]): string | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => a.openCount - b.openCount || a.id.localeCompare(b.id),
  )[0].id;
}

/**
 * Chia danh sách lead cho các sale theo round-robin, cân bằng TRÊN tải hiện có.
 * Trả về Map leadId → assigneeId.
 *
 * ⚠️ Thay bằng `planFairTurns` (lib/lead/rotation.ts) từ Đợt D — xem ghi chú ở
 * `pickAssignee`. Giữ lại cùng lý do.
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
 * Tự động gán 1 lead cho sale TỚI LƯỢT trong cùng cơ sở. Ghi audit + activity.
 *
 * ⚠️ Đợt D (22/08/2026) — VIẾT LẠI PHẦN CHỌN NGƯỜI. Đây là đường chia THỨ HAI
 * của repo (đường kia là `autoAssignNewLead`), còn sống ở nút "chia lại lead"
 * trên bảng kanban và ở webhook nhận lead bản cũ. Vá một đường mà bỏ đường này
 * thì luật "chia đều tuyệt đối" chỉ đúng với một phần lead — đúng cái bẫy mà
 * chẩn đoán prod 21/08 đã chỉ ra (69% lead không đi qua vòng chia).
 *
 * Hai thay đổi: (1) chọn theo SỔ LƯỢT thay vì ít-tải-nhất; (2) BỎ fallback chia
 * xuyên cơ sở — người nhận không mở nổi lead ngoài cơ sở mình (`scopedDb`).
 */
export async function autoAssignLead(
  leadId: string,
  actor: Actor,
): Promise<{ ok: boolean; assignedToId?: string; error?: string }> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, centerId: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, error: "Lead không tồn tại" };

  const load = await getSalesLoad(lead.centerId);
  if (load.length === 0) {
    return { ok: false, error: "Cơ sở này không có tư vấn viên đang hoạt động để giao lead" };
  }
  const orgUnitId = lead.centerId ? await orgUnitIdForCenter(lead.centerId) : null;
  if (!orgUnitId) {
    return { ok: false, error: "Lead chưa thuộc cơ sở nào — chọn cơ sở trước khi chia" };
  }
  const target = await takeRotationTurn(orgUnitId, load.map((l) => l.id));
  if (!target) return { ok: false, error: "Không có SALES_CSM active để gán" };

  const targetUser = await db.user.findUnique({
    where: { id: target },
    select: { name: true },
  });

  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        ...assignmentWrite(target), // Đợt A — kèm mốc phân công (đường cũ, 3 webhook)
        ...(lead.status === "NEW" ? { status: "ASSIGNED" as LeadStatus } : {}),
      },
    });
    await logLeadAudit({
      leadId,
      action: "ASSIGN",
      actorId: actor.actorId,
      actorName: actor.actorName,
      oldValues: { assignedToId: lead.assignedToId },
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
        content: `Phân công cho ${targetUser?.name ?? target} (luân phiên đều lượt)`,
        metadata: { assignedToId: target } as Prisma.InputJsonValue,
      },
    });
    // C-07 — lượt chia LẬT LUÔN trạng thái `MỚI → ĐÃ PHÂN CÔNG` ngay trên dòng
    // `tx.lead.update` ở trên, nhưng vết duy nhất của nó là dòng audit `ASSIGN`
    // chỉ mang `assignedToId`. Tức mốc đầu tiên của mọi phễu KHÔNG được ghi vào
    // bảng nào — không lần ra được "lead nằm ở MỚI bao lâu, ai đẩy nó đi".
    //
    // ⚠️ Điều kiện phải TRÙNG KHÍT với điều kiện lật trạng thái ở trên: lead đang
    // ở bước sau (vd Đang tư vấn) được chia lại thì trạng thái KHÔNG đổi — ghi vết
    // vô điều kiện là bịa ra một lượt "Đang tư vấn → Đã phân công" chưa từng xảy ra.
    if (lead.status === "NEW") {
      await recordLeadStatusChange({
        tx,
        leadId,
        actorId: actor.actorId,
        actorName: actor.actorName,
        from: "NEW",
        to: "ASSIGNED",
        source: "ASSIGN",
      });
    }
  });

  return { ok: true, assignedToId: target };
}

/**
 * Chia lại toàn bộ lead "đang mở" của 1 sale (vd khi nghỉ việc) cho các sale
 * còn lại theo round-robin. Gọi SAU khi user đã deactivate để getSalesLoad
 * không tính người này.
 */
export async function reassignOpenLeads(
  userId: string,
  actor: Actor,
): Promise<{ ok: boolean; reassigned: number; error?: string }> {
  const leaving = await db.user.findUnique({
    where: { id: userId },
    select: { centerId: true },
  });

  const openLeads = await db.lead.findMany({
    where: {
      assignedToId: userId,
      deletedAt: null,
      status: { notIn: TERMINAL_LEAD_STATUSES },
    },
    select: { id: true },
  });
  if (openLeads.length === 0) return { ok: true, reassigned: 0 };

  // Đợt D — cùng luật với hai đường chia kia: theo SỔ LƯỢT, KHÔNG xuyên cơ sở.
  // Không còn sale trong cơ sở ⇒ báo lỗi và ĐỂ NGUYÊN lead ở người vừa nghỉ.
  // Nghe khó chịu, nhưng lead nằm ở tài khoản đã khoá thì quản lý vẫn thấy và
  // giao tay được; còn ném sang cơ sở khác thì thành lead không ai mở nổi.
  const load = (await getSalesLoad(leaving?.centerId ?? null)).filter((l) => l.id !== userId);
  if (load.length === 0) {
    return { ok: false, reassigned: 0, error: "Không còn tư vấn viên trong cơ sở để chia lại" };
  }
  const orgUnitId = leaving?.centerId ? await orgUnitIdForCenter(leaving.centerId) : null;
  if (!orgUnitId) {
    return { ok: false, reassigned: 0, error: "Không suy được đơn vị của người nghỉ để ghi sổ lượt" };
  }

  // Một lần khoá cho cả rổ — xem takeRotationTurns.
  const ke = await takeRotationTurns(orgUnitId, load.map((l) => l.id), openLeads.length);
  const dist = new Map<string, string>();
  openLeads.forEach((l, i) => {
    const nguoiNhan = ke[i];
    if (nguoiNhan) dist.set(l.id, nguoiNhan);
  });
  if (dist.size === 0) {
    return { ok: false, reassigned: 0, error: "Không còn tư vấn viên trong cơ sở để chia lại" };
  }

  const nameMap = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(dist.values())] } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name] as const),
  );

  await db.$transaction(async (tx) => {
    for (const [leadId, assigneeId] of dist) {
      await tx.lead.update({
        where: { id: leadId },
        data: assignmentWrite(assigneeId), // Đợt A — kèm mốc phân công
      });
      await logLeadAudit({
        leadId,
        action: "ASSIGN",
        actorId: actor.actorId,
        actorName: actor.actorName,
        oldValues: { assignedToId: userId },
        newValues: { assignedToId: assigneeId },
        changedFields: ["assignedToId"],
        tx,
      });
      await tx.leadActivity.create({
        data: {
          leadId,
          actorId: actor.actorId,
          actorName: actor.actorName,
          type: "NOTE",
          content: `Chia lại lead → ${nameMap.get(assigneeId) ?? assigneeId} (sale cũ nghỉ)`,
        },
      });
    }
  });

  // Báo đúng số ĐÃ chia, không phải số lead tìm thấy — hai số này bằng nhau ở
  // đường đi thường, nhưng báo theo số thật thì khi lệch còn nhìn ra.
  return { ok: true, reassigned: dist.size };
}
