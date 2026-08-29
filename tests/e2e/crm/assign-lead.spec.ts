/**
 * CHIA LEAD TỰ ĐỘNG — 8 ca chạm Postgres THẬT (bước 3 của kế hoạch bàn giao).
 *
 * Ma trận quyết định đã có test thuần (`lib/lead/assign-resolve.test.ts`, 19 ca, 5ms).
 * Tám ca dưới đây kiểm những thứ CHỈ chứng minh được khi có DB thật:
 *   · bộ đếm sống qua nhiều lần gọi và chênh lệch luôn ≤ 1;
 *   · tắt/bật một người thì lượt đi đâu;
 *   · khoá advisory có thật sự chẹn 20 request đồng thời không;
 *   · trùng SĐT có nâng đúng `lastInboundAt`/`inboundCount` mà không đụng bộ đếm không;
 *   · pool rỗng thì lead nằm ở đâu.
 *
 * Chạy: CRM_SKIP_WEBSERVER=1 npx playwright test -c playwright.crm.config.ts assign-lead
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg, seedRoles, seedUser } from "../_helpers/seed";
import { testEmail } from "../_helpers/fixtures";
import { assignUserOrgRole, type RbacActor } from "../../../lib/auth/rbac-service";
import { assignLead } from "../../../lib/lead/assign-lead";

const SA: RbacActor = { id: "seed-sa", name: "SA", role: "SUPER_ADMIN" };

async function orgId(code: string): Promise<string> {
  return (await db.orgUnit.findUnique({ where: { code }, select: { id: true } }))!.id;
}
async function centerIdOf(code: string): Promise<string> {
  return (await db.orgUnit.findUnique({ where: { code }, select: { centerId: true } }))!.centerId!;
}
async function roleId(code: string): Promise<string> {
  return (await db.roleDef.findUnique({ where: { code }, select: { id: true } }))!.id;
}

/** Sale thật: vai SALES_CSM, active, gắn cơ sở — đúng tập mà `layPoolDangBat` lấy. */
async function makeSale(slug: string, orgCode: string): Promise<string> {
  const u = await seedUser({ email: testEmail("CENTER_SALES_CSM", slug), role: "SALES_CSM" });
  await db.user.update({
    where: { id: u.id },
    data: { centerId: await centerIdOf(orgCode), isActive: true, roles: ["SALES_CSM"] },
  });
  await assignUserOrgRole(SA, {
    userId: u.id,
    orgUnitId: await orgId(orgCode),
    roleId: await roleId("CENTER_SALES_CSM"),
    reason: "seed test chia lead",
  });
  return u.id;
}

/** SĐT khác nhau cho mỗi lead — trùng số là rơi vào nhánh DUPLICATE, hỏng phép đếm. */
let dem = 0;
function sdt(): string {
  dem += 1;
  return `090${String(1_000_000 + dem).padStart(7, "0")}`;
}

async function nhap(
  centerId: string,
  over: Partial<Parameters<typeof assignLead>[0]> = {},
): Promise<Awaited<ReturnType<typeof assignLead>>> {
  return assignLead({
    targetCenterId: centerId,
    createdById: null,
    entryPoint: "LANDING",
    phone: sdt(),
    parentName: "PH test",
    ...over,
  });
}

/**
 * Tắt một người khỏi pool.
 *
 * `upsert` chứ không `update`: hàng `LeadRotationTurn` chỉ sinh ra lúc người đó
 * được chia LẦN ĐẦU, nên tắt một người CHƯA từng nhận lead — đúng ca hay gặp nhất
 * ngoài đời — sẽ không có hàng nào để sửa. (Bản `deactivate()` thật ở bước 4 cũng
 * phải upsert vì đúng lý do này.)
 */
async function tatNguoi(orgUnitId: string, userId: string, lyDo = "nghỉ"): Promise<void> {
  await db.leadRotationTurn.upsert({
    where: { orgUnitId_userId: { orgUnitId, userId } },
    update: { isActive: false, pausedAt: new Date(), pausedReason: lyDo },
    create: {
      orgUnitId,
      userId,
      turns: 0,
      seedTurns: 0,
      isActive: false,
      pausedAt: new Date(),
      pausedReason: lyDo,
    },
  });
}

/** `turns - seedTurns` = số lead THẬT SỰ nhận qua vòng chia. */
async function soLuot(orgUnitId: string): Promise<Map<string, number>> {
  const rows = await db.leadRotationTurn.findMany({
    where: { orgUnitId },
    select: { userId: true, turns: true, seedTurns: true },
  });
  return new Map(rows.map((r) => [r.userId, r.turns - r.seedTurns]));
}

