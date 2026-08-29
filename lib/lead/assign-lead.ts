import "server-only";
// lib/lead/assign-lead.ts — CỬA GHI DUY NHẤT của việc chia lead.
//
// Một transaction, một advisory lock theo đơn vị, làm trọn năm việc:
//   1. tra trùng SĐT → trùng thì nâng mốc lần nhập rồi DỪNG (không đẻ lead mới);
//   2. hỏi `resolveAssignment()` (hàm thuần) xem lead về tay ai, lượt có tiêu không;
//   3. nhánh AUTO thì lấy pool đang bật rồi lấy một lượt của vòng;
//   4. tạo `Lead`;
//   5. ghi `LeadAssignmentLog` kèm ảnh chụp pool.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO PHẢI GOM VÀO MỘT TRANSACTION
//
// Đường cũ đọc pool NGOÀI transaction rồi mới ghi: hai lead vào cùng lúc đọc chung
// một trạng thái và chọn trúng một người. Ở đây bước 3 và 4 phải cùng sống cùng
// chết — tiêu một lượt mà lead không tạo được là bộ đếm nói dối vĩnh viễn, không
// có đường sửa ngoài chỉnh tay.
//
// KHOÁ THEO ĐƠN VỊ, KHÔNG KHOÁ BẢNG: CS1 và CS2 chia song song được. Khoá dùng
// CHUNG KHOÁ với `rotation.ts` (`lead_rotation:<orgUnitId>`) — đặt khoá khác là
// hai đường ghi cùng một bộ đếm mà không loại trừ nhau.
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { canonicalPhone, phoneVariants } from "@/lib/phone";
import { resolveAssignment, type LeadEntryPoint, type AffiliateActor } from "./assign-resolve";
import { layPoolDangBat, anhChupPool, orgUnitIdCuaCoSo } from "./pool";
import { takeRotationTurnsTx } from "./rotation";
import { notifyStaff } from "@/lib/notifications/notify";

export type AssignLeadInput = {
  /** Cơ sở KHÁCH chọn. Đích của mọi quyết định — không phải cơ sở người nhập. */
  targetCenterId: string;
  createdById: string | null;
  entryPoint: LeadEntryPoint;
  /** SĐT đã chuẩn hoá `84…`; hàm tự chuẩn hoá lại cho chắc. */
  phone: string;
  parentName: string;
  childName?: string | null;
  source?: string | null;
  note?: string | null;
  courseId?: string | null;
  /** Cột sale trong Excel / người quản lý chọn khi giao tay. Đã tra ra tài khoản thật. */
  explicitOwnerId?: string | null;
  /** Mã affiliate đã tra ra người. Chỉ có nghĩa khi `entryPoint = "LANDING"`. */
  aff?: AffiliateActor | null;
};

export type AssignLeadResult = {
  ok: boolean;
  leadId?: string;
  assignedToId: string | null;
  /** `true` = trùng SĐT, không tạo lead mới. */
  duplicate: boolean;
  consumedTurn: boolean;
  error?: string;
};

