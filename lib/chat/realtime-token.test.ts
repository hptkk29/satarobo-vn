// @vitest-environment node
// (jsdom làm jose 6 chê `TextEncoder().encode()` — Uint8Array khác realm.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify, decodeJwt } from "jose";

// (server-only được alias sang stub rỗng trong vitest.config.ts)

// DB giả: 1 user in-memory — chỉnh state từng test.
let dbUser: {
  tokenVersion: number;
  isActive: boolean;
  deletedAt: Date | null;
} | null = null;

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(async () => dbUser),
    },
  },
}));

import {
  mintRealtimeToken,
  deriveRealtimeSub,
  RealtimeTokenError,
  REALTIME_TOKEN_TTL_SECONDS,
} from "./realtime-token";

const SECRET = "zztest-supabase-jwt-secret-for-unit-only";
const USER = { id: "clzztestuser0001abcdefgh", tokenVersion: 3 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env.SUPABASE_JWT_SECRET;
  process.env.SUPABASE_JWT_SECRET = SECRET;
  dbUser = { tokenVersion: 3, isActive: true, deletedAt: null };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T10:00:00.000Z"));
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
  else process.env.SUPABASE_JWT_SECRET = savedSecret;
  vi.useRealTimers();
});

describe("[US-02] mintRealtimeToken — cầu JWT Auth.js → Supabase", () => {
  it("ký HS256 verify được bằng SUPABASE_JWT_SECRET, đủ claims đúng thiết kế mục B", async () => {
    const { token } = await mintRealtimeToken(USER);
    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(SECRET),
      { audience: "authenticated" },
    );

    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.role).toBe("authenticated");
    // Claim policy RLS đọc: app_user_id = cuid THẬT, không phải uuid.
    expect(payload.app_user_id).toBe(USER.id);
    // sub chỉ hợp lệ hình thức: UUID v5 derive ổn định từ User.id.
    expect(payload.sub).toMatch(UUID_RE);
    expect(payload.sub).toBe(deriveRealtimeSub(USER.id));
    expect(deriveRealtimeSub(USER.id)).toBe(deriveRealtimeSub(USER.id));
  });

  // Con số này là CẬN TRÊN của cửa sổ rò LỖ 2 (người bị gỡ vẫn nghe được nội dung tin cho
  // tới khi kênh được dựng lại — đo thật: ân hạn ≈ 0s, cửa sổ = phần đời còn lại của vé).
  // Nâng lên là nới thẳng cửa sổ rò; xem chú thích ở `REALTIME_TOKEN_TTL_SECONDS`.
  it("TTL 5 phút: exp - iat = 300s và expiresAt khớp exp", async () => {
    const { token, expiresAt } = await mintRealtimeToken(USER);
    const payload = decodeJwt(token);
    expect(payload.exp! - payload.iat!).toBe(REALTIME_TOKEN_TTL_SECONDS);
    expect(REALTIME_TOKEN_TTL_SECONDS).toBe(5 * 60);
    expect(expiresAt.getTime()).toBe(payload.exp! * 1000);
    expect(payload.iat).toBe(Math.floor(Date.now() / 1000));
  });

  it("tokenVersion trong DB lệch với session → từ chối (force-logout)", async () => {
    dbUser = { tokenVersion: 4, isActive: true, deletedAt: null };
    await expect(mintRealtimeToken(USER)).rejects.toMatchObject({
      name: "RealtimeTokenError",
      code: "TOKEN_VERSION_MISMATCH",
    });
  });

  it("user không tồn tại / đã xoá / bị khoá → từ chối", async () => {
    dbUser = null;
    await expect(mintRealtimeToken(USER)).rejects.toMatchObject({ code: "USER_NOT_FOUND" });

    dbUser = { tokenVersion: 3, isActive: true, deletedAt: new Date() };
    await expect(mintRealtimeToken(USER)).rejects.toMatchObject({ code: "USER_NOT_FOUND" });

    dbUser = { tokenVersion: 3, isActive: false, deletedAt: null };
    await expect(mintRealtimeToken(USER)).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("thiếu SUPABASE_JWT_SECRET → lỗi cấu hình, không ký bừa", async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    await expect(mintRealtimeToken(USER)).rejects.toBeInstanceOf(RealtimeTokenError);
    await expect(mintRealtimeToken(USER)).rejects.toMatchObject({ code: "MISSING_SECRET" });
  });
});
