// A0-07 — registry + decideOutcome (THUẦN). Pure, không DB.
import { describe, it, expect, beforeEach } from "vitest";
import { on, getHandlers, clearHandlers, decideOutcome } from "@/lib/events/registry";

describe("[A0-07] registry", () => {
  beforeEach(() => clearHandlers());

  it("[A0-07-T5-01] nhiều handler/1 type (thêm = 1 dòng on)", async () => {
    on("demo.ping", async () => {});
    on("demo.ping", async () => {});
    expect(getHandlers("demo.ping")).toHaveLength(2);
    expect(getHandlers("unknown")).toHaveLength(0);
  });

  it("clearHandlers xoá hết", () => {
    on("x", async () => {});
    clearHandlers();
    expect(getHandlers("x")).toHaveLength(0);
  });
});

describe("[A0-07] decideOutcome (retry/FAILED)", () => {
  it("không lỗi → DONE", () => {
    expect(decideOutcome({ anyFailed: false, attempts: 1, maxAttempts: 5 })).toBe("DONE");
  });
  it("[A0-07-T8-01] lỗi + còn lượt → PENDING", () => {
    expect(decideOutcome({ anyFailed: true, attempts: 1, maxAttempts: 5 })).toBe("PENDING");
  });
  it("[A0-07-T8-02] lỗi + hết lượt → FAILED", () => {
    expect(decideOutcome({ anyFailed: true, attempts: 5, maxAttempts: 5 })).toBe("FAILED");
  });
});
