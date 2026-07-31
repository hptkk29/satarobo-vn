import { beforeEach, describe, expect, it, vi } from "vitest";

// (server-only được alias sang stub rỗng trong vitest.config.ts)

// ─── DB giả: 2 bảng in-memory đủ để chạy đúng ngữ nghĩa cooldown/limit/CAS ───
type OtpRow = {
  id: string;
  target: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verifiedAt: Date | null;
  consumedAt: Date | null;
  userId: string | null;
  createdAt: Date;
};
type DeliveryRow = { id: string; otpRequestId: string; status: string; createdAt: Date };

const store = { otps: [] as OtpRow[], deliveries: [] as DeliveryRow[] };
let seq = 0;

/** Bản ghi có ít nhất 1 delivery SENT — mô phỏng `deliveries: { some: { status } }`. */
function wasDelivered(otpId: string): boolean {
  return store.deliveries.some((d) => d.otpRequestId === otpId && d.status === "SENT");
}

type OtpWhere = {
  target?: string;
  purpose?: string;
  consumedAt?: null;
  createdAt?: { gte?: Date; lt?: Date };
  deliveries?: { some: { status: string } };
  id?: string;
};

function matches(row: OtpRow, where: OtpWhere = {}): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.target !== undefined && row.target !== where.target) return false;
  if (where.purpose !== undefined && row.purpose !== where.purpose) return false;
  if (where.consumedAt === null && row.consumedAt !== null) return false;
  if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
  if (where.createdAt?.lt && row.createdAt >= where.createdAt.lt) return false;
  if (where.deliveries && !wasDelivered(row.id)) return false;
  return true;
}

vi.mock("@/lib/db", () => ({
  db: {
    otpRequest: {
      create: vi.fn(async ({ data }: { data: Partial<OtpRow> }) => {
        const row: OtpRow = {
          id: `otp${++seq}`,
          target: data.target as string,
          purpose: data.purpose as string,
          codeHash: data.codeHash as string,
          expiresAt: data.expiresAt as Date,
          attempts: 0,
          maxAttempts: (data.maxAttempts as number) ?? 5,
          verifiedAt: null,
          consumedAt: null,
          userId: (data.userId as string | null) ?? null,
          createdAt: new Date(),
        };
        store.otps.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where?: OtpWhere }) => {
        const hits = store.otps.filter((r) => matches(r, where));
        return hits.length ? hits[hits.length - 1] : null;
      }),
      count: vi.fn(async ({ where }: { where?: OtpWhere }) =>
        store.otps.filter((r) => matches(r, where)).length,
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = store.otps.find((r) => r.id === where.id)!;
          if (typeof data.attempts === "object" && data.attempts !== null) {
            row.attempts += (data.attempts as { increment: number }).increment;
          }
          if (data.verifiedAt instanceof Date) row.verifiedAt = data.verifiedAt;
          if (data.consumedAt instanceof Date) row.consumedAt = data.consumedAt;
          return row;
        },
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: OtpWhere; data: Record<string, unknown> }) => {
          const hits = store.otps.filter((r) => matches(r, where));
          for (const row of hits) {
            if (data.verifiedAt instanceof Date) row.verifiedAt = data.verifiedAt;
            if (data.consumedAt instanceof Date) row.consumedAt = data.consumedAt;
          }
          return { count: hits.length };
        },
      ),
    },
    otpDeliveryLog: {
      create: vi.fn(async ({ data }: { data: { otpRequestId: string; status: string } }) => {
        const row = {
          id: `d${++seq}`,
          otpRequestId: data.otpRequestId,
          status: data.status,
          createdAt: new Date(),
        };
        store.deliveries.push(row);
        return row;
      }),
      count: vi.fn(
        async ({ where }: { where?: { status?: string; createdAt?: { gte?: Date } } }) =>
          store.deliveries.filter((d) => {
            if (where?.status && d.status !== where.status) return false;
            if (where?.createdAt?.gte && d.createdAt < where.createdAt.gte) return false;
            return true;
          }).length,
      ),
    },
  },
}));

const SETTINGS: Record<string, number> = {
  "otp.ttlMinutes": 5,
  "otp.maxAttempts": 5,
  "otp.resendCooldownSec": 60,
  "otp.dailyLimit": 8,
  "otp.globalDailyCap": 300,
  "otp.globalKillSwitch": 500,
};
vi.mock("@/lib/settings/service", () => ({
  getSetting: vi.fn(async (key: string) => SETTINGS[key]),
}));

vi.mock("@/lib/security/signing-key", () => ({
  getSigningSecret: () => "test-secret-key-for-otp-hmac-0123456789",
}));

