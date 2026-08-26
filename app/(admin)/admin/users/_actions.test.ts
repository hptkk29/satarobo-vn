// @vitest-environment node
/**
 * `deleteUserAction` — hai lỗ thật đo được trên prod 26/08/2026.
 *
 * LỖ 1 — RÁC VAI TRÒ. Xoá mềm tài khoản chỉ đặt `User.deletedAt` + `isActive:false`
 * (`_actions.ts` trước bản vá), KHÔNG đụng `UserOrgRole`. Prod có 10 dòng
 * `UserOrgRole status=ACTIVE` thuộc về tài khoản ĐÃ XOÁ, kéo dài từ 08/07/2026, trong đó
 * một tài khoản đã xoá vẫn giữ SUPER_ADMIN tại HO.
 *
 * Đây KHÔNG phải lỗ đăng nhập — `lib/auth.ts:157` chặn cả `deletedAt` lẫn `!isActive` nên
 * những vai đó không bao giờ thành quyền thật. Nó là RÁC DỮ LIỆU: `UserOrgRole` KHÔNG có
 * quan hệ Prisma về `User` (schema.prisma:525-567 chỉ có cột `userId String`), nên KHÔNG
 * chỗ nào viết được `where: { user: { deletedAt: null } }` — mọi nơi đếm/liệt kê nhân sự
 * theo `UserOrgRole` đều tính nhầm người đã nghỉ. Ví dụ đang chạy:
 * `lib/crm/marketing-alerts.ts:9-19` (`getSuperAdminUserIds`) lọc status/effective* và
 * KHÔNG có cách nào lọc `deletedAt` ⇒ tài khoản SUPER_ADMIN đã xoá vẫn nhận
 * `StaffNotification` cảnh báo marketing hằng ngày.
 *
 * LỖ 2 — XOÁ LÀ TỰ KHOÁ MẤT ĐƯỜNG BÀN GIAO. Một tài khoản sale bị XOÁ (không phải chỉ vô
 * hiệu hoá) trước khi bàn giao: màn `/admin/ban-giao-lead` lọc danh sách "từ sale" bằng
 * `deletedAt: null` (page.tsx:51) nên người đã xoá KHÔNG còn hiện trong ô chọn ⇒ lead và
 * ghi danh của họ không còn đường bàn giao nào qua giao diện. Suýt xảy ra thật một lần;
 * lần đó may mắn cả lead lẫn ghi danh đều = 0.
 *
 * LỖ 3 — RÀO CHẶN BẰNG THỨ KHÔNG MÀN NÀO GỠ ĐƯỢC. Bản đầu của rào đếm `Enrollment.saleId`
 * KHÔNG điều kiện và chỉ đường về `/admin/ban-giao-lead`. Cả hai đều sai:
 *   • Ghi danh ở trạng thái kết thúc (TRANSFERRED/COMPLETED/CANCELLED/WITHDREW) không nằm
 *     trong danh sách của màn HS lớp (page.tsx:59-63) ⇒ không có ô chọn sale để gỡ; mà
 *     chuyển lớp thì đặt ghi danh cũ = TRANSFERRED và GIỮ NGUYÊN `saleId`
 *     (lib/transfer/service.ts:187-191) — hệ thống tự sinh ra dữ liệu khoá cứng tài khoản.
 *   • `/admin/ban-giao-lead` chỉ chuyển được ghi danh còn truy về lead ĐANG gán cho chính
 *     người đó (service.ts:182,356-360) và chỉ hiện tài khoản có `roles ∋ SALES_CSM`
 *     (page.tsx:48-52). Ghi danh gán tay (`leadChildId = null`), lead đã chuyển sang sale
 *     khác, hay người giữ lead mà không phải SALES_CSM (import "đã đăng ký" khớp theo TÊN)
 *     ⇒ chạy bàn giao báo THÀNH CÔNG với 0 bản ghi, bấm Xoá lại vẫn y nguyên câu chặn.
 *
 * BẢY ĐIỀU FILE NÀY PIN — đọc mã bằng mắt rất dễ bỏ sót:
 *
 * 1. Hết-hạn-hoá vai phải nằm TRONG CÙNG transaction với việc đặt `deletedAt`. Mock dưới
 *    đây cố ý CHỈ gắn `userOrgRole.updateMany` lên đối tượng `tx`; client ngoài transaction
 *    KHÔNG có method đó. Ai chuyển bước này ra ngoài `$transaction` sẽ ăn TypeError chứ
 *    không lặng lẽ xanh.
 * 2. Vai bị `EXPIRED`, KHÔNG bị xoá cứng — còn vết để sau này truy được ai từng giữ vai gì.
 * 3. Guard ràng buộc phải đếm bằng client BYPASS scope. `Lead`/`Enrollment`/`Class`/
 *    `Student` đều ∈ `SCOPED_MODELS` (lib/db-scope.ts:11-50) ⇒ đếm bằng `sdb` thường thì
 *    người xoá đứng ở cơ sở A KHÔNG thấy lead của cơ sở B, guard cho qua, mồ côi vẫn còn.
 *    Mock tách hẳn hai client: client thường KHÔNG có `lead.count`.
 * 4. Vô hiệu hoá (`toggleUserActiveAction`) TUYỆT ĐỐI không được hết-hạn-hoá vai. Đường
 *    BẬT LẠI của chính hàm đó không có bước phục hồi vai nào, nên hết hạn ở nhánh DISABLE
 *    = bật lại xong người đó rỗng quyền — tái diễn y hệt sự cố 07/08/2026 mô tả ở
 *    `lib/auth/org-role-sync.ts:3-6`. Điều này pin CẢ HAI đường hết-hạn-hoá: `updateMany`
 *    viết tay VÀ `reconcileUserOrgRoles` (cỗ máy chính thống, tự gọi `updateMany` +
 *    `logRbacAudit` BÊN TRONG nó — org-role-sync.ts:307-336). Mock rỗng của hàm đó nuốt
 *    trọn hai assert phủ định kia, nên phải assert thẳng vào chính nó.
 * 5. Rào ràng buộc chỉ được chặn bằng ghi danh CÒN SỐNG — đúng tập trạng thái mà màn
 *    /admin/classes/<id>/students nạp, vì đó là màn duy nhất gỡ được `saleId`.
 * 6. Câu chặn phải chỉ vào màn THẬT SỰ sửa được, và nêu tên lớp: không màn nào liệt kê
 *    "ghi danh do sale X phụ trách", nên thiếu tên lớp là biết số mà không biết đi đâu.
 * 7. Nhánh fail-closed của bộ đếm (một truy vấn hỏng ⇒ KHÔNG xoá) phải có test. Đổi nó
 *    thành fail-open là mở lại đúng LỖ 2 mà không test nào đỏ.
 *
 * Kiểm bằng "DB có bị ghi không", không bằng chuỗi thông báo: một action trả `{ ok:false }`
 * sau khi đã `update` vẫn là một tài khoản đã bị xoá.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type UpdateManyArgs = {
  where: { userId: string; status: string };
  data: { status: string; effectiveTo: Date };
};

const h = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  // ─ client THƯỜNG (bị scope) — cố ý KHÔNG có lead/enrollment/class/student
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  transactionRan: vi.fn(),
  // ─ client BYPASS — chỉ dùng để đếm ràng buộc (+ liệt kê lớp cho câu chặn)
  leadCount: vi.fn(),
  enrollmentCount: vi.fn(),
  enrollmentFindMany: vi.fn(),
  classCount: vi.fn(),
  studentCount: vi.fn(),
  // ─ chỉ tồn tại BÊN TRONG transaction
  txUserUpdate: vi.fn(),
  txOrgRoleUpdateMany: vi.fn(),
  // ─ phụ trợ
  logUserAudit: vi.fn(),
  logRbacAudit: vi.fn(),
  reassignOpenLeads: vi.fn(),
  syncCenterClassConversations: vi.fn(),
  // Đường hết-hạn-hoá vai THỨ HAI — xem điều 4 ở đầu file.
  reconcileUserOrgRoles: vi.fn(),
}));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: "admin-1", name: "Quản trị", centerId: null } }),
}));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/auth/actor", () => ({
  resolveActor: async (userId: string) => ({ userId }),
}));

// Hai client TÁCH HẲN nhau — xem điều 1 và điều 3 ở đầu file.
vi.mock("@/lib/db-scope", () => ({
  scopedDb: (_actor: unknown, opts?: { bypass?: boolean }) =>
    opts?.bypass
      ? {
          lead: { count: h.leadCount },
          enrollment: { count: h.enrollmentCount, findMany: h.enrollmentFindMany },
          class: { count: h.classCount },
          student: { count: h.studentCount },
        }
      : {
          user: { findUnique: h.userFindUnique, count: h.userCount },
          $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
            h.transactionRan();
            return fn({
              user: { update: h.txUserUpdate },
              userOrgRole: { updateMany: h.txOrgRoleUpdateMany },
            });
          },
        },
}));

vi.mock("@/lib/audit/log", () => ({
  logUserAudit: h.logUserAudit,
  logRbacAudit: h.logRbacAudit,
  detectChangedFields: () => [],
  getAuditActor: () => ({ actorId: "admin-1", actorName: "Quản trị" }),
}));
vi.mock("@/lib/lead/assign", () => ({ reassignOpenLeads: h.reassignOpenLeads }));
vi.mock("@/lib/email/staff-account", () => ({ notifyStaffAccountGranted: vi.fn() }));
vi.mock("@/lib/org/org-service", () => ({ centerIdForOrgUnit: async () => null }));
vi.mock("@/lib/hr/sync-employee-unit", () => ({ keoHoSoTheoTaiKhoan: vi.fn() }));
vi.mock("@/lib/chat/sync-membership", () => ({
  syncCenterClassConversations: h.syncCenterClassConversations,
}));
vi.mock("@/lib/auth/org-role-sync", () => ({
  // Phải là mock CHIA SẺ (qua `h`), không phải `vi.fn()` inline: nó là đường hết-hạn-hoá
  // vai thứ hai và mục (d) cần assert thẳng rằng nhánh DISABLE không gọi nó.
  reconcileUserOrgRoles: h.reconcileUserOrgRoles,
  OrgRoleSyncError: class OrgRoleSyncError extends Error {},
}));

import { deleteUserAction, toggleUserActiveAction } from "./_actions";

/** Tài khoản mục tiêu như `deleteUserAction` đọc được (đã vô hiệu hoá — điều kiện để hiện nút Xoá). */
function target(over: Partial<{ isActive: boolean; role: string; roles: string[] }> = {}) {
  h.userFindUnique.mockResolvedValue({
    isActive: false,
    email: "cu@satarobo.vn",
    role: "SALES_CSM",
    roles: ["SALES_CSM"],
    centerId: "cs-1",
    ...over,
  });
}

