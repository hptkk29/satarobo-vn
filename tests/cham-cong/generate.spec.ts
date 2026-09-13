// tests/cham-cong/generate.spec.ts — sinh lưới tháng, tầng DB THẬT.
//
// 🔴 Vì sao file này tồn tại: trước 13/09/2026 `generateMonthAssignments` có **0 ca test**.
// Tầng thuần (`lib/cham-cong/generate.test.ts`) kiểm được phép QUYẾT ĐỊNH, nhưng không kiểm
// được thứ quan trọng nhất ở đây: *có câu lệnh ghi nào chạy vào ngày đã qua không*. Chỉ tầng
// DB trả lời được, vì chỉ ở đó mới có dòng thật để so trước/sau.
//
// Postgres LOCAL (satarobo_test); tự SKIP nếu không có.
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedShiftTemplates } from "../../lib/cham-cong/seed-core";
import { loadCenterMap } from "../../lib/cham-cong/home-center";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const isLocal =
  /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) && /satarobo_test|ci_test/.test(DB_URL);
const d = isLocal ? describe : describe.skip;
if (!isLocal) console.warn("[cham-cong/generate] SKIP: DATABASE_URL không trỏ Postgres local satarobo_test");

const TAG = "cc-generate";
/** Tháng test — CỐ ĐỊNH (luật 19). Mọi mốc dưới đây nằm trong tháng này. */
const KY = "2026-09";
const ngay = (d: number) => new Date(Date.UTC(2026, 8, d));
/** "Hôm nay" giả: 15/09/2026. Trước nó = quá khứ, sau nó = tương lai. */
const HOM_NAY = ngay(15);

