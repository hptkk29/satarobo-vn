// R1-02 — verify chữ ký + parse payload (THUẦN). Pure.
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyMetaSignature, parseMessengerEvents } from "@/lib/crm/meta-webhook";

const SECRET = "test-app-secret";
const sign = (raw: string) =>
  "sha256=" + crypto.createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");

describe("[R1-02] verifyMetaSignature", () => {
  it("[R1-02-C2.2] chữ ký đúng → true; sai/thiếu → false", () => {
    const raw = '{"a":1}';
    expect(verifyMetaSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(verifyMetaSignature(raw, "sha256=deadbeef", SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, sign(raw), undefined)).toBe(false);
  });
});

describe("[R1-02] parseMessengerEvents", () => {
  it("trích đúng event tin nhắn", () => {
    const body = {
      object: "page",
      entry: [
        { id: "PAGE1", messaging: [{ sender: { id: "PSID1" }, timestamp: 1700000000000, message: { mid: "m1", text: "hi" } }] },
      ],
    };
    const ev = parseMessengerEvents(body);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ pageId: "PAGE1", psid: "PSID1", text: "hi", mid: "m1" });
  });

  it("bỏ qua event không phải tin nhắn + payload không hợp lệ", () => {
    expect(parseMessengerEvents({ object: "page", entry: [{ id: "P", messaging: [{ sender: { id: "x" }, delivery: {} }] }] })).toEqual([]);
    expect(parseMessengerEvents({ object: "instagram" })).toEqual([]);
    expect(parseMessengerEvents(null)).toEqual([]);
  });
});
