import "server-only";
import { db } from "@/lib/db";
import { getModelVisibleCenterIds, scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/filters";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { safeRate } from "@/lib/reports/lead-kpi";
import { vnDateAt, vnParts } from "@/lib/time/vn";

// E-02 / E-03 — tỉ lệ phụ huynh đã tương tác + bảng chi tiết.
//
// 🔴 TRỤC CÁCH LY LÀ CƠ SỞ CỦA GHI DANH, KHÔNG PHẢI CƠ SỞ CỦA HỘI THOẠI.
// Lọc qua `Conversation.centerId` thì **mọi kênh 1-1 rơi hết** — DM luôn có
// `centerId = null` (`lib/chat/dm.ts`), mà đó thường lại chính là kênh phụ huynh tương
// tác thật. Kết quả sẽ là một tỉ lệ thấp giả, và không ai đoán ra vì sao.
//
// 🔴 "ĐÃ TƯƠNG TÁC" = PH ĐÃ GỬI ≥ 1 TIN trong khoảng ngày (phương án A, chốt 26/08).
// Cố ý KHÔNG dùng `ConversationParticipant.lastReadAt`: cột đó chỉ giữ MỐC CUỐI nên
// không cộng dồn theo khoảng — một phụ huynh mở app đúng một lần hồi tháng Ba sẽ được
// tính là "đã tương tác" mãi mãi, ở mọi kỳ báo cáo.

function nextDayStart(dateTo: Date): Date {
  const p = vnParts(dateTo);
  return vnDateAt(p.year, p.month, p.day + 1);
}

/** Phạm vi cơ sở HIỆU LỰC theo trục `Enrollment`. */
function effectiveCenterIds(actor: Actor, f: ScopeFilters): string[] | null {
  const visible = getModelVisibleCenterIds("Enrollment", actor);
  if (f.centerIds === null) return visible === "ALL" ? null : visible;
  return visible === "ALL" ? f.centerIds : f.centerIds.filter((c) => visible.includes(c));
}

/**
 * Tập phụ huynh trong phạm vi — MẪU SỐ của E-02.
 *
 * Điều kiện khớp `lib/chat/dm.ts`: ghi danh đang hoạt động, học viên chưa xoá, có tài
 * khoản phụ huynh, tài khoản đó chưa xoá và đang bật. Bỏ vế `isActive` là mẫu số gồm
 * cả tài khoản đã khoá — tỉ lệ tụt mà không ai giải thích được.
 */
async function loadParentScope(
  actor: Actor,
  f: ScopeFilters,
): Promise<Map<string, { parentUserId: string; studentNames: string[]; centerId: string | null }>> {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);

  const rows = await sdb.enrollment.findMany({
    where: {
      deletedAt: null,
      status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
      ...(effective ? { centerId: { in: effective } } : {}),
      student: {
        deletedAt: null,
        parentUserId: { not: null },
        parentUser: { deletedAt: null, isActive: true },
      },
    },
    select: {
      centerId: true,
      student: { select: { name: true, parentUserId: true } },
    },
    take: 20_000,
  });

  const byParent = new Map<
    string,
    { parentUserId: string; studentNames: string[]; centerId: string | null }
  >();
  for (const r of rows) {
    const pid = r.student.parentUserId;
    if (!pid) continue;
    const cur = byParent.get(pid) ?? {
      parentUserId: pid,
      studentNames: [],
      centerId: r.centerId,
    };
    if (!cur.studentNames.includes(r.student.name)) cur.studentNames.push(r.student.name);
    byParent.set(pid, cur);
  }
  return byParent;
}