d("generateMonthAssignments — DB thật", () => {
  const db = new PrismaClient({ datasourceUrl: DB_URL });
  let generate: typeof import("../../lib/cham-cong/generate-db");
  let cs1 = "";
  let userId = "";
  let actorId = "";
  let centerMap: Awaited<ReturnType<typeof loadCenterMap>>;

  const donDep = async () => {
    const us = await db.user.findMany({
      where: { email: { endsWith: `@${TAG}.test` } },
      select: { id: true },
    });
    const ids = us.map((u) => u.id);
    await db.staffAttendanceDay.deleteMany({ where: { userId: { in: ids } } });
    await db.staffTimeLog.deleteMany({ where: { userId: { in: ids } } });
    await db.shiftAssignment.deleteMany({ where: { userId: { in: ids } } });
    await db.shiftWeeklyPattern.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    generate = await import("../../lib/cham-cong/generate-db");
    await seedShiftTemplates(db);
    await donDep();
    cs1 = (
      await db.center.upsert({
        where: { slug: `${TAG}-cs1` },
        update: {},
        create: { slug: `${TAG}-cs1`, name: "CS1 generate", address: "x", code: "GEN1" },
        select: { id: true },
      })
    ).id;
    const u = await db.user.create({
      data: { email: `nv@${TAG}.test`, name: "NV generate", role: "HR", roles: ["HR"], password: "x", centerId: cs1 },
      select: { id: true },
    });
    userId = u.id;
    actorId = userId;
    centerMap = await loadCenterMap();

    // Khung ca tuần: MỌI thứ đều là "S" — nên mọi ngày trong tháng đều có mã sắp xếp.
    const tplS = await db.shiftTemplate.findFirstOrThrow({
      where: { code: "S", centerId: null },
      select: { id: true },
    });
    for (let wd = 0; wd < 7; wd += 1) {
      await db.shiftWeeklyPattern.create({
        data: {
          userId, centerId: cs1, weekday: wd,
          templateId: tplS.id, templateCode: "S",
          sheetName: "NV generate", effectiveFrom: new Date(Date.UTC(2000, 0, 1)),
        },
      });
    }
  });

  // 🔴 LUẬT 18 — mỗi ca phải XANH khi chạy MỘT MÌNH.
  // Bản đầu của file này chain trạng thái: ca 2/3/4 dựa vào lượt `chay()` của ca 1. Chạy
  // riêng ca 3 là đỏ. Nay mỗi ca tự dọn ô ca rồi tự gọi `chay()`; NGƯỜI và KHUNG CA TUẦN
  // giữ nguyên vì chúng là bối cảnh CHỈ ĐỌC, không phải thứ ca nào sửa.
  beforeEach(async () => {
    await db.staffTimeLog.deleteMany({ where: { userId } });
    await db.shiftAssignment.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await donDep();
    await db.$disconnect();
  });

  /** Ô ca có sẵn, mã KHÁC hẳn khung ("CG" vs "S") ⇒ không chặn thì chắc chắn bị REPLACE. */
  async function dungOCu(d: number) {
    const tplCG = await db.shiftTemplate.findFirstOrThrow({
      where: { code: "CG", centerId: null },
      select: { id: true },
    });
    return db.shiftAssignment.create({
      data: {
        userId, centerId: cs1, workDate: ngay(d),
        templateId: tplCG.id, templateCode: "CG",
        segments: [{ start: "09:00", end: "11:30", kind: "WORK", orgUnitIds: [] }],
        placeMode: "AT_UNITS", attendanceMode: "REQUIRED", dayCredit: 1, source: "PATTERN",
      },
    });
  }

  const chay = () =>
    generate.generateMonthAssignments({
      db: db as unknown as Parameters<typeof generate.generateMonthAssignments>[0]["db"],
      periodKey: KY,
      centerMap,
      canWriteCenter: () => true,
      actorUserId: actorId,
      onlyUserIds: [userId],
      homNay: HOM_NAY,
    });

  // ── vế CHẶN: ngày hôm qua và HÔM NAY không đổi MỘT FIELD NÀO ────────────────────────
  it("ngày HÔM QUA (14/9) và HÔM NAY (15/9): không một field nào đổi, không dòng nào thêm", async () => {
    await dungOCu(14);
    await dungOCu(15);
    // Lượt quét thật của ngày hôm qua — thứ khiến việc ghi đè trở thành mất dữ liệu.
    await db.staffTimeLog.create({
      data: {
        userId, centerId: cs1, direction: "CHECK_IN",
        loggedAt: new Date("2026-09-14T02:00:00Z"), workDate: ngay(14),
        source: "TICKET", result: "ACCEPTED",
      },
    });

    const truoc = await db.shiftAssignment.findMany({
      where: { userId, workDate: { in: [ngay(14), ngay(15)] } },
      orderBy: { workDate: "asc" },
    });
    expect(truoc).toHaveLength(2);

    const r = await chay();
    expect(r.skippedPast, "phải đếm số ngày bị chừa").toBeGreaterThan(0);

    const sau = await db.shiftAssignment.findMany({
      where: { userId, workDate: { in: [ngay(14), ngay(15)] } },
      orderBy: { workDate: "asc" },
    });
    // So NGUYÊN DÒNG: id, status, templateCode, segments, updatedAt… tất cả.
    expect(sau, "không một field nào của ngày ≤ hôm nay được đổi").toEqual(truoc);
    // Và KHÔNG đẻ dòng CANCELLED nào cho hai ngày đó.
    expect(
      await db.shiftAssignment.count({
        where: { userId, workDate: { in: [ngay(14), ngay(15)] }, status: "CANCELLED" },
      }),
    ).toBe(0);
  });

  it("ngày quá khứ CHƯA có ô ⇒ không đẻ ca mới cho ngày đã trôi qua", async () => {
    await chay(); // ARRANGE của chính ca này — bảng ô ca đang RỖNG
    expect(
      await db.shiftAssignment.count({ where: { userId, workDate: { lte: HOM_NAY } } }),
      "ngày 1..15 không được có ô nào",
    ).toBe(0);
  });

  // ── vế CHO QUA (luật 16) ───────────────────────────────────────────────────────────
  it("NGÀY MAI trở đi VẪN được sinh đúng", async () => {
    await chay();
    const mai = await db.shiftAssignment.findFirst({
      where: { userId, workDate: ngay(16), status: "ACTIVE" },
      select: { templateCode: true, source: true },
    });
    expect(mai, "ngày mai phải có ca").not.toBeNull();
    expect(mai).toMatchObject({ templateCode: "S", source: "PATTERN" });

    const cuoiThang = await db.shiftAssignment.count({
      where: { userId, workDate: { gt: HOM_NAY }, status: "ACTIVE" },
    });
    expect(cuoiThang, "16..30/9 = 15 ngày").toBe(15);
  });

  it("ô PROTECTED ở ngày TƯƠNG LAI vẫn được giữ — bản vá không nuốt luật cũ", async () => {
    const tplP = await db.shiftTemplate.findFirstOrThrow({
      where: { code: "P", centerId: null },
      select: { id: true },
    });
    const donNghi = await db.shiftAssignment.create({
      data: {
        userId, centerId: cs1, workDate: ngay(20),
        templateId: tplP.id, templateCode: "P",
        segments: [], placeMode: "ANYWHERE", attendanceMode: "NONE",
        dayCredit: 0, isLeave: true, source: "LEAVE",
      },
    });

    const r = await chay();
    expect(r.skippedProtected).toBeGreaterThan(0);

    const sau = await db.shiftAssignment.findUniqueOrThrow({ where: { id: donNghi.id } });
    expect(sau).toEqual(donNghi);
  });
});
