// lib/auth/org-role-sync.ts — đồng bộ `UserOrgRole` (RBAC v2) theo `User.roles[]` (v1).
//
// BỐI CẢNH (sự cố 07/08/2026): `createUserAction` chỉ ghi `User.roles[]`; đường DUY NHẤT
// sinh `UserOrgRole` trong app là màn /admin/users/[id]/org-roles phải bấm tay. Prod chạy
// v2 ⇒ tài khoản mới rỗng quyền: GV đăng nhập được, thấy lớp, nhưng mọi `checkPermission`
// đều false ("Không có quyền điểm danh lớp này"). 4 tài khoản GV đã dính.
//
// THIẾT KẾ:
//   • GÁN theo trạng thái THẬT trong DB (không diff) ⇒ idempotent + tự CHỮA tài khoản cũ
//     đang thiếu vai mỗi lần admin sửa user.
//   • THU HỒI theo DIFF (vai suy từ trạng thái TRƯỚC mà trạng thái SAU không còn), VÀ CHỈ
//     trên dòng máy tự sinh (`UserOrgRole.source = "AUTO"`) — xem SL-01 dưới đây.
//   • KHÔNG bỏ qua im lặng: thiếu đơn vị hoặc thiếu RoleDef → ném lỗi, transaction rollback.
//     Chính cái "skip im lặng" của `patch-rbac-staff.ts:123` đã đẻ ra sự cố này.
//
// SL-01 (24/08/2026 — docs/prd/A-nen-tang.md §10.1, OQ-5): trước bản vá này, "vai gán tay
// nằm ngoài `prevPlan`" là một KHẲNG ĐỊNH SAI. `prevPlan` được SUY LẠI từ MỘT đơn vị neo,
// nên khi đơn vị neo CŨ trùng đúng cơ sở được gán tay, dòng gán tay rơi vào `prevPlan` và bị
// `EXPIRED` bởi một thao tác KHÔNG nhằm thu hồi quyền (chỉ sửa ô "Đơn vị"). Trên prod đang
// có cấu hình QLCS đa cơ sở gán tay ⇒ đây là lỗ hổng thật, chờ nổ. Từ SL-01, quyền thu hồi
// được quyết bằng cột `UserOrgRole.source`, KHÔNG bằng suy luận:
//   • `source = "MANUAL"` → người chịu trách nhiệm; máy KHÔNG BAO GIỜ thu hồi.
//   • `source = "AUTO"` hoặc `null` (dòng cũ, trước migration) → máy sinh; máy được thu hồi.
import type { Prisma, Role } from "@prisma/client";
import { logRbacAudit } from "@/lib/audit/log";
import {
  isHoRootOrgType,
  loiNeoHoRoot,
  roleBlockedAtHoRoot,
} from "@/lib/auth/org-anchor-rules";
import {
  planOrgRoleTargets,
  type OrgRoleTarget,
} from "@/lib/auth/legacy-role-map";

/** Lỗi nghiệp vụ — message tiếng Việt, hiện thẳng cho admin. */
export class OrgRoleSyncError extends Error {
  readonly code = "ORG_ROLE_SYNC_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "OrgRoleSyncError";
  }
}

type Tx = Prisma.TransactionClient;

/** Ảnh chụp vai trò + đơn vị của tài khoản tại một thời điểm. */
export type RoleSnapshot = {
  roles: readonly Role[];
  /** `User.orgUnitId`. null = chưa gán đơn vị. */
  orgUnitId: string | null;
};

export type ReconcileInput = {
  tx: Tx;
  userId: string;
  /** Trạng thái TRƯỚC thao tác (tạo mới → `{ roles: [], orgUnitId: null }`). */
  previous: RoleSnapshot;
  /** Trạng thái SAU thao tác. */
  next: RoleSnapshot;
  actorId: string | null;
  actorName: string;
  reason: string;
};

export type ReconcileResult = {
  /** RoleDef.code đã gán thêm. */
  assigned: string[];
  /** RoleDef.code đã thu hồi. */
  revoked: string[];
};

/**
 * Nguồn gốc dòng `UserOrgRole` (SL-01). `null` = dòng cũ chưa phân loại.
 * Cột là `String?` ở DB (miền giá trị ép bằng CHECK `userorgrole_source_domain`) — kiểu này
 * hẹp lại ở tầng TS để không ai gõ nhầm giá trị thứ ba.
 */
export type OrgRoleSource = "AUTO" | "MANUAL";