/** Phụ huynh đã GỬI tin trong khoảng — kèm mốc tin gần nhất và số tin. */
async function loadSenders(
  parentIds: string[],
  f: ScopeFilters,
): Promise<Map<string, { count: number; lastAt: Date }>> {
  if (parentIds.length === 0) return new Map();
  // `Message` KHÔNG nằm trong SCOPED_MODELS (quyền chat là participant-based, không
  // center-based) ⇒ `db` trần ở đây là ĐÚNG, và cách ly nằm ở chỗ `parentIds` đã được
  // lọc theo tầm nhìn actor ngay trước khi gọi. Đừng đảo thứ tự hai bước đó.
  const rows = await db.message.groupBy({
    by: ["senderId"],
    where: {
      senderId: { in: parentIds },
      deletedAt: null,
      createdAt: { gte: f.dateFrom, lt: nextDayStart(f.dateTo) },
    },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const out = new Map<string, { count: number; lastAt: Date }>();
  for (const r of rows) {
    if (!r.senderId || !r._max.createdAt) continue;
    out.set(r.senderId, { count: r._count._all, lastAt: r._max.createdAt });
  }
  return out;
}

export type ParentInteractionStats = {
  /** Mẫu số — số phụ huynh có con đang học trong phạm vi. */
  totalParents: number;
  /** Tử số — số phụ huynh đã gửi ≥ 1 tin trong khoảng ngày. */
  interactedParents: number;
  /** 0..1, `null` khi mẫu số 0. */
  rate: number | null;
};

export async function getParentInteractionStats(
  actor: Actor,
  f: ScopeFilters,
): Promise<ParentInteractionStats> {
  const scope = await loadParentScope(actor, f);
  const senders = await loadSenders([...scope.keys()], f);
  const interacted = [...scope.keys()].filter((id) => senders.has(id)).length;
  return {
    totalParents: scope.size,
    interactedParents: interacted,
    rate: safeRate(interacted, scope.size),
  };
}

export type ParentInteractionRow = {
  parentUserId: string;
  parentName: string;
  /** ⚠️ `null` khi người xem KHÔNG đạt cổng (b) — trường không được select, không phải bị che. */
  phone: string | null;
  studentNames: string[];
  centerName: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  /**
   * Hội thoại SẴN CÓ giữa người xem và phụ huynh này — `null` khi chưa có.
   *
   * 🔴 Chỉ trả kênh đã tồn tại; E-04 KHÔNG tự mở kênh mới từ bảng này. Mở kênh là một
   * hành động có hệ quả (sinh hội thoại, gắn thành viên, gửi thông báo) và nó phải đi
   * qua `openDmAction` với đủ cổng quyền, không phải hệ quả phụ của việc xem báo cáo.
   */
  conversationId: string | null;
};

/**
 * Hội thoại mà CẢ người xem LẪN phụ huynh cùng là thành viên đang hoạt động.
 *
 * Đây cũng là chốt chặn quyền: `DashboardThreadPanel` chỉ mở được hội thoại nằm trong
 * danh sách của chính người xem, nên id lấy từ đây không mở thêm cửa nào.
 */
async function loadSharedConversations(
  viewerUserId: string,
  parentIds: string[],
): Promise<Map<string, string>> {
  if (parentIds.length === 0) return new Map();

  const mine = await db.conversationParticipant.findMany({
    where: { userId: viewerUserId, leftAt: null },
    select: { conversationId: true },
    take: 5_000,
  });
  const myIds = mine.map((m) => m.conversationId);
  if (myIds.length === 0) return new Map();

  const theirs = await db.conversationParticipant.findMany({
    where: { conversationId: { in: myIds }, userId: { in: parentIds }, leftAt: null },
    select: { conversationId: true, userId: true, conversation: { select: { type: true } } },
  });

  // Ưu tiên kênh 1-1: nếu phụ huynh vừa ở nhóm lớp vừa có DM với người xem thì mở DM.
  // Mở nhóm lớp từ một dòng nói về MỘT phụ huynh là dễ khiến người dùng nhắn nhầm chỗ.
  const out = new Map<string, string>();
  for (const t of theirs) {
    const isDm = t.conversation.type !== "CLASS_GROUP";
    if (!out.has(t.userId) || isDm) out.set(t.userId, t.conversationId);
  }
  return out;
}

/**
 * E-03 — bảng chi tiết. HAI CỔNG QUYỀN TÁCH NHAU:
 *   (a) vào được tab/endpoint — gate ở trang gọi;
 *   (b) thấy cột SĐT — `canSeePhone`, do người gọi truyền vào.
 *
 * 🔴 Không đạt (b) thì **KHÔNG select `phone`**, chứ không phải select rồi che ở UI.
 * Dữ liệu không được đưa xuống client thì không có cách nào rò; che ở UI thì nó vẫn nằm
 * trong payload RSC và ai mở tab Network cũng đọc được.
 *
 * ⚠️ `canSeePhone` do người gọi tính bằng `canViewParentContact` — CỐ Ý không gọi hàm đó
 * ở đây và cố ý không chép lại danh sách vai. Hai bản sao danh sách vai là hai luật, và
 * lần trước chính hai bản sao đẻ ra mâu thuẫn phải đi dọn.
 */
export async function getParentInteractionRows(
  actor: Actor,
  f: ScopeFilters,
  opts: { canSeePhone: boolean; viewerUserId: string; limit?: number },
): Promise<ParentInteractionRow[]> {
  const scope = await loadParentScope(actor, f);
  const parentIds = [...scope.keys()];
  if (parentIds.length === 0) return [];

  const senders = await loadSenders(parentIds, f);

  const [users, centers, sharedConversations] = await Promise.all([
    db.user.findMany({
      where: { id: { in: parentIds } },
      // Chỉ nhánh có quyền mới kéo `phone` về. `select` động chứ không phải bỏ cột lúc map.
      select: opts.canSeePhone
        ? { id: true, name: true, phone: true }
        : { id: true, name: true },
    }),
    db.center.findMany({ select: { id: true, name: true } }),
    loadSharedConversations(opts.viewerUserId, parentIds),
  ]);
  const centerNames = new Map(centers.map((c) => [c.id, c.name]));
  const userById = new Map(users.map((u) => [u.id, u]));

  return parentIds
    .map((id) => {
      const s = scope.get(id)!;
      const u = userById.get(id);
      const sent = senders.get(id);
      return {
        parentUserId: id,
        parentName: u?.name ?? "(không rõ)",
        phone: opts.canSeePhone ? ((u as { phone?: string | null })?.phone ?? null) : null,
        studentNames: s.studentNames,
        centerName: s.centerId ? (centerNames.get(s.centerId) ?? null) : null,
        messageCount: sent?.count ?? 0,
        lastMessageAt: sent?.lastAt ?? null,
        conversationId: sharedConversations.get(id) ?? null,
      };
    })
    // Chưa tương tác lên ĐẦU: bảng này để tìm phụ huynh đang im lặng, không phải để
    // khoe phụ huynh chăm nhắn tin.
    .sort((a, b) => {
      if (a.messageCount !== b.messageCount) return a.messageCount - b.messageCount;
      return a.parentName.localeCompare(b.parentName, "vi");
    })
    .slice(0, opts.limit ?? 200);
}
