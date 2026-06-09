import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Cô lập hàm crypto khỏi db/ingest (chỉ test verifyMetaSignature).
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("./ingest", () => ({ ingestLead: vi.fn() }));

import { verifyMetaSignature } from "./webhook";

const RAW = JSON.stringify({ object: "page", entry: [{ id: "1", time: 1 }] });

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyMetaSignature (X-Hub-Signature-256)", () => {
  const orig = process.env.META_APP_SECRET;
  afterEach(() => {
    if (orig === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = orig;
    vi.restoreAllMocks();
  });

  it("nguồn không phải Meta → luôn ok (không áp dụng chữ ký)", () => {
    process.env.META_APP_SECRET = "whatever";
    expect(verifyMetaSignature("zalo", RAW, null).ok).toBe(true);
    expect(verifyMetaSignature("google-form", RAW, "sha256=bad").ok).toBe(true);
  });

  it("chưa cấu hình secret → stub: ok kèm cảnh báo", () => {
    delete process.env.META_APP_SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(verifyMetaSignature("facebook", RAW, null).ok).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("có secret + chữ ký đúng → ok", () => {
    const secret = "stub_app_secret_32_hex_placeholder";
    process.env.META_APP_SECRET = secret;
    expect(verifyMetaSignature("facebook", RAW, sign(secret, RAW)).ok).toBe(true);
  });

  it("có secret nhưng thiếu header → từ chối (missing-signature)", () => {
    process.env.META_APP_SECRET = "secret";
    const r = verifyMetaSignature("facebook", RAW, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing-signature");
  });

  it("chữ ký sai (sai secret) → từ chối (signature-mismatch)", () => {
    process.env.META_APP_SECRET = "real_secret";
    const r = verifyMetaSignature("facebook", RAW, sign("wrong_secret", RAW));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature-mismatch");
  });

  it("body bị sửa 1 byte sau khi ký → từ chối", () => {
    const secret = "real_secret";
    process.env.META_APP_SECRET = secret;
    const goodSig = sign(secret, RAW);
    const tampered = RAW.replace('"page"', '"PAGE"');
    expect(verifyMetaSignature("facebook", tampered, goodSig).ok).toBe(false);
  });
});