// Provider giả — điều khiển được thành/bại để test §3.5.
let sendOk = true;
const sendSpy = vi.fn(async () => ({ ok: sendOk, provider: "test", error: sendOk ? undefined : "BOOM" }));
vi.mock("./provider", () => ({
  getPrimaryOtpProvider: () => ({ channel: "EMAIL", name: "test", send: sendSpy }),
}));

import { requestOtp, verifyAndConsumeOtp } from "./service";

const TARGET = "ph@example.com";

/** Lấy mã plain từ lần gửi gần nhất (provider giả nhận `code`). */
function lastSentCode(): string {
  const call = sendSpy.mock.calls.at(-1) as unknown as [{ code: string }];
  return call[0].code;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  store.otps = [];
  store.deliveries = [];
  seq = 0;
  sendOk = true;
  sendSpy.mockClear();
  for (const k of Object.keys(SETTINGS)) {
    SETTINGS[k] = { "otp.ttlMinutes": 5, "otp.maxAttempts": 5, "otp.resendCooldownSec": 60, "otp.dailyLimit": 8, "otp.globalDailyCap": 300, "otp.globalKillSwitch": 500 }[k]!;
  }
});

describe("[AUTH-SDT-P0-C1] §3.1 — OTP đã verify KHÔNG còn là vé vào cửa vĩnh viễn", () => {
  it("mã đúng → ok, và bị TIÊU ngay (không còn trạng thái verified-chưa-consume)", async () => {
    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    const code = lastSentCode();

    const v = await verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code });
    expect(v.ok).toBe(true);

    const row = store.otps[0]!;
    expect(row.consumedAt).not.toBeNull();
    expect(row.verifiedAt).not.toBeNull();
  });

  it("HỒI QUY lỗ hổng: sau khi verify thành công, mã SAI phải bị từ chối", async () => {
    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    const code = lastSentCode();
    await verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code });

    // Bản cũ trả { ok: true } cho BẤT KỲ mã nào ở bước này.
    const again = await verifyAndConsumeOtp({
      target: TARGET,
      purpose: "ACTIVATION",
      code: "000000",
    });
    expect(again.ok).toBe(false);
  });

  it("HỒI QUY: mã hết hạn bị từ chối (bản cũ bỏ qua expiresAt sau khi đã verify)", async () => {
    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    const code = lastSentCode();
    store.otps[0]!.expiresAt = new Date(Date.now() - 1000);

    const v = await verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.error).toMatch(/hết hạn/i);
  });

  it("hai request đồng thời cùng mã đúng → chỉ MỘT cái tiêu được (CAS)", async () => {
    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    const code = lastSentCode();

    const [a, b] = await Promise.all([
      verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code }),
      verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it("mã sai → tăng attempts, khoá khi chạm maxAttempts", async () => {
    SETTINGS["otp.maxAttempts"] = 2;
    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });

    const r1 = await verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code: "111111" });
    expect(r1.ok).toBe(false);
    await verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code: "222222" });

    const blocked = await verifyAndConsumeOtp({
      target: TARGET,
      purpose: "ACTIVATION",
      code: lastSentCode(),
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.error).toMatch(/quá số lần/i);
  });
});

describe("[AUTH-SDT-P0-C2] §3.5 — gửi thất bại không đốt cooldown/hạn mức ngày", () => {
  it("gửi hỏng → KHÔNG bị cooldown chặn lần gửi tiếp theo", async () => {
    sendOk = false;
    const first = await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    expect(first.ok).toBe(false);

    sendOk = true;
    const second = await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    expect(second.ok).toBe(true); // bản cũ: bị chặn 60s dù chưa tin nào tới nơi
  });

  it("gửi hỏng KHÔNG trừ hạn mức ngày", async () => {
    SETTINGS["otp.dailyLimit"] = 1;
    SETTINGS["otp.resendCooldownSec"] = 0;

    sendOk = false;
    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    sendOk = true;

    const ok = await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    expect(ok.ok).toBe(true);
  });

  it("gửi thành công VẪN trừ hạn mức ngày", async () => {
    SETTINGS["otp.dailyLimit"] = 1;
    SETTINGS["otp.resendCooldownSec"] = 0;

    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    const over = await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.error).toMatch(/vượt số lần/i);
  });
});

