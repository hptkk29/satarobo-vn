// lib/auth/org-role-sync.test.ts — SL-01: nhánh THU HỒI chỉ được đụng dòng do MÁY sinh.
//
// VÌ SAO CÓ FILE NÀY (docs/prd/A-nen-tang.md §10.1 · OQ-5 chốt 24/08/2026): trên prod ĐANG
// có cấu hình QLCS đa cơ sở gán tay. Hôm nay `reconcileUserOrgRoles` phân biệt "máy sinh"
// với "gán tay" bằng cách SUY LẠI `prevPlan` từ MỘT đơn vị neo — đó là SUY LUẬN, không phải
// bằng chứng. Khi đơn vị neo CŨ trùng đúng cơ sở được gán tay, dòng gán tay rơi vào
// `prevPlan` và bị `EXPIRED` bởi một thao tác KHÔNG nhằm thu hồi quyền (chỉ sửa ô "Đơn vị"
// ở `app/(admin)/admin/users/_actions.ts:363-380` hoặc `nhan-su/actions.ts:377`).
// Từ SL-01, quyền thu hồi được quyết bằng cột `UserOrgRole.source`, không bằng suy luận.
//
// Bất biến bị khoá ở đây (docs/plan/test-coverage.md:221 — "L-A11" nhánh SL-01, và A-12 :309):
//   1. Dòng `MANUAL` KHÔNG BAO GIỜ bị reconcile `EXPIRED`, kể cả khi rơi đúng vào `prevPlan`.
//   2. Dòng `AUTO` không còn trong kế hoạch mới thì VẪN bị thu hồi (không được vá quá tay).
//   3. Dòng cũ `source = null` (trước migration) được đối xử như `AUTO` — tương thích ngược.
//
// TEST THUẦN với client giả: thứ cần chứng minh là LUẬT (dòng nào máy được đụng), không phải
// SQL. Client giả TÔN TRỌNG `select` — quên `source: true` là test đỏ, đúng như Prisma thật.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/audit/log", () => ({
  logRbacAudit: vi.fn(async () => undefined),
}));

import {
  reconcileUserOrgRoles,
  type ReconcileInput,
  type RoleSnapshot,
} from "@/lib/auth/org-role-sync";
import { logRbacAudit } from "@/lib/audit/log";

// ─── Bối cảnh: cây HO → REGION → CENTER, hai cơ sở KHÁC VÙNG (OQ-8) ────────────
const HO = { id: "org-ho", type: "HO" };
// CS1 thuộc vùng Đà Nẵng, CS2 thuộc vùng thứ hai — reconcile không đọc REGION, nhưng ca
// thật mà A-01 phải đỡ là "một QLCS giữ 2 cơ sở khác vùng", nên dữ liệu test dựng đúng ca đó.
const CS1 = { id: "org-cs1", type: "CENTER" };
const CS2 = { id: "org-cs2", type: "CENTER" };
const CS3 = { id: "org-cs3", type: "CENTER" };
const ORGS = [HO, CS1, CS2, CS3];

/** RoleDef thật trong seed — chỉ cần đủ tập bảng ánh xạ có thể chạm tới. */
const ROLE_DEFS = [
  { id: "rd-sa", code: "SUPER_ADMIN", isActive: true },
  { id: "rd-cm", code: "CENTER_MANAGER", isActive: true },
  { id: "rd-csm", code: "CENTER_SALES_CSM", isActive: true },
  { id: "rd-teacher", code: "TEACHER", isActive: true },
  { id: "rd-ho-acc", code: "HO_ACCOUNTANT", isActive: true },
  { id: "rd-ho-mkt", code: "HO_MARKETING", isActive: true },
  { id: "rd-ho-hr", code: "HO_HR", isActive: true },
  { id: "rd-training", code: "TRAINING", isActive: true },
  { id: "rd-center-acc", code: "CENTER_ACCOUNTANT", isActive: true },
  { id: "rd-center-hr", code: "CENTER_HR", isActive: true },
];

const USER = "u-quan-ly";

type Row = {
  userId: string;
  orgUnitId: string;
  roleId: string;
  status: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  grantedById: string;
  /** null = dòng cũ chưa phân loại (trước migration SL-01). */
  source: string | null;
};