/** Nhãn máy tự sinh — dùng chung cho cả lúc ghi lẫn lúc so ở nhánh thu hồi. */
const SOURCE_AUTO: OrgRoleSource = "AUTO";
/** Nhãn người gán tay. Chỉ `lib/auth/rbac-service.ts` được ghi giá trị này. */
const SOURCE_MANUAL: OrgRoleSource = "MANUAL";

/**
 * Dòng này có thuộc quyền thu hồi của đồng bộ TỰ ĐỘNG không?
 *
 * ⚠️ So theo chiều "KHÁC MANUAL" chứ không phải "BẰNG AUTO", và đó là chủ đích: dòng sinh
 * trước migration SL-01 mang `null`. Lọc cứng `= "AUTO"` thì dòng `null` trượt khỏi bộ lọc
 * và KHÔNG BAO GIỜ thu hồi được nữa — đổi một lỗ hổng (mất quyền im lặng) lấy một lỗ hổng
 * ngược chiều (quyền kẹt vĩnh viễn), tệ ngang nhau.
 */
function mayThuHoiDuoc(source: string | null | undefined): boolean {
  return source !== SOURCE_MANUAL;
}

/**
 * Dòng phân quyền còn hiệu lực tại `now`.
 *
 * Export vì `lib/auth/rbac-service.ts` cần ĐÚNG định nghĩa này để biết một cú "Gán" tay
 * là HỒI SINH dòng đã hết hiệu lực (được phép đổi nhãn `source`) hay chỉ gia hạn một dòng
 * đang sống (KHÔNG được đổi nhãn). Hai bản sao của cùng một luật là hai bản sẽ trôi lệch.
 */
export function isLiveOrgRole(
  row: { status: string; effectiveFrom: Date; effectiveTo: Date | null },
  now: Date,
): boolean {
  return (
    row.status === "ACTIVE" &&
    row.effectiveFrom <= now &&
    (row.effectiveTo === null || row.effectiveTo >= now)
  );
}

/**
 * Đồng bộ `UserOrgRole` cho 1 tài khoản. Gọi BÊN TRONG transaction đã ghi `User.roles[]`
 * — ném lỗi là cả cụm rollback, không để tài khoản nửa vời (có roles[] mà không có vai v2).
 */
