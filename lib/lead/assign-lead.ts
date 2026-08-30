import "server-only";
// lib/lead/assign-lead.ts — CỬA DUY NHẤT TIÊU LƯỢT của vòng chia lead.
//
// Ba hàm, ba việc rời nhau:
//   · `chiaChoLead(leadId, …)`  — chia chủ cho một lead ĐÃ TỒN TẠI. Đây là cửa duy
//     nhất đụng vào bộ đếm lượt; mọi đường vào đều đổ về đây.
//   · `ghiNhanNhapLai(…)`       — lead trùng SĐT: nâng mốc lần nhập, ghi sổ, báo chủ.
//   · `assignLead(…)`           — gói "tạo lead rồi chia" cho người gọi TRỰC TIẾP
//     (test, script). Đường vào thật đi qua `ingestIntakeLead`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO "TẠO LEAD TRƯỚC, CHIA SAU"
//
// Hai kiểu hỏng không cân nhau:
//   · tiêu lượt mà lead không có ⇒ bộ đếm nói dối vĩnh viễn, chỉ sửa được bằng tay;
//   · lead có mà chưa ai nhận   ⇒ hiện ngay trên màn "Chưa phân công", giao tay được.
// Đặt rủi ro về phía cái nhìn thấy được và tự sửa được.
//
// Bên trong `chiaChoLead` thì việc lấy lượt và việc ghi chủ PHẢI cùng một transaction
// dưới một advisory lock: đọc pool ngoài transaction là hai lead vào cùng lúc đọc
// chung một trạng thái rồi chọn trúng một người.
//
// KHOÁ THEO ĐƠN VỊ, KHÔNG KHOÁ BẢNG — CS1 và CS2 chia song song được. Dùng CHUNG
// KHOÁ với `rotation.ts` (`lead_rotation:<orgUnitId>`): đặt khoá khác là hai đường
// ghi cùng một bộ đếm mà không loại trừ nhau.
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
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

/** Đầu vào của việc chia — dùng chung cho lead mới tạo lẫn lead đã có. */
export type ChiaChoLeadInput = {
  targetCenterId: string;
  createdById: string | null;
  entryPoint: LeadEntryPoint;
  explicitOwnerId?: string | null;
  aff?: AffiliateActor | null;
};

/** Nạp thông tin người nhập rồi hỏi ma trận. Dùng chung hai nhánh có/không đơn vị. */
async function quyetDinhChuLead(
  dbc: typeof db | Parameters<typeof layPoolDangBat>[2],
  input: ChiaChoLeadInput,
) {
  const nguoiNhap = input.createdById
    ? await (dbc as typeof db).user.findUnique({
        where: { id: input.createdById },
        select: { centerId: true, roles: true },
      })
    : null;
  return resolveAssignment({
    targetCenterId: input.targetCenterId,
    createdById: input.createdById,
    createdByCenterId: nguoiNhap?.centerId ?? null,
    createdByIsSale: !!nguoiNhap?.roles.includes("SALES_CSM"),
    entryPoint: input.entryPoint,
    explicitOwnerId: input.explicitOwnerId ?? null,
    aff: input.aff ?? null,
    duplicateOf: null, // trùng đã được caller xử trước khi tạo lead
  });
}

/**
 * CHIA CHỦ cho một lead ĐÃ TỒN TẠI — cửa duy nhất tiêu lượt của vòng.
 *
 * Thứ tự "tạo lead trước, chia sau" là CÓ CHỦ ĐÍCH. Hai kiểu hỏng không cân nhau:
 *   · tiêu lượt mà lead không có ⇒ bộ đếm nói dối vĩnh viễn, chỉ sửa được bằng tay;
 *   · lead có mà chưa ai nhận ⇒ hiện ngay trên màn "Chưa phân công", quản lý giao tay.
 * Cái sau nhìn thấy được và tự sửa được, nên đặt rủi ro về phía đó.
 */