const HOM_QUA = new Date(Date.now() - 24 * 3600 * 1000);
const NAM_NGOAI = new Date(Date.now() - 365 * 24 * 3600 * 1000);

function row(over: Partial<Row> & Pick<Row, "orgUnitId" | "roleId">): Row {
  return {
    userId: USER,
    status: "ACTIVE",
    effectiveFrom: HOM_QUA,
    effectiveTo: null,
    grantedById: "u-super-admin",
    source: null,
    ...over,
  };
}

// ─── Client giả ────────────────────────────────────────────────────────────────
type Where = Record<string, unknown>;
type CompositeKey = { userId: string; orgUnitId: string; roleId: string };

/**
 * Khớp `where` phẳng + `OR`. CỐ Ý KHÔNG hỗ trợ bộ lọc dạng object (`{ not: ... }`):
 * ngữ nghĩa NULL của `not` trong Prisma phụ thuộc phiên bản, mà đúng chỗ này NULL là ca
 * phải đúng (bất biến 3). Đoán bừa trong client giả = test nói dối. Ai cần shape khác thì
 * mở rộng ở đây có chủ đích, đừng để nó im lặng khớp sai.
 */
function matches(r: Row, where: Where): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (key === "OR") {
      const nhanh = val as Where[];
      if (!nhanh.some((b) => matches(r, b))) return false;
      continue;
    }
    if (key === "AND") {
      const nhanh = val as Where[];
      if (!nhanh.every((b) => matches(r, b))) return false;
      continue;
    }
    if (val !== null && typeof val === "object") {
      throw new Error(
        `[client giả] Bộ lọc dạng object cho "${key}" chưa được hỗ trợ. ` +
          `Với cột nullable như "source", hãy viết OR: [{ source: "AUTO" }, { source: null }] ` +
          `thay vì { not: "MANUAL" } — ngữ nghĩa NULL của "not" phụ thuộc phiên bản Prisma.`,
      );
    }
    if ((r as unknown as Record<string, unknown>)[key] !== val) return false;
  }
  return true;
}

function fakeTx(rows: Row[]) {
  const upsertCalls: {
    where: { userId_orgUnitId_roleId: CompositeKey };
    update: Partial<Row>;
    create: Partial<Row>;
  }[] = [];
  const updateManyCalls: { where: Where; data: Partial<Row> }[] = [];
  const updateCalls: {
    where: { userId_orgUnitId_roleId: CompositeKey };
    data: Partial<Row>;
  }[] = [];

  const timKey = (k: CompositeKey) =>
    rows.find(
      (r) =>
        r.userId === k.userId &&
        r.orgUnitId === k.orgUnitId &&
        r.roleId === k.roleId,
    );

  const tx = {
    orgUnit: {
      findMany: async () => ORGS.map((o) => ({ ...o })),
    },
    roleDef: {
      findMany: async (args: { where: { code: { in: string[] } } }) =>
        ROLE_DEFS.filter((r) => args.where.code.in.includes(r.code)).map((r) => ({
          ...r,
        })),
    },
    userOrgRole: {
      findMany: async (args: {
        where: { userId: string };
        select?: Record<string, boolean>;
      }) =>
        rows
          .filter((r) => r.userId === args.where.userId)
          .map((r) => {
            if (!args.select) return { ...r };
            // Tôn trọng `select` như Prisma thật: cột không xin thì KHÔNG có trong kết quả.
            const out: Record<string, unknown> = {};
            for (const [k, bat] of Object.entries(args.select)) {
              if (bat) out[k] = (r as unknown as Record<string, unknown>)[k];
            }
            return out;
          }),
      upsert: async (args: {
        where: { userId_orgUnitId_roleId: CompositeKey };
        update: Partial<Row>;
        create: Partial<Row>;
      }) => {
        upsertCalls.push(args);
        const co = timKey(args.where.userId_orgUnitId_roleId);
        if (co) {
          Object.assign(co, args.update);
          return { ...co };
        }
        const moi = row({
          ...(args.create as Pick<Row, "orgUnitId" | "roleId">),
          // Mô phỏng DEFAULT của DB sau migration SL-01 — code KHÔNG được dựa vào nó
          // (xem ca "dòng máy tự sinh mang nhãn AUTO" khẳng định trên payload).
          source: args.create.source ?? "AUTO",
        });
        rows.push(moi);
        return { ...moi };
      },
      update: async (args: {
        where: { userId_orgUnitId_roleId: CompositeKey };
        data: Partial<Row>;
      }) => {
        updateCalls.push(args);
        const co = timKey(args.where.userId_orgUnitId_roleId);
        if (!co) throw new Error("[client giả] update: không tìm thấy dòng");
        Object.assign(co, args.data);
        return { ...co };
      },
      updateMany: async (args: { where: Where; data: Partial<Row> }) => {
        updateManyCalls.push(args);
        const trung = rows.filter((r) => matches(r, args.where));
        trung.forEach((r) => Object.assign(r, args.data));
        return { count: trung.length };
      },
    },
  };

  return {
    tx: tx as unknown as ReconcileInput["tx"],
    rows,
    upsertCalls,
    updateCalls,
    updateManyCalls,
  };
}