/** Bộ đếm ràng buộc: mặc định SẠCH (không còn gì đang phụ trách). */
function rangBuoc(
  over: Partial<{
    lead: number;
    enrollment: number;
    lop: number;
    con: number;
    /** Lớp đang giữ `Enrollment.saleId` — nguyên liệu cho phần "(lớp: …)" của câu chặn. */
    lopGhiDanh: { classId: string; class: { name: string } }[];
  }> = {},
) {
  h.leadCount.mockResolvedValue(over.lead ?? 0);
  h.enrollmentCount.mockResolvedValue(over.enrollment ?? 0);
  h.enrollmentFindMany.mockResolvedValue(over.lopGhiDanh ?? []);
  h.classCount.mockResolvedValue(over.lop ?? 0);
  h.studentCount.mockResolvedValue(over.con ?? 0);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.checkPermission.mockResolvedValue(true);
  h.userCount.mockResolvedValue(5); // còn SUPER_ADMIN khác → guard "cuối cùng" không vướng
  h.txUserUpdate.mockResolvedValue({ id: "u-2" });
  h.txOrgRoleUpdateMany.mockResolvedValue({ count: 0 });
  h.logUserAudit.mockResolvedValue(undefined);
  h.logRbacAudit.mockResolvedValue(undefined);
  h.reassignOpenLeads.mockResolvedValue(undefined);
  h.syncCenterClassConversations.mockResolvedValue(undefined);
  h.reconcileUserOrgRoles.mockResolvedValue(undefined);
  target();
  rangBuoc();
});

