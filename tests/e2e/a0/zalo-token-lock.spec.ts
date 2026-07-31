/**
 * AUTH-SĐT P4 — hồi quy khoá advisory của Zalo token trên POSTGRES THẬT.
 *
 * Bug prod 31/07: `lib/zalo/token.ts` lấy khoá bằng
 * `tx.$queryRaw\`SELECT pg_advisory_xact_lock(...)\`` — hàm này trả kiểu `void`,
 * Prisma $queryRaw cố giải mã cột đó và ném "Failed to deserialize column of
 * type 'void'" ⇒ MỌI lần refresh access_token đều chết ⇒ OA không gửi được ZNS
 * (biểu hiện ra ngoài là `ZALO_NOT_CONFIGURED` dù trạng thái hiện "live").
 *
 * Unit test KHÔNG bắt được vì mock $queryRaw trả mảng rỗng. Chỉ Postgres thật
 * mới lộ ⇒ ca này phải sống ở đây, đừng chuyển xuống unit.
 *
 * CHẠY: cần Postgres LOCAL (pnpm db:test:up) — không chạy trên Supabase.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";

test.describe("[P4] khoá advisory refresh token Zalo", () => {
  test("[P4-LOCK-01] $executeRaw lấy được pg_advisory_xact_lock trong transaction", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('zalo_oa_token'))`;
        return true;
      }),
    ).resolves.toBe(true);
  });

  test("[P4-LOCK-02] $queryRaw cho cùng câu lệnh VẪN ném lỗi 'void' — lý do phải dùng $executeRaw", async () => {
    // Khoá cứng nguyên nhân gốc: nếu Prisma sau này đổi hành vi (hết ném lỗi),
    // ca này đỏ và người sửa sẽ đọc được vì sao code không dùng $queryRaw.
    await expect(
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('zalo_oa_token'))`;
      }),
    ).rejects.toThrow(/deserialize column of type 'void'/i);
  });
});