export async function reconcileUserOrgRoles(
  input: ReconcileInput,
): Promise<ReconcileResult> {
  const { tx, userId } = input;
  const now = new Date();

  const orgs = await tx.orgUnit.findMany({
    where: { deletedAt: null },
    select: { id: true, type: true },
  });
  const ho =
    orgs.find((o) => o.type === "HO") ?? orgs.find((o) => o.type === "ROOT");
  if (!ho) {
    throw new OrgRoleSyncError(
      "Chưa có đơn vị Hội sở (OrgUnit type=HO) — không gán được quyền RBAC. Chạy seed OrgUnit trước.",
    );
  }
  const typeById = new Map(orgs.map((o) => [o.id, o.type]));

  const plan = (snap: RoleSnapshot) =>
    planOrgRoleTargets({
      roles: snap.roles,
      anchorOrgUnitId: snap.orgUnitId,
      anchorIsCenter: snap.orgUnitId
        ? typeById.get(snap.orgUnitId) === "CENTER"
        : false,
      hoOrgUnitId: ho.id,
    });

  const nextPlan = plan(input.next);
  if (nextPlan.missingAnchor.length > 0) {
    throw new OrgRoleSyncError(
      `Chưa chọn "Đơn vị" cho tài khoản — vai trò ${nextPlan.missingAnchor.join(", ")} ` +
        `cần đơn vị mới gán được quyền (RBAC v2). Chọn đơn vị rồi lưu lại.`,
    );
  }
  // A-01-3 (bất biến L-A5) — ĐƯỜNG GHI THỨ HAI của luật "không neo CENTER_MANAGER ở HO/ROOT".
  //
  // `assignUserOrgRole` đã rào đường gán tay, nhưng đường NÀY thì không, và nó dễ đi hơn
  // nhiều: `planOrgRoleTargets` ánh xạ `CENTER_MANAGER → { org: "CENTER" }` sang thẳng
  // `anchorOrgUnitId`, mà picker đơn vị ở /admin/users/[id]/edit CÓ liệt kê Hội sở. Chỉ cần
  // để `roles = [CENTER_MANAGER]` rồi đổi ô "Đơn vị" sang "Hội sở" là sinh
  // `UserOrgRole(CENTER_MANAGER @ HO)` ⇒ `isHoLevel` ⇒ người đó thấy lead/học viên/thanh toán
  // của MỌI cơ sở, không cảnh báo, không audit bất thường.
  //
  // Ném lỗi (giống `missingAnchor` ngay trên) chứ KHÔNG bỏ qua im lặng: reconcile chạy trong
  // transaction của caller nên cả cụm rollback, và admin nhận đúng câu cần làm gì tiếp.
  // Chỉ soi `nextPlan`: thu hồi một dòng neo sai ở trạng thái TRƯỚC là việc nên xảy ra.
  const camNeo = nextPlan.targets.filter(
    (t) => roleBlockedAtHoRoot(t.roleCode) && isHoRootOrgType(typeById.get(t.orgUnitId) ?? ""),
  );
  if (camNeo.length > 0) {
    const t = camNeo[0] as OrgRoleTarget;
    throw new OrgRoleSyncError(
      `${loiNeoHoRoot(t.roleCode, typeById.get(t.orgUnitId) ?? "HO")} ` +
        `Hãy đổi ô "Đơn vị" của tài khoản sang một cơ sở, hoặc bỏ vai ${t.legacy} khỏi tài khoản.`,
    );
  }

  // Đơn vị TRƯỚC có thể null (tài khoản cũ) → prevPlan rỗng → chỉ gán thêm, không thu hồi gì.
  const prevPlan = plan(input.previous);

  const codes = [
    ...new Set(
      [...nextPlan.targets, ...prevPlan.targets].map((t) => t.roleCode),
    ),
  ];
  if (codes.length === 0) return { assigned: [], revoked: [] };

  const roleDefs = await tx.roleDef.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, isActive: true },
  });
  const roleIdByCode = new Map(roleDefs.map((r) => [r.code, r.id]));
  const missing = codes.filter((c) => !roleIdByCode.has(c));
  if (missing.length > 0) {
    throw new OrgRoleSyncError(
      `Thiếu RoleDef: ${missing.join(", ")} — chạy workflow "Seed Production RolePermission" rồi thử lại.`,
    );
  }
  const inactive = roleDefs.filter((r) => !r.isActive).map((r) => r.code);
  if (inactive.length > 0) {
    throw new OrgRoleSyncError(
      `Vai trò ${inactive.join(", ")} đang bị tắt (RoleDef.isActive=false) — bật lại ở /admin/roles rồi thử lại.`,
    );
  }

  const existing = await tx.userOrgRole.findMany({
    where: { userId },
    select: {
      orgUnitId: true,
      roleId: true,
      status: true,
      effectiveFrom: true,
      effectiveTo: true,
      // SL-01 — bỏ dòng này là bản vá vô hiệu IM LẶNG: `sourceByKey` toàn `undefined`,
      // mọi dòng lại trở thành thu hồi được, kể cả dòng gán tay.
      source: true,
    },
  });
  const liveKeys = new Set(
    existing
      .filter((r) => isLiveOrgRole(r, now))
      .map((r) => `${r.orgUnitId}:${r.roleId}`),
  );
  // "Còn hiệu lực" và "do ai tạo" là hai câu hỏi khác nhau — giữ hai cấu trúc riêng.
  const sourceByKey = new Map<string, string | null>(
    existing.map((r) => [`${r.orgUnitId}:${r.roleId}`, r.source]),
  );

  const rowKey = (t: OrgRoleTarget) =>
    `${t.orgUnitId}:${roleIdByCode.get(t.roleCode) as string}`;
  const nextKeys = new Set(nextPlan.targets.map(rowKey));

  // GÁN: mọi vai đích chưa còn hiệu lực trong DB (kể cả dòng cũ đã EXPIRED → kích hoạt lại).
  const assigned: string[] = [];
  for (const t of nextPlan.targets) {
    // ⚠️ GIỮ NGUYÊN guard này và TUYỆT ĐỐI không lọc nó theo `source`: nó là thứ bảo đảm
    // một dòng MANUAL đang CÒN HIỆU LỰC không bao giờ bị nhánh gán ghi đè / đổi nhãn.
    if (liveKeys.has(rowKey(t))) continue;
    const roleId = roleIdByCode.get(t.roleCode) as string;
    await tx.userOrgRole.upsert({
      where: {
        userId_orgUnitId_roleId: { userId, orgUnitId: t.orgUnitId, roleId },
      },
      // Nhánh `update` chỉ chạy trên dòng ĐÃ HẾT HIỆU LỰC ở đúng key này (guard ngay trên).
      // Nhãn phải đổi về AUTO: khoá ghép (userId, orgUnitId, roleId) không cho tồn tại hai
      // dòng cùng key, nên máy BUỘC phải dùng lại đúng dòng đó. Giữ nhãn MANUAL ⇒ dòng do
      // máy cấp mà máy không gỡ được ⇒ quyền kẹt vĩnh viễn ở lần đổi vai sau. Đây là đánh
      // đổi có chủ đích của SL-01, khoá bằng test trong `org-role-sync.test.ts`.
      update: {
        status: "ACTIVE",
        effectiveFrom: now,
        effectiveTo: null,
        source: SOURCE_AUTO,
      },
      create: {
        userId,
        orgUnitId: t.orgUnitId,
        roleId,
        status: "ACTIVE",
        effectiveFrom: now,
        grantedById: input.actorId ?? userId,
        // Ghi TƯỜNG MINH, không dựa vào DEFAULT của DB: máy phải NHẬN trách nhiệm cho dòng
        // nó tạo, nếu không nó tự khoá tay mình ở lần thu hồi sau.
        source: SOURCE_AUTO,
      },
    });
    await logRbacAudit({
      entity: "ASSIGNMENT",
      entityId: `${userId}:${t.orgUnitId}:${roleId}`,
      action: "ASSIGN",
      actorId: input.actorId,
      actorName: input.actorName,
      reason: input.reason,
      newValues: {
        userId,
        orgUnitId: t.orgUnitId,
        roleCode: t.roleCode,
        legacyRole: t.legacy,
        status: "ACTIVE",
        auto: true,
        source: SOURCE_AUTO,
      },
      tx,
    });
    assigned.push(t.roleCode);
  }

  // THU HỒI: vai suy từ trạng thái TRƯỚC mà trạng thái SAU không còn (đổi vai trò / đổi
  // đơn vị).
  //
  // SL-01 — `prevPlan` là SUY LUẬN, không phải bằng chứng: nó dựng lại từ MỘT đơn vị neo,
  // nên một dòng gán tay ở đúng đơn vị neo cũ VẪN rơi vào đây. Quyền thu hồi được quyết
  // bằng cột `source`, và điều kiện được ép ở CẢ HAI tầng — bộ nhớ (`mayThuHoiDuoc`) lẫn
  // câu lệnh DB (`updateMany` mang điều kiện trong `where`) — để một đường ghi đồng thời
  // đổi nhãn dòng sang MANUAL cũng không lọt.
  const revoked: string[] = [];
  for (const t of prevPlan.targets) {
    const key = rowKey(t);
    if (nextKeys.has(key) || !liveKeys.has(key)) continue;
    if (!mayThuHoiDuoc(sourceByKey.get(key))) continue;
    const roleId = roleIdByCode.get(t.roleCode) as string;
    // `updateMany` chứ không `update`: `update` chỉ nhận khoá duy nhất trong `where`, không
    // nhét được điều kiện `source` xuống DB.
    // Viết `OR: [AUTO, null]` chứ KHÔNG viết `{ not: "MANUAL" }`: ngữ nghĩa NULL của `not`
    // trong Prisma phụ thuộc phiên bản, mà dòng `null` (trước migration SL-01) là ca BẮT
    // BUỘC phải thu hồi được.
    const { count } = await tx.userOrgRole.updateMany({
      where: {
        userId,
        orgUnitId: t.orgUnitId,
        roleId,
        OR: [{ source: SOURCE_AUTO }, { source: null }],
      },
      data: { status: "EXPIRED", effectiveTo: now },
    });
    // Không ghi audit REVOKE cho việc đã không xảy ra.
    if (count === 0) continue;
    await logRbacAudit({
      entity: "ASSIGNMENT",
      entityId: `${userId}:${t.orgUnitId}:${roleId}`,
      action: "REVOKE",
      actorId: input.actorId,
      actorName: input.actorName,
      reason: input.reason,
      oldValues: { status: "ACTIVE" },
      newValues: {
        roleCode: t.roleCode,
        legacyRole: t.legacy,
        status: "EXPIRED",
        effectiveTo: now,
        auto: true,
        source: SOURCE_AUTO,
      },
      tx,
    });
    revoked.push(t.roleCode);
  }

  return { assigned, revoked };
}