// ─── (a) Xoá tài khoản sạch ⇒ vai bị EXPIRED trong CÙNG transaction ─────────

describe("(a) xoá tài khoản sạch → hết-hạn-hoá mọi UserOrgRole ACTIVE", () => {
  it("EXPIRED + effectiveTo, KHÔNG xoá cứng, và nằm trong cùng tx với deletedAt", async () => {
    h.txOrgRoleUpdateMany.mockResolvedValue({ count: 3 });

    const res = await deleteUserAction("u-2");

    expect(res).toEqual({ ok: true });
    // Đúng MỘT transaction — không tách deletedAt và thu hồi vai ra hai lần ghi.
    expect(h.transactionRan).toHaveBeenCalledTimes(1);
    expect(h.txUserUpdate).toHaveBeenCalledTimes(1);
    // `updateMany` chỉ tồn tại trên `tx` ⇒ gọi được nghĩa là ĐANG ở trong transaction.
    expect(h.txOrgRoleUpdateMany).toHaveBeenCalledTimes(1);

    const [args] = h.txOrgRoleUpdateMany.mock.calls[0] as [UpdateManyArgs];
    expect(args.where).toMatchObject({ userId: "u-2", status: "ACTIVE" });
    expect(args.data.status).toBe("EXPIRED");
    expect(args.data.effectiveTo).toBeInstanceOf(Date);

    // deletedAt phải được đặt trong cùng lượt ghi đó.
    const [userArgs] = h.txUserUpdate.mock.calls[0] as [
      { where: { id: string }; data: { deletedAt: Date; isActive: boolean } },
    ];
    expect(userArgs.where.id).toBe("u-2");
    expect(userArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(userArgs.data.isActive).toBe(false);

    // Đặt deletedAt TRƯỚC rồi mới thu hồi vai (thứ tự ổn định, dễ đọc lại audit).
    expect(h.txUserUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      h.txOrgRoleUpdateMany.mock.invocationCallOrder[0],
    );
  });

  it("có dòng bị thu hồi → ghi RbacAuditLog REVOKE (giữ vết ai từng giữ vai gì)", async () => {
    h.txOrgRoleUpdateMany.mockResolvedValue({ count: 2 });

    await deleteUserAction("u-2");

    expect(h.logRbacAudit).toHaveBeenCalledTimes(1);
    const [audit] = h.logRbacAudit.mock.calls[0] as [
      { entity: string; action: string; entityId: string; reason: string },
    ];
    expect(audit.entity).toBe("ASSIGNMENT");
    expect(audit.action).toBe("REVOKE");
    expect(audit.entityId).toContain("u-2");
    expect(audit.reason.length).toBeGreaterThan(0);
  });

  it("không có dòng nào ACTIVE → KHÔNG ghi audit REVOKE cho việc đã không xảy ra", async () => {
    h.txOrgRoleUpdateMany.mockResolvedValue({ count: 0 });

    const res = await deleteUserAction("u-2");

    expect(res).toEqual({ ok: true });
    expect(h.logRbacAudit).not.toHaveBeenCalled();
  });
});

// ─── (b) Còn lead ⇒ TỪ CHỐI, không đặt deletedAt ────────────────────────────

describe("(b) còn Lead.assignedToId → từ chối, KHÔNG đặt deletedAt", () => {
  it("từ chối và không mở transaction nào", async () => {
    rangBuoc({ lead: 4 });

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(h.transactionRan).not.toHaveBeenCalled();
    expect(h.txUserUpdate).not.toHaveBeenCalled();
    expect(h.txOrgRoleUpdateMany).not.toHaveBeenCalled();
  });

  it("thông điệp nói ĐÚNG số lượng và ĐÚNG việc phải làm trước", async () => {
    rangBuoc({ lead: 4 });

    const res = await deleteUserAction("u-2");

    const msg = res.error ?? "";
    expect(msg).toContain("4");
    expect(msg).toContain("khách hàng");
    // Chỉ thẳng nơi bàn giao — xoá trước là mất đường (page.tsx:51 lọc deletedAt: null).
    expect(msg).toContain("/admin/ban-giao-lead");
    expect(msg).toContain("trước khi xóa");
  });

  it("đếm lead phải BỎ QUA cách ly cơ sở (client bypass) và bỏ lead đã kết thúc", async () => {
    rangBuoc({ lead: 1 });

    await deleteUserAction("u-2");

    expect(h.leadCount).toHaveBeenCalledTimes(1);
    const [args] = h.leadCount.mock.calls[0] as [
      { where: { assignedToId: string; deletedAt: null; status: { notIn: string[] } } },
    ];
    expect(args.where.assignedToId).toBe("u-2");
    // Lead ∉ SOFT_DELETE_MODELS (lib/soft-delete.ts:12-17) → phải TỰ lọc.
    expect(args.where.deletedAt).toBeNull();
    // LOST/DUPLICATE là rác, không phải việc đang sống. ENROLLED thì CÓ tính:
    // chính nhóm đó mang Enrollment.saleId + kênh chat Sale↔PH.
    expect(args.where.status.notIn).toEqual(expect.arrayContaining(["LOST", "DUPLICATE"]));
    expect(args.where.status.notIn).not.toContain("ENROLLED");
  });
});

// ─── (c) Còn Enrollment.saleId ⇒ TỪ CHỐI ────────────────────────────────────

describe("(c) còn Enrollment.saleId → từ chối", () => {
  it("từ chối, không đặt deletedAt, thông điệp chỉ đường bàn giao", async () => {
    rangBuoc({ enrollment: 2 });

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(h.txUserUpdate).not.toHaveBeenCalled();
    const msg = res.error ?? "";
    expect(msg).toContain("2");
    expect(msg).toContain("ghi danh");
    expect(msg).toContain("/admin/ban-giao-lead");
  });

  it("gộp nhiều loại ràng buộc vào MỘT thông điệp — không bắt sửa từng vòng", async () => {
    rangBuoc({ lead: 3, enrollment: 2, lop: 1, con: 5 });

    const res = await deleteUserAction("u-2");

    const msg = res.error ?? "";
    expect(msg).toContain("3");
    expect(msg).toContain("khách hàng");
    expect(msg).toContain("ghi danh");
    expect(msg).toContain("lớp");
    expect(msg).toContain("học viên");
    expect(msg).toContain("/admin/ban-giao-lead");
    expect(msg).toContain("/admin/classes");
    expect(msg).toContain("/admin/students");
  });

  it("còn lớp đang dạy/trợ giảng → từ chối (chỉ tính lớp CHƯA kết thúc)", async () => {
    rangBuoc({ lop: 1 });

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(h.txUserUpdate).not.toHaveBeenCalled();
    const [args] = h.classCount.mock.calls[0] as [
      { where: { status: { in: string[] }; OR: { teacherId?: string; assistantId?: string }[] } },
    ];
    expect(args.where.status.in).not.toContain("COMPLETED");
    expect(args.where.status.in).not.toContain("CANCELLED");
    expect(args.where.OR).toEqual(
      expect.arrayContaining([{ teacherId: "u-2" }, { assistantId: "u-2" }]),
    );
  });

  it("còn con đang gắn (tài khoản phụ huynh) → từ chối, chỉ đường gỡ liên kết", async () => {
    rangBuoc({ con: 2 });

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(res.error ?? "").toContain("/admin/students");
  });

  it("🔴 chỉ đếm ghi danh CÒN SỐNG — đúng tập màn HS lớp nạp được", async () => {
    // Chuyển lớp đặt ghi danh cũ = TRANSFERRED và GIỮ NGUYÊN `saleId`
    // (lib/transfer/service.ts:187-191). Màn /admin/classes/<id>/students chỉ nạp
    // CAPACITY_COUNT_STATUSES + PAUSED (page.tsx:59-63) nên 4 trạng thái kết thúc KHÔNG
    // có ô chọn sale để gỡ, và /admin/ban-giao-lead cũng không chạm tới ⇒ đếm chúng là
    // khoá cứng tài khoản, không màn hình nào mở ra được.
    rangBuoc({ enrollment: 1 });

    await deleteUserAction("u-2");

    const [args] = h.enrollmentCount.mock.calls[0] as [
      { where: { saleId: string; deletedAt: null; status: { in: string[] } } },
    ];
    expect(args.where.saleId).toBe("u-2");
    expect(args.where.deletedAt).toBeNull();
    const songSot = args.where.status.in;
    expect(songSot).toEqual(
      expect.arrayContaining(["PENDING", "CONFIRMED", "STUDYING", "ACTIVE", "PAUSED"]),
    );
    for (const daKetThuc of ["TRANSFERRED", "COMPLETED", "CANCELLED", "WITHDREW"]) {
      expect(songSot).not.toContain(daKetThuc);
    }
  });

  it("🔴 câu chặn ghi danh chỉ vào màn SỬA ĐƯỢC và nêu tên lớp", async () => {
    // `/admin/ban-giao-lead` chỉ chuyển được ghi danh còn truy về lead ĐANG gán cho chính
    // người đó (service.ts:182,356-360). Ghi danh gán tay ở màn HS lớp (`leadChildId=null`)
    // hoặc lead đã chuyển sang sale khác thì lượt bàn giao báo thành công với 0 bản ghi.
    // Không màn nào liệt kê "ghi danh do sale X phụ trách" ⇒ thiếu tên lớp là biết số mà
    // không biết mở lớp nào.
    rangBuoc({
      enrollment: 2,
      lopGhiDanh: [
        { classId: "c-1", class: { name: "Robot A1" } },
        { classId: "c-1", class: { name: "Robot A1" } },
        { classId: "c-2", class: { name: "Robot B2" } },
      ],
    });

    const res = await deleteUserAction("u-2");

    const msg = res.error ?? "";
    expect(msg).toContain("/admin/classes");
    expect(msg).toContain("Sale phụ trách");
    expect(msg).toContain("Robot A1");
    expect(msg).toContain("Robot B2");
    // Gộp trùng: một lớp hai ghi danh chỉ nêu tên một lần.
    expect(msg.match(/Robot A1/g)).toHaveLength(1);

    // Liệt kê phải dùng ĐÚNG bộ lọc đã đếm — lệch nhau là nêu tên lớp không có trong số đếm.
    const [countArgs] = h.enrollmentCount.mock.calls[0] as [{ where: unknown }];
    const [listArgs] = h.enrollmentFindMany.mock.calls[0] as [{ where: unknown }];
    expect(listArgs.where).toEqual(countArgs.where);
  });

  it("🔴 người giữ lead mà KHÔNG mang vai SALES_CSM → không chỉ về màn bàn giao", async () => {
    // Ô "Từ sale" của /admin/ban-giao-lead lọc `roles: { has: "SALES_CSM" }`
    // (ban-giao-lead/page.tsx:48-52) và không có ô nhập id tay. Import "đã đăng ký" khớp
    // sale theo TÊN nên một CENTER_MANAGER giữ được cả sổ lead
    // (lib/lead/import-registered.ts:610-634) ⇒ chỉ họ về màn đó là chỉ vào chỗ không mở
    // được: chặn xoá vĩnh viễn bằng một chỉ dẫn bất khả thi.
    target({ role: "CENTER_MANAGER", roles: ["CENTER_MANAGER"] });
    rangBuoc({ lead: 40 });

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    const msg = res.error ?? "";
    expect(msg).toContain("40");
    // Đường THẬT SỰ mở được: lọc lead theo người phụ trách rồi đổi từng lead.
    expect(msg).toContain("/admin/leads?assignedToId=u-2");
    expect(msg).toContain("SALES_CSM");
    // Câu đuôi "xoá trước là mất đường bàn giao" chỉ đúng với người màn đó CÓ hiện.
    expect(msg).not.toContain("mất luôn đường bàn giao");
  });

  it("vai chỉ nằm ở `role` chính (chưa backfill roles[]) cũng KHÔNG hiện ở màn bàn giao", async () => {
    // page.tsx:49 lọc bằng `roles: { has: ... }` — KHÔNG xét cột `role`. Dùng `hasRole()`
    // ở guard sẽ nói "vào /admin/ban-giao-lead" cho đúng nhóm màn đó không hiện.
    target({ role: "SALES_CSM", roles: [] });
    rangBuoc({ lead: 2 });

    const res = await deleteUserAction("u-2");

    expect(res.error ?? "").toContain("/admin/leads?assignedToId=u-2");
  });
});

// ─── (c-bis) Đếm hỏng ⇒ KHÔNG xoá (fail-closed) ─────────────────────────────

describe("(c-bis) một truy vấn đếm hỏng → từ chối, không ghi gì", () => {
  it("🔴 fail-closed: pool cạn/timeout khi đếm ⇒ tuyệt đối không đặt deletedAt", async () => {
    // Cho qua khi không đếm được là đúng kịch bản rào này sinh ra để chặn: tài khoản sale
    // còn nguyên lead + `Enrollment.saleId` bị `deletedAt` ⇒ rơi khỏi ô chọn của
    // /admin/ban-giao-lead (page.tsx:51) ⇒ mất đường bàn giao, phải đụng SQL tay.
    h.leadCount.mockRejectedValue(new Error("pool cạn"));

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(res.error ?? "").toContain("ràng buộc");
    expect(h.transactionRan).not.toHaveBeenCalled();
    expect(h.txUserUpdate).not.toHaveBeenCalled();
    expect(h.txOrgRoleUpdateMany).not.toHaveBeenCalled();
  });

  it("liệt kê lớp hỏng cũng fail-closed — không được xoá kèm câu chặn rút gọn", async () => {
    rangBuoc({ enrollment: 3 });
    h.enrollmentFindMany.mockRejectedValue(new Error("timeout"));

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(h.txUserUpdate).not.toHaveBeenCalled();
  });
});

// ─── (d) Vô hiệu hoá KHÔNG được đụng vai ────────────────────────────────────

describe("(d) toggleUserActiveAction giữ nguyên UserOrgRole ACTIVE", () => {
  it("DISABLE → vai KHÔNG bị hết hạn (bật lại phải còn nguyên quyền)", async () => {
    target({ isActive: true });

    const res = await toggleUserActiveAction("u-2");

    expect(res).toEqual({ ok: true });
    expect(h.txUserUpdate).toHaveBeenCalledTimes(1);
    const [args] = h.txUserUpdate.mock.calls[0] as [{ data: { isActive: boolean } }];
    expect(args.data.isActive).toBe(false);
    // 🔴 Điều quan trọng nhất của test này — và phải chặn CẢ HAI đường hết-hạn-hoá vai.
    expect(h.txOrgRoleUpdateMany).not.toHaveBeenCalled();
    expect(h.logRbacAudit).not.toHaveBeenCalled();
    // `reconcileUserOrgRoles` gọi `updateMany({status:"EXPIRED"})` + `logRbacAudit` BÊN
    // TRONG chính nó (org-role-sync.ts:307-336). Mock của nó rỗng ⇒ hai assert trên mù
    // hoàn toàn trước đường này: thêm một lời gọi "cho nhất quán" với updateUserAction là
    // mọi vai của người bị vô hiệu hoá thành EXPIRED mà test vẫn xanh.
    expect(h.reconcileUserOrgRoles).not.toHaveBeenCalled();
  });

  it("ENABLE → cũng không đụng vai", async () => {
    target({ isActive: false });

    const res = await toggleUserActiveAction("u-2");

    expect(res).toEqual({ ok: true });
    expect(h.txOrgRoleUpdateMany).not.toHaveBeenCalled();
    expect(h.reconcileUserOrgRoles).not.toHaveBeenCalled();
  });

  it("vô hiệu hoá KHÔNG bị guard ràng buộc chặn (bàn giao xong mới xoá được)", async () => {
    target({ isActive: true });
    rangBuoc({ lead: 9, enrollment: 9 });

    const res = await toggleUserActiveAction("u-2");

    expect(res).toEqual({ ok: true });
    expect(h.leadCount).not.toHaveBeenCalled();
  });
});

// ─── Rào cũ không được rơi rụng khi thêm rào mới ────────────────────────────

describe("các rào sẵn có vẫn đứng", () => {
  it("không có users:manage → redirect, không đọc/ghi gì", async () => {
    h.checkPermission.mockResolvedValue(false);

    await expect(deleteUserAction("u-2")).rejects.toBeInstanceOf(RedirectSignal);
    expect(h.txUserUpdate).not.toHaveBeenCalled();
    expect(h.leadCount).not.toHaveBeenCalled();
  });

  it("tài khoản CÒN ĐANG HOẠT ĐỘNG → chặn trước cả bước đếm ràng buộc", async () => {
    target({ isActive: true });

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("vô hiệu hóa");
    expect(h.leadCount).not.toHaveBeenCalled();
  });

  it("không tự xóa chính mình", async () => {
    const res = await deleteUserAction("admin-1");

    expect(res.ok).toBe(false);
    expect(h.txUserUpdate).not.toHaveBeenCalled();
  });

  it("🔴 SUPER_ADMIN duy nhất: guard phải CHẠY THẬT dù tài khoản đã vô hiệu hoá", async () => {
    // Trước bản vá, điều kiện guard mang thêm `&& user.isActive` — mà nhánh isActive đã
    // return ngay trên ⇒ khối này là MÃ CHẾT, không bao giờ chạy. Xoá SUPER_ADMIN cuối
    // cùng (đã disable) là khoá cứng hệ thống: không còn ai bật lại được.
    target({ role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] });
    h.userCount.mockResolvedValue(0); // không còn SUPER_ADMIN active nào khác

    const res = await deleteUserAction("u-2");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("SUPER_ADMIN");
    expect(h.txUserUpdate).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN nhưng còn người khác → vẫn xoá được", async () => {
    target({ role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] });
    h.userCount.mockResolvedValue(2);

    const res = await deleteUserAction("u-2");

    expect(res).toEqual({ ok: true });
  });
});
