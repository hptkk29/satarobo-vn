// Cổng dữ liệu agent (25/09/2026) — lưới ESLint cho `lib/agents/**` + `app/api/agent/**`.
// Chạy ESLint THẬT trên đoạn mã với filePath giả (khuôn `db-restriction.test.ts`).
// Mỗi ca "phải lỗi" có một ca đối chứng "không được lỗi" — lưới chặn nhầm mọi thứ cũng xanh
// ở vế thứ nhất (luật 11: ca khẳng định SỰ VẮNG MẶT phải kèm đối chứng dương).
import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";

const eslint = new ESLint();

async function loiImport(code: string, filePath: string) {
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

const DB = `import { db } from "@/lib/db"\nexport const x = db\n`;
const KHO = `import { khoCong } from "@/lib/agents/kho"\nexport const x = khoCong\n`;
const KHO_TUONG_DOI = `import { khoCong } from "../kho"\nexport const x = khoCong\n`;
const SYSTEM = `import { SYSTEM_ACTOR } from "@/lib/auth/system-actor"\nexport const x = SYSTEM_ACTOR\n`;
const SDB = `import { scopedDb } from "@/lib/db-scope"\nexport const x = scopedDb\n`;

beforeAll(async () => {
  await loiImport(SDB, "lib/__warmup__.ts");
}, 90_000);

describe("[AG-LINT-01] cấm @/lib/db trần trong cổng agent", () => {
  it("lib/agents/** import @/lib/db → lỗi", { timeout: 60_000 }, async () => {
    const m = await loiImport(DB, "lib/agents/gateway/__moi__.ts");
    expect(m.length).toBe(1);
    expect(m[0]!.message).toContain("Cổng agent");
  });
  it("app/api/agent/** import @/lib/db → lỗi", async () => {
    expect((await loiImport(DB, "app/api/agent/v1/__moi__/route.ts")).length).toBe(1);
  });
  it("ĐỐI CHỨNG: lib/agents/kho.ts (ngoại lệ duy nhất) import @/lib/db → KHÔNG lỗi", async () => {
    expect((await loiImport(DB, "lib/agents/kho.ts")).length).toBe(0);
  });
  it("ĐỐI CHỨNG: scopedDb trong cổng → KHÔNG lỗi", async () => {
    expect((await loiImport(SDB, "lib/agents/tools/__moi__.ts")).length).toBe(0);
  });
});

describe("[AG-LINT-02] cấm SYSTEM_ACTOR trong cổng agent", () => {
  it("lib/agents/** import system-actor → lỗi", async () => {
    const m = await loiImport(SYSTEM, "lib/agents/gateway/__moi__.ts");
    expect(m.length).toBe(1);
    expect(m[0]!.message).toContain("SYSTEM_ACTOR");
  });
  it("công cụ import system-actor → lỗi (khối hẹp nhắc lại pattern của khối rộng)", async () => {
    expect((await loiImport(SYSTEM, "lib/agents/tools/__moi__.ts")).length).toBe(1);
  });
  it("ĐỐI CHỨNG: ngoài cổng (cron) import system-actor → KHÔNG bị luật này chặn", async () => {
    expect((await loiImport(SYSTEM, "lib/cron/__moi__.ts")).length).toBe(0);
  });
});

describe("[AG-LINT-03] công cụ + route không chạm kho DB của cổng", () => {
  it("công cụ import @/lib/agents/kho → lỗi", async () => {
    expect((await loiImport(KHO, "lib/agents/tools/danh-muc/__moi__.ts")).length).toBe(1);
  });
  it("công cụ import tương đối '../kho' → lỗi", async () => {
    expect((await loiImport(KHO_TUONG_DOI, "lib/agents/tools/__moi__.ts")).length).toBe(1);
  });
  it("route import kho → lỗi", async () => {
    expect((await loiImport(KHO, "app/api/agent/v1/__moi__/route.ts")).length).toBe(1);
  });
  it("ĐỐI CHỨNG: gateway/quan-tri import kho → KHÔNG lỗi", async () => {
    expect((await loiImport(KHO, "lib/agents/gateway/__moi__.ts")).length).toBe(0);
    expect((await loiImport(KHO_TUONG_DOI, "lib/agents/quan-tri/__moi__.ts")).length).toBe(0);
  });
});
