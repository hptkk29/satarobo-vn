// tests/cham-cong/khung-ca.spec.ts — KHUNG CA TUẦN: gỡ người khỏi khối là gỡ MỀM.
//
// Vì sao bộ này chạm Postgres thật thay vì test hàm thuần: điều đáng vỡ nhất ở đây là
// **khoá duy nhất `(userId, centerId, weekday, effectiveFrom)`**. Gỡ mềm KHÔNG đổi khoá,
// nên "gỡ rồi thêm lại" đi thẳng vào nhánh `update` của `upsert` — và nếu nhánh đó không
// xoá `effectiveTo` thì ghi xong ô vẫn tàng hình. Một hàm thuần không nhìn thấy khoá,
// nên ca đó chỉ đỏ được trên CSDL thật (luật 9).
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  KHUNG_CA_EFFECTIVE_FROM,
  conTrongKhoi,
} from "../../lib/cham-cong/khung-ca";
import { seedShiftTemplates } from "../../lib/cham-cong/seed-core";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const isLocal =
  /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) &&
  /satarobo_test|ci_test/.test(DB_URL);
const d = isLocal ? describe : describe.skip;
const TAG = "cc-khungca";

/** Ngày dùng làm mốc gỡ — cố định để test không phụ thuộc ngày chạy. */
const HOM_NAY = new Date(Date.UTC(2026, 8, 8));