describe("[AUTH-SDT-P0-C3] §3.2 — trần chi phí toàn hệ thống", () => {
  it("chạm trần ngày → từ chối gửi, KHÔNG gọi provider", async () => {
    SETTINGS["otp.globalDailyCap"] = 2;
    SETTINGS["otp.resendCooldownSec"] = 0;

    await requestOtp({ target: "a@x.com", purpose: "ACTIVATION" });
    await requestOtp({ target: "b@x.com", purpose: "ACTIVATION" });
    const callsBefore = sendSpy.mock.calls.length;

    const blocked = await requestOtp({ target: "c@x.com", purpose: "ACTIVATION" });
    expect(blocked.ok).toBe(false);
    expect(sendSpy.mock.calls.length).toBe(callsBefore); // không đốt thêm tiền
    // Cờ systemHalt là thứ đường công khai dựa vào để biết được phép báo thật.
    expect(blocked.ok === false && blocked.systemHalt).toBe(true);
  });

  it("vượt hạn mức NGÀY của riêng 1 target KHÔNG được gắn systemHalt (chống oracle §3.4)", async () => {
    SETTINGS["otp.dailyLimit"] = 1;
    SETTINGS["otp.resendCooldownSec"] = 0;

    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    const over = await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    expect(over.ok).toBe(false);
    // Nhánh này CHỈ xảy ra với target có thật → báo thật là dựng lại oracle.
    expect(over.ok === false && over.systemHalt).toBeFalsy();
  });

  it("kill-switch chặn ở ngưỡng cao hơn trần ngày", async () => {
    SETTINGS["otp.globalDailyCap"] = 100;
    SETTINGS["otp.globalKillSwitch"] = 1;
    SETTINGS["otp.resendCooldownSec"] = 0;

    await requestOtp({ target: "a@x.com", purpose: "ACTIVATION" });
    const blocked = await requestOtp({ target: "b@x.com", purpose: "ACTIVATION" });
    expect(blocked.ok).toBe(false);
  });
});

describe("[AUTH-SDT-P2-C1] cửa test OTP_TEST_FIXED_CODE", () => {
  it("set biến (non-prod) → mã sinh ra đúng bằng giá trị cố định, verify đi đường thật", async () => {
    vi.stubEnv("OTP_TEST_FIXED_CODE", "424242");

    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    expect(lastSentCode()).toBe("424242");

    const v = await verifyAndConsumeOtp({ target: TARGET, purpose: "ACTIVATION", code: "424242" });
    expect(v.ok).toBe(true);
    // Cửa test không được nới lỏng CAS: mã đã tiêu thì nhập lại phải bị từ chối.
    const again = await verifyAndConsumeOtp({
      target: TARGET,
      purpose: "ACTIVATION",
      code: "424242",
    });
    expect(again.ok).toBe(false);
  });

  it("không set biến → mã vẫn ngẫu nhiên 6 chữ số", async () => {
    await requestOtp({ target: TARGET, purpose: "ACTIVATION" });
    expect(lastSentCode()).toMatch(/^[1-9][0-9]{5}$/);
  });

  it("giá trị sai định dạng (không phải 6 chữ số) → requestOtp nổ, không im lặng", async () => {
    vi.stubEnv("OTP_TEST_FIXED_CODE", "12ab56");
    await expect(requestOtp({ target: TARGET, purpose: "ACTIVATION" })).rejects.toThrow(
      /6 chữ số/,
    );
  });

  it("production khởi động mà thấy biến này → THROW ngay khi nạp module", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_TEST_FIXED_CODE", "424242");
    vi.resetModules();
    await expect(import("./service")).rejects.toThrow(/OTP_TEST_FIXED_CODE/);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("[AUTH-SDT-P2-C2] P1 DoD — 0905… và 84905… là CÙNG một target", () => {
  it("xin mã bằng 0905… rồi xin lại bằng +84905… → dính CHUNG cooldown", async () => {
    const r1 = await requestOtp({ target: "0905 123 456", purpose: "ACTIVATION" });
    expect(r1.ok).toBe(true);

    const r2 = await requestOtp({ target: "+84905123456", purpose: "ACTIVATION" });
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.cooldownSec).toBeGreaterThan(0);
  });

  it("hai cách gõ dùng CHUNG hạn mức ngày (không nhân đôi được 8 tin/ngày)", async () => {
    SETTINGS["otp.resendCooldownSec"] = 0;
    SETTINGS["otp.dailyLimit"] = 1;

    await requestOtp({ target: "0905123456", purpose: "ACTIVATION" });
    const over = await requestOtp({ target: "84905123456", purpose: "ACTIVATION" });
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.error).toMatch(/vượt số lần/i);
  });

  it("xin mã bằng 0905… nhưng verify bằng +84 905… vẫn khớp", async () => {
    await requestOtp({ target: "0905123456", purpose: "ACTIVATION" });
    const v = await verifyAndConsumeOtp({
      target: "+84 905 123 456",
      purpose: "ACTIVATION",
      code: lastSentCode(),
    });
    expect(v.ok).toBe(true);
  });
});
