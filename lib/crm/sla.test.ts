// R1-06 — SLA engine (THUẦN, C6.1–C6.5). Pure.
import { describe, it, expect } from "vitest";
import { evaluateSla } from "@/lib/crm/sla";

const NOW = new Date("2026-06-09T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000, H = 3_600_000, D = 86_400_000;

describe("[R1-06] evaluateSla", () => {
  it("[R1-06-C6.1] SLA-0 chưa respond > 5'", () => {
    expect(evaluateSla({ firstMessageAt: ago(6 * MIN) }, NOW)).toContain("SLA-0");
    expect(evaluateSla({ firstMessageAt: ago(4 * MIN) }, NOW)).not.toContain("SLA-0");
    expect(evaluateSla({ firstMessageAt: ago(6 * MIN), respondedAt: ago(1 * MIN) }, NOW)).not.toContain("SLA-0");
  });

  it("[R1-06-C6.2] SLA-1 chưa bàn giao > 4h", () => {
    expect(evaluateSla({ qualifiedAt: ago(5 * H) }, NOW)).toContain("SLA-1");
    expect(evaluateSla({ qualifiedAt: ago(5 * H), handedAt: ago(1 * H) }, NOW)).not.toContain("SLA-1");
  });

  it("[R1-06-C6.3] SLA-2 chưa phân công > 30' (sau tiếp nhận)", () => {
    expect(evaluateSla({ receivedConfirmedAt: ago(40 * MIN) }, NOW)).toContain("SLA-2");
    expect(evaluateSla({ handedAt: ago(40 * MIN) }, NOW)).toContain("SLA-2"); // fallback handedAt
    expect(evaluateSla({ receivedConfirmedAt: ago(40 * MIN), assignedAt: ago(5 * MIN) }, NOW)).not.toContain("SLA-2");
  });

  it("[R1-06-C6.4] SLA-3 chưa liên hệ > 3h", () => {
    expect(evaluateSla({ assignedAt: ago(4 * H) }, NOW)).toContain("SLA-3");
    expect(evaluateSla({ assignedAt: ago(4 * H), firstContactAt: ago(1 * H) }, NOW)).not.toContain("SLA-3");
  });

  it("[R1-06-C6.5] SLA-4 lead im > 2 ngày; đã xử lý → không alert", () => {
    expect(evaluateSla({ lastActivityAt: ago(3 * D) }, NOW)).toContain("SLA-4");
    expect(evaluateSla({ lastActivityAt: ago(3 * D), resolved: true }, NOW)).not.toContain("SLA-4");
  });

  it("nhiều vi phạm cùng lúc", () => {
    const r = evaluateSla({ qualifiedAt: ago(5 * H), assignedAt: ago(4 * H) }, NOW);
    expect(r).toEqual(expect.arrayContaining(["SLA-1", "SLA-3"]));
  });
});