d("khung ca tuần — gỡ mềm bằng effectiveTo", () => {
  const db = new PrismaClient({ datasourceUrl: DB_URL });
  let userId = "";
  let cs1 = "";
  let cs2 = "";
  let tplX = "";

  /** Dựng đủ 7 dòng của một người trong một khối, đúng hình dạng màn admin ghi ra. */
  async function dungCum(centerId: string) {
    for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
      await db.shiftWeeklyPattern.upsert({
        where: {
          userId_centerId_weekday_effectiveFrom: {
            userId,
            centerId,
            weekday,
            effectiveFrom: KHUNG_CA_EFFECTIVE_FROM,
          },
        },
        create: {
          userId,
          centerId,
          weekday,
          templateId: tplX,
          templateCode: "X",
          sheetName: "Người thử",
          effectiveFrom: KHUNG_CA_EFFECTIVE_FROM,
        },
        update: { templateId: tplX, templateCode: "X", effectiveTo: null },
      });
    }
  }

  const cum = (centerId: string) =>
    db.shiftWeeklyPattern.findMany({
      where: { userId, centerId, effectiveFrom: KHUNG_CA_EFFECTIVE_FROM },
      select: { weekday: true, effectiveTo: true, sheetName: true },
      orderBy: { weekday: "asc" },
    });

  beforeAll(async () => {
    await seedShiftTemplates(db);
    const cu = await db.user.findMany({
      where: { email: { endsWith: `@${TAG}.test` } },
      select: { id: true },
    });
    const ids = cu.map((u) => u.id);
    await db.shiftWeeklyPattern.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });

    const mk = async (slug: string, name: string) =>
      (
        await db.center.upsert({
          where: { slug: `${TAG}-${slug}` },
          update: {},
          create: {
            slug: `${TAG}-${slug}`,
            name,
            address: "x",
            code: `${TAG}-${slug.toUpperCase()}`,
          },
          select: { id: true },
        })
      ).id;
    cs1 = await mk("cs1", "CS1 khung ca");
    cs2 = await mk("cs2", "CS2 khung ca");

    userId = (
      await db.user.create({
        data: { email: `a@${TAG}.test`, name: "Người thử", role: "TEACHER" },
        select: { id: true },
      })
    ).id;
    tplX = (
      await db.shiftTemplate.findFirstOrThrow({
        where: { code: "X" },
        select: { id: true },
      })
    ).id;

    await dungCum(cs1);
    await dungCum(cs2);
  });

  afterAll(async () => {
    await db.shiftWeeklyPattern.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("dựng nền: 7 dòng mỗi khối, tất cả đang trong khối", async () => {
    // Anti-vacuity: nếu nền rỗng thì mọi ca dưới xanh mà không kiểm gì.
    const a = await cum(cs1);
    expect(a).toHaveLength(7);
    expect(a.every(conTrongKhoi)).toBe(true);
    expect(await cum(cs2)).toHaveLength(7);
  });

  it("gỡ = đóng CẢ CỤM bằng effectiveTo, KHÔNG xoá dòng nào", async () => {
    // Đúng câu lệnh mà `removePersonFromBlockAction` chạy.
    const { count } = await db.shiftWeeklyPattern.updateMany({
      where: {
        userId,
        centerId: cs1,
        effectiveFrom: KHUNG_CA_EFFECTIVE_FROM,
        effectiveTo: null,
      },
      data: { effectiveTo: HOM_NAY },
    });
    expect(count).toBe(7);

    const a = await cum(cs1);
    // Dòng vẫn còn — đây là điểm khác biệt duy nhất giữa gỡ mềm và xoá cứng.
    expect(a).toHaveLength(7);
    expect(a.every((r) => r.effectiveTo?.getTime() === HOM_NAY.getTime())).toBe(
      true,
    );
    // `sheetName` phải sống sót: nó là cầu nối tên trên file Sheet với userId
    // (`reconcile-db.ts` đọc `distinct sheetName`). Xoá cứng là mất ánh xạ đó.
    expect(a.every((r) => r.sheetName === "Người thử")).toBe(true);
  });

  it("gỡ ở khối này KHÔNG đụng khối kia", async () => {
    // Người làm ở hai cơ sở có hai cụm. Quên `centerId` trong `where` là gỡ luôn cả hai.
    expect((await cum(cs2)).every(conTrongKhoi)).toBe(true);
  });

  it("gỡ lần hai KHÔNG lùi ngày của lần gỡ đầu", async () => {
    // `effectiveTo: null` nằm trong điều kiện chính vì ca này.
    const { count } = await db.shiftWeeklyPattern.updateMany({
      where: {
        userId,
        centerId: cs1,
        effectiveFrom: KHUNG_CA_EFFECTIVE_FROM,
        effectiveTo: null,
      },
      data: { effectiveTo: new Date(Date.UTC(2026, 8, 30)) },
    });
    expect(count).toBe(0);
    expect(
      (await cum(cs1)).every(
        (r) => r.effectiveTo?.getTime() === HOM_NAY.getTime(),
      ),
    ).toBe(true);
  });

  // ⚠️ CA SINH RA DÒNG `effectiveTo: null` TRONG NHÁNH `update`.
  it("thêm lại người đã gỡ: KHÔNG đâm khoá duy nhất, và dòng cũ SỐNG LẠI", async () => {
    // Không có `effectiveTo: null` ở nhánh update thì ca này vẫn KHÔNG ném lỗi — nó ghi
    // xong và dòng vẫn đóng. Đó mới là hình dạng thật của bug: im lặng, không exception.
    await dungCum(cs1);

    const a = await cum(cs1);
    expect(a).toHaveLength(7); // vẫn 7, không nhân đôi thành 14
    expect(
      a.every(conTrongKhoi),
      "gỡ rồi thêm lại phải sống lại, không tàng hình",
    ).toBe(true);
  });

  it("màn khung ca lọc `effectiveTo: null` — người đã gỡ biến khỏi bảng, người kia còn", async () => {
    // Đúng truy vấn của `khung-ca/page.tsx`.
    await db.shiftWeeklyPattern.updateMany({
      where: { userId, centerId: cs1, effectiveTo: null },
      data: { effectiveTo: HOM_NAY },
    });
    const hien = await db.shiftWeeklyPattern.findMany({
      where: { centerId: { in: [cs1, cs2] }, effectiveTo: null, userId },
      select: { centerId: true },
    });
    expect(new Set(hien.map((r) => r.centerId))).toEqual(new Set([cs2]));
  });

  // ── (b) THÊM HÀNG LOẠT — hồi sinh không được đâm khoá duy nhất ─────────────
  //
  // Đây là nửa CSDL của `chiaLoThem`. Luật chia nhóm test thuần ở
  // `lib/cham-cong/khung-ca.test.ts`; ca dưới đây kiểm chính thứ hàm thuần không nhìn
  // thấy: câu `updateMany` mở lại cụm chạy được trên bảng thật, và mở đúng một khối.
  it("mở lại cụm đã gỡ bằng MỘT câu updateMany — 7 dòng, không đụng khối kia", async () => {
    // Nền: cs1 đã bị đóng ở ca trước; cs2 vẫn mở.
    expect((await cum(cs1)).every((r) => r.effectiveTo !== null)).toBe(true);

    const { count } = await db.shiftWeeklyPattern.updateMany({
      where: {
        centerId: cs1,
        userId: { in: [userId] },
        effectiveFrom: KHUNG_CA_EFFECTIVE_FROM,
        effectiveTo: { not: null },
      },
      data: { effectiveTo: null },
    });
    expect(count).toBe(7);

    const a = await cum(cs1);
    expect(a).toHaveLength(7); // vẫn 7 — mở lại, không dựng thêm
    expect(a.every(conTrongKhoi)).toBe(true);
    // Lịch tuần cũ còn nguyên: đó là lý do mở lại thay vì tạo mới.
    expect(a.every((r) => r.sheetName === "Người thử")).toBe(true);
  });

  it("mở lại lần hai KHÔNG đụng dòng nào (đã mở rồi)", async () => {
    // `effectiveTo: { not: null }` trong điều kiện chính vì ca này — chạy lại một lượt
    // thêm hàng loạt không được sinh việc ghi vô nghĩa.
    const { count } = await db.shiftWeeklyPattern.updateMany({
      where: {
        centerId: cs1,
        userId: { in: [userId] },
        effectiveFrom: KHUNG_CA_EFFECTIVE_FROM,
        effectiveTo: { not: null },
      },
      data: { effectiveTo: null },
    });
    expect(count).toBe(0);
  });
});