function snap(roles: Role[], orgUnitId: string | null): RoleSnapshot {
  return { roles, orgUnitId };
}

async function chay(
  rows: Row[],
  previous: RoleSnapshot,
  next: RoleSnapshot,
) {
  const fake = fakeTx(rows);
  const ketQua = await reconcileUserOrgRoles({
    tx: fake.tx,
    userId: USER,
    previous,
    next,
    actorId: "u-super-admin",
    actorName: "Super Admin",
    reason: "Đổi đơn vị làm việc",
  });
  return { ...fake, ketQua };
}

const timDong = (rows: Row[], orgUnitId: string, roleId: string) =>
  rows.find((r) => r.orgUnitId === orgUnitId && r.roleId === roleId);

const revokeAudits = () =>
  vi
    .mocked(logRbacAudit)
    .mock.calls.filter((c) => c[0].action === "REVOKE")
    .map((c) => c[0]);

beforeEach(() => vi.clearAllMocks());

// ───────────────────────────────────────────────────────────────────────────────
describe("SL-01 — nhánh thu hồi của reconcileUserOrgRoles", () => {
  it("[SL-01] dòng MANUAL còn hiệu lực KHÔNG bị thu hồi, dù rơi đúng vào prevPlan", async () => {
    // Ca va chạm mà §6.1 mô tả: đơn vị neo CŨ (CS1) trùng đúng cơ sở được gán tay.
    const manual = row({ orgUnitId: CS1.id, roleId: "rd-cm", source: "MANUAL" });
    const { rows, ketQua, updateManyCalls } = await chay(
      [manual],
      snap(["CENTER_MANAGER"], CS1.id),
      snap(["CENTER_MANAGER"], CS3.id),
    );

    const sau = timDong(rows, CS1.id, "rd-cm");
    expect(sau?.status).toBe("ACTIVE");
    expect(sau?.effectiveTo).toBeNull();
    expect(sau?.source).toBe("MANUAL");
    expect(ketQua.revoked).toEqual([]);
    // Không được ghi audit REVOKE cho việc đã không xảy ra.
    expect(revokeAudits()).toHaveLength(0);
    // TẦNG 1 (bộ nhớ): chặn TRƯỚC khi chạm DB — không phát câu lệnh ghi nào cả.
    // Không có assert này thì việc quên `source: true` trong `select` sẽ XANH: bộ lọc ở
    // tầng DB vẫn cứu đúng kết quả, còn guard bộ nhớ âm thầm thành mã chết.
    expect(updateManyCalls).toHaveLength(0);
    // Vai theo đơn vị neo mới vẫn phải được cấp — vá không được làm liệt đường gán.
    expect(ketQua.assigned).toContain("CENTER_MANAGER");
    expect(timDong(rows, CS3.id, "rd-cm")?.status).toBe("ACTIVE");
  });

  it("[SL-01] dòng AUTO không còn trong kế hoạch mới thì VẪN bị thu hồi", async () => {
    // Vế đối trọng: vá quá tay (không thu hồi gì nữa) là tái diễn lỗi "đổi vai xong vẫn
    // giữ quyền cũ" — nguy hiểm y hệt lỗ hổng đang vá, chỉ ngược chiều.
    const auto = row({ orgUnitId: CS1.id, roleId: "rd-cm", source: "AUTO" });
    const { rows, ketQua } = await chay(
      [auto],
      snap(["CENTER_MANAGER"], CS1.id),
      snap(["CENTER_MANAGER"], CS3.id),
    );

    const sau = timDong(rows, CS1.id, "rd-cm");
    expect(sau?.status).toBe("EXPIRED");
    expect(sau?.effectiveTo).toBeInstanceOf(Date);
    expect(ketQua.revoked).toEqual(["CENTER_MANAGER"]);
    expect(revokeAudits()).toHaveLength(1);
  });

  it("[SL-01] điều kiện nguồn gốc được ép XUỐNG TẦNG DB, không chỉ trong bộ nhớ", async () => {
    // TẦNG 2: `where` của câu thu hồi phải tự mang điều kiện nguồn gốc. Nếu chỉ chặn trong
    // bộ nhớ thì một đường ghi đồng thời (người đổi dòng sang MANUAL giữa lúc đọc và lúc
    // ghi) sẽ lọt. Khẳng định trên hình dạng `where` là có chủ đích: đây đúng là thứ phải
    // đóng băng — mất nó là mất lớp phòng thủ, mà kết quả test khác vẫn xanh.
    const auto = row({ orgUnitId: CS1.id, roleId: "rd-cm", source: "AUTO" });
    const { updateManyCalls } = await chay(
      [auto],
      snap(["CENTER_MANAGER"], CS1.id),
      snap(["CENTER_MANAGER"], CS3.id),
    );

    expect(updateManyCalls).toHaveLength(1);
    const where = updateManyCalls[0].where;
    expect(where.userId).toBe(USER);
    expect(where.orgUnitId).toBe(CS1.id);
    expect(where.roleId).toBe("rd-cm");
    // Phải phủ CẢ "AUTO" LẪN null — xem ca tương thích ngược ngay dưới.
    expect(where.OR).toEqual([{ source: "AUTO" }, { source: null }]);
  });

  it("[SL-01] dòng cũ source = null được đối xử như AUTO (tương thích ngược)", async () => {
    // Dòng sinh ra TRƯỚC migration SL-01. Nếu bản vá lọc cứng `source = 'AUTO'` ở tầng DB
    // thì dòng null trượt khỏi bộ lọc và không bao giờ thu hồi được — quyền kẹt vĩnh viễn.
    const cu = row({ orgUnitId: CS1.id, roleId: "rd-cm", source: null });
    const { rows, ketQua } = await chay(
      [cu],
      snap(["CENTER_MANAGER"], CS1.id),
      snap(["CENTER_MANAGER"], CS3.id),
    );

    const sau = timDong(rows, CS1.id, "rd-cm");
    expect(sau?.status).toBe("EXPIRED");
    expect(ketQua.revoked).toEqual(["CENTER_MANAGER"]);
  });

  it("[A-12] đổi ô \"Đơn vị\" của QLCS 2 cơ sở khác vùng — không dòng nào của anh ấy bị mất", async () => {
    // Ca thật của OQ-5 (anh Phúc, vừa QLCS đa cơ sở vừa SUPER_ADMIN). `User.orgUnitId` chỉ
    // giữ được MỘT đơn vị, nên cấu hình đa cơ sở phải gán tay. Ở đây đơn vị neo CŨ là CS2 —
    // TRÙNG ĐÚNG cơ sở được gán tay, đúng ca va chạm §6.1. CS1 (vùng khác) là dấu vết lần
    // neo trước, vẫn còn hiệu lực.
    //
    // ⚠️ CS1 sống sót KHÔNG phải nhờ SL-01 mà vì nó nằm ngoài `prevPlan` — máy chỉ suy được
    // MỘT đơn vị neo. Ghi ra để không ai nhầm giới hạn thiết kế thành lớp bảo vệ.
    const manualCS2 = row({
      orgUnitId: CS2.id,
      roleId: "rd-cm",
      source: "MANUAL",
    });
    const autoCS1 = row({ orgUnitId: CS1.id, roleId: "rd-cm", source: "AUTO" });
    const { rows, ketQua } = await chay(
      [manualCS2, autoCS1],
      snap(["CENTER_MANAGER"], CS2.id),
      snap(["CENTER_MANAGER"], CS3.id),
    );

    expect(timDong(rows, CS2.id, "rd-cm")?.status).toBe("ACTIVE");
    expect(timDong(rows, CS2.id, "rd-cm")?.effectiveTo).toBeNull();
    expect(timDong(rows, CS1.id, "rd-cm")?.status).toBe("ACTIVE");
    expect(timDong(rows, CS3.id, "rd-cm")?.status).toBe("ACTIVE");
    expect(ketQua.revoked).toEqual([]);
    expect(revokeAudits()).toHaveLength(0);
  });

  it("[SL-01] dòng MANUAL còn hiệu lực nằm trong kế hoạch mới thì reconcile không đụng tới", async () => {
    // Nhánh GÁN đã bỏ qua mọi dòng CÒN HIỆU LỰC (mọi source) — bất biến này giữ cho việc
    // dán nhãn AUTO ở nhánh gán không bao giờ chiếm được một dòng MANUAL đang sống.
    const manual = row({ orgUnitId: CS1.id, roleId: "rd-cm", source: "MANUAL" });
    const { rows, ketQua, upsertCalls, updateCalls, updateManyCalls } =
      await chay(
        [manual],
        snap(["CENTER_MANAGER"], CS1.id),
        snap(["CENTER_MANAGER"], CS1.id),
      );

    expect(upsertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(updateManyCalls).toHaveLength(0);
    expect(timDong(rows, CS1.id, "rd-cm")?.source).toBe("MANUAL");
    expect(ketQua).toEqual({ assigned: [], revoked: [] });
  });

  it("[SL-01] dòng máy tự sinh mang nhãn AUTO tường minh (không dựa vào DEFAULT của DB)", async () => {
    // Máy phải NHẬN trách nhiệm cho dòng nó tạo, nếu không lần đổi vai sau nó tự khoá tay
    // mình: dòng do máy cấp mà máy không gỡ được = quyền kẹt vĩnh viễn.
    const { upsertCalls, rows } = await chay(
      [],
      snap([], null),
      snap(["CENTER_MANAGER"], CS1.id),
    );

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].create.source).toBe("AUTO");
    expect(timDong(rows, CS1.id, "rd-cm")?.source).toBe("AUTO");
  });

  it("[SL-01] dòng MANUAL ĐÃ HẾT HIỆU LỰC mà kế hoạch mới cần lại ⇒ máy kích hoạt lại và nhận nhãn AUTO", async () => {
    // ĐÁNH ĐỔI CÓ CHỦ ĐÍCH (ghi ở documentation/, xem chú thích trong org-role-sync.ts):
    // khoá ghép (userId, orgUnitId, roleId) không cho tồn tại hai dòng cùng key, nên máy
    // BUỘC phải dùng lại đúng dòng đó. Giữ nhãn MANUAL thì dòng do máy cấp sẽ không bao giờ
    // gỡ được; đổi nhãn AUTO thì máy chịu trách nhiệm trọn vòng đời. Dòng MANUAL còn hiệu
    // lực vẫn tuyệt đối an toàn (ca ngay phía trên) — chỉ dòng đã chết mới bị dùng lại.
    const chet = row({
      orgUnitId: CS1.id,
      roleId: "rd-cm",
      source: "MANUAL",
      status: "EXPIRED",
      effectiveFrom: NAM_NGOAI,
      effectiveTo: HOM_QUA,
    });
    const { rows, upsertCalls, ketQua } = await chay(
      [chet],
      snap([], null),
      snap(["CENTER_MANAGER"], CS1.id),
    );

    expect(upsertCalls[0].update.source).toBe("AUTO");
    const sau = timDong(rows, CS1.id, "rd-cm");
    expect(sau?.status).toBe("ACTIVE");
    expect(sau?.source).toBe("AUTO");
    expect(ketQua.assigned).toEqual(["CENTER_MANAGER"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
/**
 * A-01-3 (bất biến `L-A5`) — ĐƯỜNG GHI THỨ HAI.
 *
 * `lib/auth/rbac-service.test.ts` phủ 6 ca cho đường GÁN TAY (`assignUserOrgRole`). Nhưng
 * luật "không neo `CENTER_MANAGER` ở HO/ROOT" có hai đường ghi, và đường thứ hai — chính
 * hàm này, chạy mỗi khi admin sửa `roles[]` hoặc ô "Đơn vị" — trước 25/08/2026 KHÔNG có
 * rào nào: `planOrgRoleTargets` ánh xạ `CENTER_MANAGER → { org: "CENTER" }` sang thẳng
 * `anchorOrgUnitId`, mà picker đơn vị ở /admin/users/[id]/edit CÓ liệt kê Hội sở.
 *
 * Xoá dòng rào ở `rbac-service.ts` làm 3 test đỏ; trước bộ này, xoá rào ở đường vòng KHÔNG
 * làm đỏ test nào.
 */
describe("A-01-3 (L-A5) — reconcile không được neo CENTER_MANAGER ở HO/ROOT", () => {
  it("đổi ô \"Đơn vị\" của QLCS sang Hội sở ⇒ ném lỗi, KHÔNG sinh dòng vai nào", async () => {
    const fake = fakeTx([]);

    await expect(
      reconcileUserOrgRoles({
        tx: fake.tx,
        userId: USER,
        previous: snap(["CENTER_MANAGER"], CS1.id),
        next: snap(["CENTER_MANAGER"], HO.id),
        actorId: "u-super-admin",
        actorName: "Super Admin",
        reason: "Chuyển về Hội sở",
      }),
    ).rejects.toThrow(/CENTER_MANAGER/);

    // Ném TRƯỚC mọi câu ghi: không upsert, không updateMany, không audit.
    expect(fake.upsertCalls).toHaveLength(0);
    expect(fake.updateManyCalls).toHaveLength(0);
    expect(vi.mocked(logRbacAudit)).not.toHaveBeenCalled();
  });

  it("thông điệp nói rõ hậu quả (thấy mọi cơ sở) + việc cần làm", async () => {
    const fake = fakeTx([]);
    let loi: unknown;
    try {
      await reconcileUserOrgRoles({
        tx: fake.tx,
        userId: USER,
        previous: snap([], null),
        next: snap(["CENTER_MANAGER"], HO.id),
        actorId: null,
        actorName: "Admin",
        reason: "Tạo tài khoản",
      });
    } catch (e) {
      loi = e;
    }

    expect(loi).toBeInstanceOf(Error);
    const message = loi instanceof Error ? loi.message : "";
    expect(message).toMatch(/mọi cơ sở/i);
    expect(message).toMatch(/Đơn vị/);
  });

  it("QLCS neo đúng cơ sở ⇒ vẫn chạy bình thường (rào không bắt nhầm đường đúng)", async () => {
    const { rows, ketQua } = await chay(
      [],
      snap([], null),
      snap(["CENTER_MANAGER"], CS1.id),
    );

    expect(ketQua.assigned).toEqual(["CENTER_MANAGER"]);
    expect(timDong(rows, CS1.id, "rd-cm")?.status).toBe("ACTIVE");
  });

  it("vai KHÁC tại Hội sở ⇒ vẫn được (§6.10 cố ý KHÔNG cấm neo tại HO nói chung)", async () => {
    // HR không suy được cơ sở → HO_HR tại HO. Đây là việc thường ngày, không phải lỗ hổng.
    const { rows, ketQua } = await chay([], snap([], null), snap(["HR"], HO.id));

    expect(ketQua.assigned).toEqual(["HO_HR"]);
    expect(timDong(rows, HO.id, "rd-ho-hr")?.status).toBe("ACTIVE");
  });

  it("dòng CENTER_MANAGER@HO có sẵn từ trước VẪN thu hồi được (rào chỉ soi kế hoạch MỚI)", async () => {
    // Dữ liệu bẩn đã tồn tại phải dọn được — rào mà chặn cả đường dọn thì nó khoá luôn
    // cách duy nhất để sửa.
    const ban = row({ orgUnitId: HO.id, roleId: "rd-cm", source: "AUTO" });
    const { rows, ketQua } = await chay(
      [ban],
      snap(["CENTER_MANAGER"], HO.id),
      snap(["CENTER_MANAGER"], CS1.id),
    );

    expect(timDong(rows, HO.id, "rd-cm")?.status).toBe("EXPIRED");
    expect(ketQua.revoked).toEqual(["CENTER_MANAGER"]);
  });
});