/** Chỉ lead CHƯA xoá mềm mới chặn trùng — lead đã xoá thì coi như không có. */
async function timLeadTrung(
  tx: Prisma.TransactionClient,
  phone: string,
): Promise<{ id: string; assignedToId: string | null } | null> {
  const bienThe = phoneVariants(phone);
  if (bienThe.length === 0) return null;
  // `phoneVariants` trả cả `84…` lẫn `0…`: DB còn dữ liệu cũ ghi dạng `0…`, tra
  // một dạng là bỏ sót đúng nhóm lead cũ nhất.
  return tx.lead.findFirst({
    where: { phone: { in: bienThe }, deletedAt: null },
    select: { id: true, assignedToId: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Người cần biết khi pool rỗng: quản lý cơ sở của đơn vị đó + quản trị hệ thống.
 *
 * Lead "Chưa phân công" nằm im không ai hay chính là kiểu hỏng đắt nhất của cả
 * module này — có lead, có khách chờ, mà không ai được giao.
 */
async function baoPoolRong(
  centerId: string,
  leadId: string | null,
  parentName: string,
): Promise<void> {
  const nguoi = await db.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [
        { centerId, roles: { hasSome: ["CENTER_MANAGER"] } },
        { roles: { hasSome: ["SUPER_ADMIN"] } },
      ],
    },
    select: { id: true },
  });
  if (nguoi.length === 0) return;
  await notifyStaff({
    userIds: nguoi.map((u) => u.id),
    // Khoá theo LEAD chứ không theo cơ sở: gom theo cơ sở thì phiếu thứ hai trở đi
    // bị nuốt, mà mỗi phiếu là một khách đang chờ.
    dedupeKey: `lead.pool_rong:${leadId ?? parentName}`,
    title: "Lead chưa được phân công",
    body: `Không còn ai đang nhận lead ở cơ sở này — phiếu "${parentName}" đang nằm chờ. Bật lại người trong pool hoặc giao tay.`,
    href: leadId ? `/leads/${leadId}` : "/quan-ly-chia-lead",
    entityId: leadId,
  }).catch((err) => console.error("[assign-lead] không gửi được thông báo pool rỗng:", err));
}

/**
 * Tạo lead + chia chủ, hoặc ghi nhận trùng.
 *
 * @param now bơm vào để test kiểm được thứ tự lượt; mặc định là bây giờ.
 */
export async function assignLead(
  input: AssignLeadInput,
  now: Date = new Date(),
): Promise<AssignLeadResult> {
  const phone = canonicalPhone(input.phone) ?? input.phone.trim();
  const orgUnitId = await orgUnitIdCuaCoSo(input.targetCenterId);
  if (!orgUnitId) {
    // Không suy được đơn vị ⇒ KHÔNG có sổ lượt nào để ghi. Thà từ chối còn hơn
    // chia bằng đường khác rồi lệch sổ mà không ai biết.
    return {
      ok: false,
      assignedToId: null,
      duplicate: false,
      consumedTurn: false,
      error: "Cơ sở này chưa gắn đơn vị trong cây tổ chức — không chia lead được.",
    };
  }

  const ketQua = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead_rotation:${orgUnitId}`}))`;

      // ── 1. TRÙNG SĐT — trước mọi thứ ────────────────────────────────────
      const trung = await timLeadTrung(tx, phone);
      if (trung) {
        await tx.lead.update({
          where: { id: trung.id },
          // Nâng mốc lần nhập gần nhất: nếu không, phiếu vừa gọi lại trông y hệt
          // phiếu nguội ba tháng, và Sale không có cách nào biết để gọi trước.
          data: { lastInboundAt: now, inboundCount: { increment: 1 } },
        });
        await tx.leadDuplicate.create({
          data: { primaryLeadId: trung.id, duplicatePhone: phone, source: input.source ?? null },
        });
        await tx.leadAssignmentLog.create({
          data: {
            leadId: trung.id,
            orgUnitId,
            assignedToId: trung.assignedToId,
            createdById: input.createdById,
            source: "DUPLICATE",
            consumedTurn: false,
            note: `Nhập lại phiếu đã có (${input.entryPoint}).`,
          },
        });
        return {
          leadId: trung.id,
          assignedToId: trung.assignedToId,
          duplicate: true,
          consumedTurn: false,
          poolRong: false,
        };
      }

      // ── 2. Ma trận quyết định (hàm thuần) ───────────────────────────────
      const nguoiNhap = input.createdById
        ? await tx.user.findUnique({
            where: { id: input.createdById },
            select: { centerId: true, roles: true },
          })
        : null;
      const quyet = resolveAssignment({
        targetCenterId: input.targetCenterId,
        createdById: input.createdById,
        createdByCenterId: nguoiNhap?.centerId ?? null,
        createdByIsSale: !!nguoiNhap?.roles.includes("SALES_CSM"),
        entryPoint: input.entryPoint,
        explicitOwnerId: input.explicitOwnerId ?? null,
        aff: input.aff ?? null,
        duplicateOf: null, // đã xử ở bước 1
      });

      // ── 3. Nhánh AUTO: lấy pool đang bật rồi lấy một lượt ───────────────
      let ownerId: string | null = quyet.kind === "OWNER" ? quyet.ownerId : null;
      let poolSnapshot: ReturnType<typeof anhChupPool> | null = null;
      let turnCountAfter: number | null = null;
      let consumedTurn = false;
      let poolRong = false;

      if (quyet.kind === "AUTO") {
        const pool = await layPoolDangBat(orgUnitId, input.targetCenterId, tx);
        poolSnapshot = anhChupPool(pool);
        if (pool.length === 0) {
          // KHÔNG xếp hàng đợi gán bù: khi có người bật lại, QLCS giao tay, và
          // lượt giao tay đó không tiêu lượt (ca 4 của ma trận).
          poolRong = true;
        } else {
          const [chon] = await takeRotationTurnsTx(
            tx,
            orgUnitId,
            pool.map((m) => m.userId),
            1,
            now,
          );
          ownerId = chon ?? null;
          consumedTurn = !!chon;
          if (chon) {
            const sau = await tx.leadRotationTurn.findUnique({
              where: { orgUnitId_userId: { orgUnitId, userId: chon } },
              select: { turns: true },
            });
            turnCountAfter = sau?.turns ?? null;
          }
        }
      }

      // ── 4. Tạo lead ─────────────────────────────────────────────────────
      const lead = await tx.lead.create({
        data: {
          parentName: input.parentName,
          phone,
          childName: input.childName ?? null,
          centerId: input.targetCenterId,
          orgUnitId,
          courseId: input.courseId ?? null,
          source: input.source ?? null,
          note: input.note ?? null,
          createdById: input.createdById,
          assignedToId: ownerId,
          assignedAt: ownerId ? now : null,
          // Người THAO TÁC gán — chỉ có ở nhánh giao tay; máy chia thì để trống.
          assignedById: quyet.source === "MANAGER" ? input.createdById : null,
          assignmentSource: quyet.source,
          lastInboundAt: now,
          inboundCount: 1,
        },
        select: { id: true },
      });

      // ── 5. Sổ chia lead ─────────────────────────────────────────────────
      await tx.leadAssignmentLog.create({
        data: {
          leadId: lead.id,
          orgUnitId,
          assignedToId: ownerId,
          createdById: input.createdById,
          source: quyet.source,
          consumedTurn,
          turnCountAfter,
          poolSnapshot: poolSnapshot ?? undefined,
          note: poolRong ? "Pool rỗng — để CHƯA PHÂN CÔNG." : null,
        },
      });

      return {
        leadId: lead.id,
        assignedToId: ownerId,
        duplicate: false,
        consumedTurn,
        poolRong,
      };
    },
    { maxWait: 5_000, timeout: 15_000 },
  );

  // Thông báo NGOÀI transaction: gửi trong transaction thì mạng chậm giữ khoá đơn
  // vị, và mọi lead khác của cơ sở đó xếp hàng sau một cái chuông.
  if (ketQua.poolRong) {
    await baoPoolRong(input.targetCenterId, ketQua.leadId ?? null, input.parentName);
  }

  return {
    ok: true,
    leadId: ketQua.leadId,
    assignedToId: ketQua.assignedToId,
    duplicate: ketQua.duplicate,
    consumedTurn: ketQua.consumedTurn,
  };
}
