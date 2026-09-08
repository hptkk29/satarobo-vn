// @vitest-environment node
//
// Server Action đăng ký/gỡ thiết bị nhận thông báo — Web Push Đợt 3.
//
// `@vitest-environment node` ở DÒNG ĐẦU là bắt buộc: môi trường mặc định của repo là jsdom
// (`vitest.config.ts`), mà `next-auth` không nạp được ở đó — đúng lý do đã ghi trong
// `lib/chat/_actions.test.ts`.
//
// Repo CHƯA có tiền lệ `vi.mock("next/headers")` (grep toàn bộ test ra 0). File này lập một cái;
// phần logic thật của việc suy origin đã tách sang `lib/push/origin.ts` và được test riêng ở đó,
// nên ở đây chỉ cần một `Headers` giả để chứng minh action KHÔNG lấy origin từ client.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const upsert = vi.fn(async (_a: unknown) => ({}));
  const updateMany = vi.fn(async (_a: unknown) => ({ count: 1 }));
  const auth = vi.fn(async () => ({
    user: { id: "usr_toi", roles: ["SALES_CSM"], role: "SALES_CSM" },
  }) as unknown);
  const headerMap = new Map<string, string>([
    ["host", "admin.satarobo.vn"],
    ["x-forwarded-proto", "https"],
  ]);
  return {
    upsert,
    updateMany,
    auth,
    headerMap,
    mockDb: { webPushSubscription: { upsert, updateMany } },
  };
});

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => h.headerMap.get(k.toLowerCase()) ?? null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: vi.fn(async () => ({ userId: "usr_toi" })) }));
vi.mock("@/lib/db-scope", () => ({ scopedDb: vi.fn(() => h.mockDb) }));

import {
  dangKyThietBiAction,
  huyThietBiAction,
  huyThietBiTheoEndpointAction,
} from "./_push-actions";
import { taoCapKhoaVapid, vapidKeyIdTuKhoa } from "@/lib/push/vapid";

const CAP = taoCapKhoaVapid();
const P256DH = taoCapKhoaVapid().publicKey; // cũng là điểm P-256 65 byte
const AUTH = Buffer.alloc(16, 9).toString("base64url");
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

function dauVao(ghiDe: Record<string, unknown> = {}) {
  return {
    subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH }, expirationTime: null },
    userAgent: "Mozilla/5.0 (iPhone)",
    displayMode: "standalone",
    ...ghiDe,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", CAP.publicKey);
  h.upsert.mockClear();
  h.updateMany.mockClear().mockResolvedValue({ count: 1 });
  h.auth.mockClear().mockResolvedValue({
    user: { id: "usr_toi", roles: ["SALES_CSM"], role: "SALES_CSM" },
  } as unknown as never);
  h.headerMap.set("host", "admin.satarobo.vn");
  h.headerMap.set("x-forwarded-proto", "https");
});

/** Khối `create` của lượt upsert đầu tiên. */
function duLieuGhi() {
  const a = h.upsert.mock.calls[0]?.[0] as
    | { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }
    | undefined;
  if (!a) throw new Error("upsert chưa được gọi lần nào");
  return a;
}

describe("[PUSH-D3-T09] userId · origin · vapidKeyId KHÔNG bao giờ đến từ client", () => {
  it("userId lấy từ PHIÊN, kể cả khi client gửi kèm userId khác", async () => {
    const kq = await dangKyThietBiAction(dauVao({ userId: "usr_ke_tan_cong" }));
    expect(kq.ok).toBe(true);
    const g = duLieuGhi();
    expect(g.create.userId).toBe("usr_toi");
    expect(g.update.userId).toBe("usr_toi");
  });

  it("origin suy từ HEADER, kể cả khi client gửi kèm origin bịa", async () => {
    // Cột `origin` dùng để trả lời "người này bật thông báo ở host nào". Nhận từ client thì nó
    // thành lời kể chứ không còn là số đo.
    h.headerMap.set("host", "giaovien.satarobo.vn");
    const kq = await dangKyThietBiAction(dauVao({ origin: "https://ke-tan-cong.test" }));
    expect(kq.ok).toBe(true);
    expect(duLieuGhi().create.origin).toBe("https://giaovien.satarobo.vn");
  });

  it("vapidKeyId suy từ KHOÁ SERVER đang dùng, không nhận từ client", async () => {
    await dangKyThietBiAction(dauVao({ vapidKeyId: "gia-mao" }));
    expect(duLieuGhi().create.vapidKeyId).toBe(vapidKeyIdTuKhoa(CAP.publicKey));
  });

  it("khoá lạ trong payload bị BỎ, không lọt vào Prisma", async () => {
    // Schema là `z.object` chế độ STRIP — nó bỏ khoá lạ chứ không từ chối. Vì thế đường ghi
    // BẮT BUỘC chỉ dùng `parsed.data`; ghi từ input thô là mọi khoá lạ đi thẳng vào DB.
    await dangKyThietBiAction(dauVao({ status: "ACTIVE", failureCount: 999, id: "gia-mao" }));
    const g = duLieuGhi();
    expect(g.create.id).toBeUndefined();
    expect(g.create.failureCount).toBeUndefined();
    expect(g.update.failureCount).toBe(0); // giá trị của TA, không phải của client
  });
});