test.describe("[CHIA-LEAD] engine chia lead — Postgres thật", () => {
  let cs1 = "";
  let ou1 = "";
  let sales: string[] = [];

  test.beforeEach(async () => {
    dem = 0;
    await resetDb();
    await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-al", address: "a", city: "" } });
    await db.center.create({ data: { code: "CS2", name: "CS2", slug: "cs2-al", address: "b", city: "" } });
    await seedOrg(["HO", "CS1", "CS2"]);
    await seedRoles();
    cs1 = await centerIdOf("CS1");
    ou1 = await orgId("CS1");
    sales = [await makeSale("a1", "CS1"), await makeSale("a2", "CS1"), await makeSale("a3", "CS1")];
  });

  test("[IT-01] pool 3 người, 9 lead AUTO → mỗi người đúng 3 lượt", async () => {
    for (let i = 0; i < 9; i++) {
      const r = await nhap(cs1);
      expect(r.ok, `lead ${i} lỗi: ${r.error}`).toBe(true);
      expect(r.assignedToId, `lead ${i} không ai nhận`).toBeTruthy();
      expect(r.consumedTurn).toBe(true);
    }
    const luot = await soLuot(ou1);
    for (const s of sales) expect(luot.get(s), `sale ${s}`).toBe(3);
  });

  test("[IT-02] tắt 1 người, 6 lead → 2 người còn lại mỗi người 3; người tắt GIỮ NGUYÊN số cũ", async () => {
    for (let i = 0; i < 3; i++) await nhap(cs1); // mỗi người 1 lượt
    const truoc = (await soLuot(ou1)).get(sales[2]);

    await tatNguoi(ou1, sales[2], "nghỉ phép");

    for (let i = 0; i < 6; i++) {
      const r = await nhap(cs1);
      expect(r.assignedToId).not.toBe(sales[2]); // người đã tắt tuyệt đối không nhận
    }
    const luot = await soLuot(ou1);
    expect(luot.get(sales[0])).toBe(4);
    expect(luot.get(sales[1])).toBe(4);
    // Bộ đếm ĐÓNG BĂNG, không lùi về 0 và cũng không chạy tiếp.
    expect(luot.get(sales[2])).toBe(truoc);
  });

  test("[IT-03] bật lại → seed về MIN, không nhận dồn; 6 lead nữa → chênh lệch ≤ 1", async () => {
    await tatNguoi(ou1, sales[2]);
    for (let i = 0; i < 6; i++) await nhap(cs1); // 2 người còn lại, mỗi người 3

    // Bật lại = ĐẶT LẠI về MIN của pool đang bật. Giữ số cũ thì người vừa đi làm
    // lại ôm toàn bộ lead cho tới khi đuổi kịp — đó là lý do có bước này.
    const min = Math.min(
      ...(
        await db.leadRotationTurn.findMany({
          where: { orgUnitId: ou1, isActive: true },
          select: { turns: true },
        })
      ).map((r) => r.turns),
    );
    const cu = await db.leadRotationTurn.findUnique({
      where: { orgUnitId_userId: { orgUnitId: ou1, userId: sales[2] } },
      select: { turns: true, seedTurns: true },
    });
    await db.leadRotationTurn.update({
      where: { orgUnitId_userId: { orgUnitId: ou1, userId: sales[2] } },
      data: {
        isActive: true,
        pausedAt: null,
        pausedReason: null,
        turns: min,
        // Giữ nguyên "đã nhận bao nhiêu" cho bảng bằng chứng: dời cả seed theo
        // mức chênh, nếu không con số `turns - seedTurns` nhảy lung tung.
        seedTurns: min - (cu!.turns - cu!.seedTurns),
      },
    });

    const nhan: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await nhap(cs1);
      nhan.push(r.assignedToId!);
    }
    // Không nhận dồn: 6 lead chia cho 3 người, không ai ôm quá 3.
    for (const s of sales) expect(nhan.filter((x) => x === s).length).toBeLessThanOrEqual(3);

    const turns = (
      await db.leadRotationTurn.findMany({
        where: { orgUnitId: ou1, isActive: true },
        select: { turns: true },
      })
    ).map((r) => r.turns);
    expect(Math.max(...turns) - Math.min(...turns)).toBeLessThanOrEqual(1);
  });

  test("[IT-04] người thứ 4 vào pool đã chạy 100 lượt → KHÔNG nhận liên tiếp quá 2 lead đầu", async () => {
    // Đẩy vòng lên cao rồi mới thêm người: seed 0 ở đây là người mới hút sạch lead.
    await db.leadRotationTurn.updateMany({
      where: { orgUnitId: ou1 },
      data: { turns: 100, seedTurns: 100, lastTurnAt: new Date() },
    });
    const moi = await makeSale("a4", "CS1"); // chưa có hàng → pool tự vớt, seed = MIN

    const nhan: string[] = [];
    for (let i = 0; i < 6; i++) nhan.push((await nhap(cs1)).assignedToId!);

    let lienTiep = 0;
    let max = 0;
    for (const id of nhan) {
      lienTiep = id === moi ? lienTiep + 1 : 0;
      max = Math.max(max, lienTiep);
    }
    expect(max, `người mới nhận ${max} lead liên tiếp`).toBeLessThanOrEqual(2);
  });

  test("[IT-05] xen kẽ 5 AUTO + 5 SELF/MANAGER/IMPORT → bộ đếm chỉ +5, tổng lead +10", async () => {
    // Đây chính là chỗ giải thích vì sao "Tổng lead đang giữ" > "Lượt đã nhận".
    const truoc = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    for (let i = 0; i < 5; i++) {
      await nhap(cs1); // AUTO
      const kieu = i % 3;
      if (kieu === 0) {
        await nhap(cs1, { entryPoint: "FORM", createdById: sales[0] }); // SELF
      } else if (kieu === 1) {
        await nhap(cs1, { entryPoint: "MANAGER", explicitOwnerId: sales[1] }); // MANAGER
      } else {
        await nhap(cs1, { entryPoint: "IMPORT", explicitOwnerId: sales[2] }); // IMPORT
      }
    }
    const sau = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    expect(sau - truoc).toBe(5);
    expect(await db.lead.count({ where: { centerId: cs1, deletedAt: null } })).toBe(10);

    const tieu = await db.leadAssignmentLog.count({ where: { orgUnitId: ou1, consumedTurn: true } });
    expect(tieu).toBe(5);
  });

  test("[IT-06] nhập lại SĐT đã có → không tạo lead mới, bộ đếm đứng yên, inboundCount = 2", async () => {
    const dau = await nhap(cs1);
    const truoc = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    const l = await db.lead.findUnique({
      where: { id: dau.leadId! },
      select: { phone: true, lastInboundAt: true, assignedToId: true },
    });

    const lai = await assignLead({
      targetCenterId: cs1,
      createdById: null,
      entryPoint: "LANDING",
      phone: l!.phone,
      parentName: "PH test nhập lại",
    });

    expect(lai.duplicate).toBe(true);
    expect(lai.consumedTurn).toBe(false);
    expect(lai.leadId).toBe(dau.leadId);
    // Chủ lead KHÔNG đổi — nếu đổi thì gõ lại số của khách là cướp được lead.
    expect(lai.assignedToId).toBe(l!.assignedToId);
    expect(await db.lead.count({ where: { centerId: cs1, deletedAt: null } })).toBe(1);

    const sauKhi = await db.lead.findUnique({
      where: { id: dau.leadId! },
      select: { inboundCount: true, lastInboundAt: true },
    });
    expect(sauKhi!.inboundCount).toBe(2);
    expect(sauKhi!.lastInboundAt!.getTime()).toBeGreaterThanOrEqual(l!.lastInboundAt!.getTime());

    const sau = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    expect(sau).toBe(truoc);
    expect(await db.leadDuplicate.count()).toBe(1);
  });

  test("[IT-07] 20 request AUTO đồng thời cùng cơ sở → bộ đếm tăng ĐÚNG 20, không ai nhận trùng lượt", async () => {
    // Ca đắt nhất của cả bộ: đây là thứ chứng minh advisory lock có thật sự chẹn.
    // Không khoá thì 20 request đọc chung một trạng thái và chọn trúng một người.
    const truoc = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    const res = await Promise.all(Array.from({ length: 20 }, () => nhap(cs1)));

    for (const r of res) expect(r.assignedToId, "có lead không ai nhận").toBeTruthy();
    const sau = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    expect(sau - truoc).toBe(20);

    // 20 lead chia 3 người ⇒ 7/7/6, chênh lệch không quá 1.
    const luot = [...(await soLuot(ou1)).values()];
    expect(Math.max(...luot) - Math.min(...luot)).toBeLessThanOrEqual(1);
    expect(await db.leadAssignmentLog.count({ where: { orgUnitId: ou1, consumedTurn: true } })).toBe(20);
  });

  test("[IT-08] pool rỗng → lead CHƯA PHÂN CÔNG, có thông báo, bộ đếm không đổi", async () => {
    await db.leadRotationTurn.updateMany({ where: { orgUnitId: ou1 }, data: { isActive: false } });
    // Tắt cả vai lẫn cờ active của user: nếu không, nhánh "người mới chưa có hàng"
    // của pool sẽ vớt họ lại — đúng như thiết kế, nên phải chặn cả hai đường.
    await db.user.updateMany({ where: { id: { in: sales } }, data: { isActive: false } });

    const truoc = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    const r = await nhap(cs1);

    expect(r.ok).toBe(true);
    expect(r.assignedToId).toBeNull();
    expect(r.consumedTurn).toBe(false);

    const sau = [...(await soLuot(ou1)).values()].reduce((a, b) => a + b, 0);
    expect(sau).toBe(truoc);

    const log = await db.leadAssignmentLog.findFirst({
      where: { leadId: r.leadId! },
      select: { source: true, consumedTurn: true, note: true },
    });
    expect(log).toMatchObject({ source: "AUTO", consumedTurn: false });
    expect(log!.note).toMatch(/rỗng/i);
  });
});