export async function chiaChoLead(
  leadId: string,
  input: ChiaChoLeadInput,
  now: Date = new Date(),
): Promise<{ ok: boolean; assignedToId: string | null; consumedTurn: boolean; error?: string }> {
  const orgUnitId = await orgUnitIdCuaCoSo(input.targetCenterId);
  if (!orgUnitId) {
    // KHÔNG có đơn vị ⇒ không có sổ lượt để ghi ⇒ KHÔNG chia tự động được: thà để
    // CHƯA PHÂN còn hơn chia bằng đường khác rồi lệch sổ mà không ai biết.
    //
    // NHƯNG chủ lead đã BIẾT SẴN (sale tự nhập, mã NV trên phiếu, cột sale trong
    // Excel, quản lý giao tay) thì không cần sổ lượt nào cả — người ta đã chỉ đích
    // danh. Chặn cả nhánh này là làm hỏng một hành vi đang chạy đúng ở mọi cơ sở
    // chưa gắn vào cây tổ chức, mà lại hỏng IM LẶNG: phiếu vẫn tạo, chỉ là không
    // ai nhận. (Đúng ca `mã NV có thật ⇒ gán thẳng cho người đó` trong bộ
    // tests/lead-intake — nó đỏ ngay lượt chạy đầu.)
    const quyet = await quyetDinhChuLead(db, input);
    if (quyet.kind === "OWNER") {
      await db.lead.update({
        where: { id: leadId },
        data: {
          assignedToId: quyet.ownerId,
          assignedAt: now,
          assignedById: quyet.source === "MANAGER" ? input.createdById : null,
          assignmentSource: quyet.source,
        },
      });
      return { ok: true, assignedToId: quyet.ownerId, consumedTurn: false };
    }
    console.warn(
      `[assign-lead] Cơ sở ${input.targetCenterId} chưa gắn đơn vị — lead ${leadId} để CHƯA PHÂN.`,
    );
    return { ok: true, assignedToId: null, consumedTurn: false };
  }

  const ketQua = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead_rotation:${orgUnitId}`}))`;

      const quyet = await quyetDinhChuLead(tx, input);

      let ownerId: string | null = quyet.kind === "OWNER" ? quyet.ownerId : null;
      let poolSnapshot: ReturnType<typeof anhChupPool> | null = null;
      let turnCountAfter: number | null = null;
      let consumedTurn = false;
      let poolRong = false;

      if (quyet.kind === "AUTO") {
        const pool = await layPoolDangBat(orgUnitId, input.targetCenterId, tx);
        poolSnapshot = anhChupPool(pool);
        if (pool.length === 0) {
          // KHÔNG xếp hàng đợi gán bù: khi có người bật lại, quản lý giao tay, và
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

      await tx.lead.update({
        where: { id: leadId },
        data: {
          assignedToId: ownerId,
          assignedAt: ownerId ? now : null,
          // Người THAO TÁC gán — chỉ có ở nhánh giao tay; máy chia thì để trống.
          assignedById: quyet.source === "MANAGER" ? input.createdById : null,
          assignmentSource: quyet.source,
        },
      });

      await tx.leadAssignmentLog.create({
        data: {
          leadId,
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

      return { ownerId, consumedTurn, poolRong };
    },
    { maxWait: 5_000, timeout: 15_000 },
  );

  if (ketQua.poolRong) {
    const l = await db.lead.findUnique({ where: { id: leadId }, select: { parentName: true } });
    await baoPoolRong(input.targetCenterId, leadId, l?.parentName ?? "(không tên)");
  }

  return { ok: true, assignedToId: ketQua.ownerId, consumedTurn: ketQua.consumedTurn };
}

/**
 * GHI NHẬN LẦN NHẬP LẠI của một lead đã có (trùng SĐT).
 *
 * Ba việc, không được thiếu việc nào:
 *   · nâng `lastInboundAt` + `inboundCount` — nếu không, phiếu vừa gọi lại trông y
 *     hệt phiếu nguội ba tháng và Sale không có cách nào biết để gọi trước;
 *   · ghi `LeadAssignmentLog` nguồn DUPLICATE, `consumedTurn = false`;
 *   · báo cho người ĐANG GIỮ lead — họ là người phải gọi lại.
 *
 * KHÔNG đụng chủ lead: đổi chủ ở đây là gõ lại số của khách thì cướp được phiếu.
 */
export async function ghiNhanNhapLai(params: {
  leadId: string;
  centerId: string | null;
  source: string | null;
  createdById: string | null;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const lead = await db.lead.update({
    where: { id: params.leadId },
    data: { lastInboundAt: now, inboundCount: { increment: 1 } },
    select: { assignedToId: true, parentName: true, orgUnitId: true },
  });

  const orgUnitId =
    lead.orgUnitId ?? (params.centerId ? await orgUnitIdCuaCoSo(params.centerId) : null);
  if (orgUnitId) {
    await db.leadAssignmentLog.create({
      data: {
        leadId: params.leadId,
        orgUnitId,
        assignedToId: lead.assignedToId,
        createdById: params.createdById,
        source: "DUPLICATE",
        consumedTurn: false,
        note: `Nhập lại phiếu đã có (nguồn: ${params.source ?? "không rõ"}).`,
      },
    });
  }

  if (lead.assignedToId) {
    await notifyStaff({
      userIds: [lead.assignedToId],
      // Khoá theo MỐC: mỗi lần khách quay lại là một lần đáng gọi, gom lại là nuốt.
      dedupeKey: `lead.nhap_lai:${params.leadId}:${now.getTime()}`,
      title: "Khách vừa để lại thông tin lần nữa",
      body: `Lead "${lead.parentName}" vừa được nhập lại từ ${params.source ?? "nguồn không rõ"}.`,
      href: `/leads/${params.leadId}`,
      entityId: params.leadId,
    }).catch((err) => console.error("[assign-lead] không gửi được thông báo nhập lại:", err));
  }
}

/**
 * Tạo lead + chia chủ, hoặc ghi nhận trùng. Đường DÙNG TRỰC TIẾP (test, script).
 *
 * Các đường vào thật (`/nhap-khach-hang`, webhook, import) đi qua `ingestIntakeLead`
 * — nó là cửa TẠO LEAD duy nhất (dedupe, LeadChild, UTM, ghi kép orgUnitId) và nó
 * gọi `chiaChoLead` ở cuối. Hàm này chỉ gói hai bước đó lại cho người gọi trực tiếp.
 */
export async function assignLead(
  input: AssignLeadInput,
  now: Date = new Date(),
): Promise<AssignLeadResult> {
  const phone = canonicalPhone(input.phone) ?? input.phone.trim();
  const orgUnitId = await orgUnitIdCuaCoSo(input.targetCenterId);
  if (!orgUnitId) {
    return {
      ok: false,
      assignedToId: null,
      duplicate: false,
      consumedTurn: false,
      error: "Cơ sở này chưa gắn đơn vị trong cây tổ chức — không chia lead được.",
    };
  }

  // ── Trùng SĐT — trước mọi thứ ─────────────────────────────────────────────
  const bienThe = phoneVariants(phone);
  const trung = bienThe.length
    ? await db.lead.findFirst({
        where: { phone: { in: bienThe }, deletedAt: null },
        select: { id: true, assignedToId: true },
        orderBy: { createdAt: "asc" },
      })
    : null;
  if (trung) {
    await db.leadDuplicate.create({
      data: { primaryLeadId: trung.id, duplicatePhone: phone, source: input.source ?? null },
    });
    await ghiNhanNhapLai({
      leadId: trung.id,
      centerId: input.targetCenterId,
      source: input.source ?? null,
      createdById: input.createdById,
      now,
    });
    return {
      ok: true,
      leadId: trung.id,
      assignedToId: trung.assignedToId,
      duplicate: true,
      consumedTurn: false,
    };
  }

  const lead = await db.lead.create({
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
      lastInboundAt: now,
      inboundCount: 1,
    },
    select: { id: true },
  });

  const chia = await chiaChoLead(
    lead.id,
    {
      targetCenterId: input.targetCenterId,
      createdById: input.createdById,
      entryPoint: input.entryPoint,
      explicitOwnerId: input.explicitOwnerId ?? null,
      aff: input.aff ?? null,
    },
    now,
  );

  return {
    ok: true,
    leadId: lead.id,
    assignedToId: chia.assignedToId,
    duplicate: false,
    consumedTurn: chia.consumedTurn,
  };
}