describe("[PUSH-D3-T10] upsert theo endpoint", () => {
  it("khoá upsert là endpoint — máy cũ bật lại không đẻ dòng thứ hai", async () => {
    await dangKyThietBiAction(dauVao());
    expect(duLieuGhi().where).toEqual({ endpoint: ENDPOINT });
  });

  it("nhánh update hồi sinh dòng đã gỡ: về ACTIVE, xoá vết hỏng cũ", async () => {
    await dangKyThietBiAction(dauVao());
    const u = duLieuGhi().update;
    expect(u.status).toBe("ACTIVE");
    expect(u.revokedAt).toBeNull();
    expect(u.failureCount).toBe(0);
    expect(u.lastErrorCode).toBeNull();
  });

  it("ghi displayMode và userAgent — cột chẩn đoán cho nhánh iOS", async () => {
    await dangKyThietBiAction(dauVao());
    expect(duLieuGhi().create.displayMode).toBe("standalone");
    expect(duLieuGhi().create.userAgent).toContain("iPhone");
  });
});

describe("[PUSH-D3-T11] từ chối khi không đủ điều kiện — KHÔNG chạm DB", () => {
  it("chưa đăng nhập", async () => {
    h.auth.mockResolvedValue(null as unknown as never);
    const kq = await dangKyThietBiAction(dauVao());
    expect(kq.ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("PHỤ HUYNH không đăng ký được — phạm vi đã chốt là chỉ nhân viên", async () => {
    h.auth.mockResolvedValue({
      user: { id: "usr_ph", roles: ["PARENT"], role: "PARENT" },
    } as unknown as never);
    const kq = await dangKyThietBiAction(dauVao());
    expect(kq.ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("tài khoản KHÔNG có vai nào cũng bị chặn — tách khỏi ca PARENT", async () => {
    h.auth.mockResolvedValue({ user: { id: "usr_trong", roles: [] } } as unknown as never);
    expect((await dangKyThietBiAction(dauVao())).ok).toBe(false);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("ĐỐI CHỨNG DƯƠNG: GV kiêm phụ huynh VẪN đăng ký được", async () => {
    // Không có ca này thì một `hasStaffRole` viết hỏng thành `return false` vô điều kiện vẫn
    // làm mọi ca âm ở trên XANH — tức cổng siết đến mức không ai dùng được mà test không kêu.
    h.auth.mockResolvedValue({
      user: { id: "usr_gv", roles: ["TEACHER", "PARENT"], role: "TEACHER" },
    } as unknown as never);
    expect((await dangKyThietBiAction(dauVao())).ok).toBe(true);
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("subscription hỏng → chặn ở Zod, và GHIM đúng cổng nào chặn", async () => {
    // Action có BỐN cổng nối tiếp (phiên → Zod → origin → khoá VAPID) và cả bốn đều trả
    // `{ok:false}` mà không chạm `upsert`. Chỉ khẳng định `ok === false` là ca vẫn XANH khi
    // payload chết ở một cổng KHÁC cổng nó định kiểm.
    const ca: [Record<string, unknown>, string][] = [
      [{ endpoint: "http://vi-du.test/x", keys: { p256dh: P256DH, auth: AUTH } }, "Endpoint"],
      [{ endpoint: "https://127.0.0.1/x", keys: { p256dh: P256DH, auth: AUTH } }, "Endpoint"],
      [{ endpoint: ENDPOINT, keys: { p256dh: "ngan", auth: AUTH } }, "p256dh"],
      [{ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: "ngan" } }, "auth"],
    ];
    for (const [sub, mong] of ca) {
      const kq = await dangKyThietBiAction(dauVao({ subscription: sub }));
      expect(kq.ok).toBe(false);
      expect(String(kq.error)).toContain(mong);
    }
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("thiếu khoá VAPID trên server → nói thẳng, không ghi một dòng vô dụng", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    const kq = await dangKyThietBiAction(dauVao());
    expect(kq.ok).toBe(false);
    expect(String(kq.error)).toContain("VAPID");
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("không dựng được origin (thiếu host) → dừng, không bịa một origin mặc định", async () => {
    h.headerMap.delete("host");
    const kq = await dangKyThietBiAction(dauVao());
    expect(kq.ok).toBe(false);
    expect(String(kq.error)).toContain("địa chỉ trang");
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe("[PUSH-D3-T12] gỡ thiết bị — chốt chống IDOR", () => {
  it("where LUÔN kèm userId của phiên, không chỉ id", async () => {
    // `scopedDb` KHÔNG che đường GHI, và bảng này không có cột đơn vị — nên nếu chỉ lọc theo
    // `id` thì ai biết id là gỡ được thiết bị của người khác.
    const kq = await huyThietBiAction({ id: "sub_1" });
    expect(kq.ok).toBe(true);
    const a = h.updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(a.where).toEqual({ id: "sub_1", userId: "usr_toi", status: "ACTIVE" });
    expect(a.data.status).toBe("REVOKED");
  });

  it("không gỡ được dòng nào → báo lỗi, không im lặng nhận là xong", async () => {
    h.updateMany.mockResolvedValue({ count: 0 });
    expect((await huyThietBiAction({ id: "cua_nguoi_khac" })).ok).toBe(false);
  });

  it("tắt trên máy này: lọc theo endpoint + userId", async () => {
    const kq = await huyThietBiTheoEndpointAction({ endpoint: ENDPOINT });
    expect(kq.ok).toBe(true);
    const a = h.updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(a.where).toEqual({ endpoint: ENDPOINT, userId: "usr_toi", status: "ACTIVE" });
  });

  it("tắt trên máy này mà DB không còn dòng nào → VẪN coi là xong", async () => {
    // Người dùng vừa tắt ở máy này; DB không còn bản ghi tương ứng chính là kết quả họ muốn.
    // Bắt họ đọc một thông báo lỗi là nói sai về kết quả.
    h.updateMany.mockResolvedValue({ count: 0 });
    expect((await huyThietBiTheoEndpointAction({ endpoint: ENDPOINT })).ok).toBe(true);
  });
});
