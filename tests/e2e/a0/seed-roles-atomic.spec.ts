/**
 * A0-02 — `seedRoles()` phải NGUYÊN TỬ. Postgres LOCAL (.env.test).
 *
 * ── Vì sao có file này ──
 * `prisma/seed-roles.ts` từng chạy `deleteMany` rồi `createMany` **rời nhau** trong
 * vòng lặp, nên có một khoảng mà `RolePermission` của role đang seed là **RỖNG**.
 * Khi `RBAC_V2_ENABLED` còn OFF thì vô hại — runtime đọc ma trận tĩnh v1, không đọc
 * bảng này. Nhưng cờ **đã BẬT trên Production** ⇒ trong khoảng đó `can()` v2 trả
 * `false` cho **mọi action của mọi người đang giữ role đó** (trừ `SUPER_ADMIN`, thoát
 * sớm ở `lib/auth/can.ts`) = **mất quyền toàn hệ thống giữa lúc seed**.
 * Bối cảnh đầy đủ: `docs/taicautruc/05-premortem.md` **KB-06**; kịch bản: `08-test-scenarios.md`
 * **TS-01-1** (bảo vệ) và **TS-01-3** (rollback).
 *
 * ── Đọc kỹ: T1-11 là ca NGƯỢC ĐỜI CÓ CHỦ ĐÍCH ──
 * T1-11 **tái hiện đường CŨ** và **đòi nhìn thấy khoảng rỗng**. Nó không kiểm sản phẩm —
 * nó kiểm **chính bộ đo**. Nếu T1-11 đỏ thì bộ đếm đã ngừng bắt được khoảng rỗng, và
 * **T1-10 xanh không còn ý nghĩa gì**. Đừng "sửa cho xanh" bằng cách gỡ T1-11.
 *
 * Chạy nhanh (không cần dựng Next):
 *   A0_SKIP_WEBSERVER=1 pnpm test:e2e:a0 -- seed-roles-atomic
 */
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { db } from "../../../lib/db";
import { resetDb, seedRoles } from "../_helpers/seed";

/** Role dùng làm mẫu đo — chọn role chắc chắn có perm sau khi seed. */
const ROLE = "SUPER_ADMIN";

/** Số lượt đếm tối thiểu để kết luận — dưới mức này là bộ đo chưa kịp chạy. */
const MIN_POLLS = 5;

/** Khoảng hở cố ý ở T1-11, đủ rộng để bộ đo bắt được cả khi CI chậm. */
const GAP_MS = 250;

type PollResult = { min: number; polls: number };

/**
 * Đếm liên tục `RolePermission` của một role trên **kết nối RIÊNG** — mô phỏng
 * request của người dùng khác đang chạy song song với lệnh seed.
 */
function startPoller(
  reader: PrismaClient,
  roleId: string,
  stop: { now: boolean },
): Promise<PollResult> {
  return (async () => {
    let min = Number.POSITIVE_INFINITY;
    let polls = 0;
    while (!stop.now) {
      const c = await reader.rolePermission.count({ where: { roleId } });
      if (c < min) min = c;
      polls++;
    }
    return { min, polls };
  })();
}

async function roleIdOf(code: string): Promise<string> {
  const r = await db.roleDef.findUnique({ where: { code }, select: { id: true } });
  if (!r) throw new Error(`role ${code} không tồn tại — seedRoles() chưa chạy?`);
  return r.id;
}

test.describe("[A0-02] seedRoles nguyên tử (KB-06)", () => {
  let reader: PrismaClient;

  test.beforeAll(() => {
    reader = new PrismaClient();
  });

  test.afterAll(async () => {
    await reader.$disconnect();
  });

  test.beforeEach(async () => {
    await resetDb();
    await seedRoles();
  });

  test("[A0-02-T1-10] seedRoles KHÔNG lúc nào để RolePermission của role rỗng (TS-01-1)", async () => {
    const rid = await roleIdOf(ROLE);
    const before = await db.rolePermission.count({ where: { roleId: rid } });
    // Nền phải có dữ liệu, nếu không phép đo vô nghĩa (mẫu số = 0).
    expect(before, "role mẫu phải có ít nhất 1 RolePermission").toBeGreaterThan(0);

    const stop = { now: false };
    const poller = startPoller(reader, rid, stop);
    await seedRoles(); // đường thật — đã bọc $transaction
    stop.now = true;
    const { min, polls } = await poller;

    expect(polls, "bộ đo phải chạy được ít nhất vài lượt").toBeGreaterThan(MIN_POLLS);
    // Điều được bảo vệ: kết nối khác KHÔNG BAO GIỜ thấy trạng thái trung gian.
    expect(min, "kết nối khác thấy RolePermission rỗng giữa lúc seed").toBe(before);
  });

  test("[A0-02-T1-11] bộ đo ĐỦ NHẠY: đường cũ (không transaction) bị bắt — ĐỪNG gỡ test này", async () => {
    const rid = await roleIdOf(ROLE);
    const perms = await db.rolePermission.findMany({
      where: { roleId: rid },
      select: { action: true, scopeType: true },
    });
    expect(perms.length).toBeGreaterThan(0);

    const stop = { now: false };
    const poller = startPoller(reader, rid, stop);

    // Tái hiện ĐÚNG đường cũ: hai lệnh rời nhau, không transaction.
    await db.rolePermission.deleteMany({ where: { roleId: rid } });
    await new Promise((r) => setTimeout(r, GAP_MS));
    await db.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: rid, action: p.action, scopeType: p.scopeType })),
      skipDuplicates: true,
    });

    stop.now = true;
    const { min, polls } = await poller;

    expect(polls).toBeGreaterThan(MIN_POLLS);
    // Nếu dòng này đỏ: bộ đo đã ngừng bắt được khoảng rỗng ⇒ T1-10 xanh là VÔ NGHĨA.
    expect(min, "bộ đo không bắt được khoảng rỗng của đường cũ ⇒ T1-10 mất giá trị").toBe(0);

    // Trả lại trạng thái đủ cho spec sau (beforeEach cũng reset, nhưng đừng để rác).
    expect(await db.rolePermission.count({ where: { roleId: rid } })).toBe(perms.length);
  });

  test("[A0-02-T1-12] ngắt giữa transaction → dữ liệu nguyên vẹn (TS-01-3)", async () => {
    const rid = await roleIdOf(ROLE);
    const before = await db.rolePermission.count();

    await expect(
      db.$transaction(async (tx) => {
        await tx.rolePermission.deleteMany({ where: { roleId: rid } });
        throw new Error("NGẮT CỐ Ý giữa transaction");
      }),
    ).rejects.toThrow("NGẮT CỐ Ý");

    expect(await db.rolePermission.count(), "transaction không rollback").toBe(before);
  });

  test("[A0-02-T1-13] seedRoles idempotent — chạy lại không đổi số dòng (TS-01-2)", async () => {
    const after1 = await db.rolePermission.count();
    await seedRoles();
    const after2 = await db.rolePermission.count();
    await seedRoles();
    const after3 = await db.rolePermission.count();

    expect(after1).toBeGreaterThan(0);
    expect(after2).toBe(after1);
    expect(after3).toBe(after1);
  });
});
