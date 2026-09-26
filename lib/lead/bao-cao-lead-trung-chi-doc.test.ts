// Ca [LTS-CD-*] — BÁO CÁO LEAD TRÙNG SĐT CHẠY TRÊN PROD PHẢI KHÔNG CÓ ĐƯỜNG GHI NÀO.
//
// Cùng họ `[RBAC-CD-*]` (`lib/auth/bao-cao-rbac-chi-doc.test.ts`) — chép CÁCH làm: lưới ghim mã
// nguồn, vì "tệp này KHÔNG CHỨA lệnh ghi" không đầu vào nào chứng minh được, chỉ văn bản mã.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "scripts/bao-cao-lead-trung-sdt.ts";
const WORKFLOW = ".github/workflows/lead-trung-sdt-prod-chi-doc.yml";

function doc(duong: string): string {
  return readFileSync(resolve(process.cwd(), duong), "utf8");
}

/** Bóc chú thích — lưới soi MÃ, không soi lời kể về mã (luật 11). */
function docMa(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function docYaml(duong: string): string {
  return doc(duong)
    .split(/\r?\n/)
    .map((d) => d.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

describe("[LTS-CD-01] script KHÔNG chứa lệnh ghi", () => {
  const src = docMa(SCRIPT);

  it("không create / update / delete / upsert trên model nào", () => {
    const cam =
      /\.\w+\.(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
    expect([...src.matchAll(cam)].map((m) => m[0])).toEqual([]);
  });

  it("không `$executeRaw` nào ngoài đúng MỘT lệnh `SET TRANSACTION READ ONLY`", () => {
    const exec = [...src.matchAll(/\$executeRaw\w*`([^`]*)`/g)].map((m) => m[1]!.trim());
    expect(exec).toEqual(["SET TRANSACTION READ ONLY"]);
  });

  it("không `$queryRawUnsafe` / `$executeRawUnsafe`", () => {
    expect(src).not.toMatch(/\$(query|execute)RawUnsafe/);
  });

  it("transaction kết thúc bằng ROLLBACK canh sẵn (ném mốc KET)", () => {
    expect(src).toMatch(/throw new Error\(KET\)/);
  });
});

describe("[LTS-CD-02] báo cáo không in SĐT trần", () => {
  it("mọi `.phone` đi ra báo cáo đều qua `cheSdt(`", () => {
    const src = docMa(SCRIPT);
    const inTran = [...src.matchAll(/\$\{[^}]*\.phone[^}]*\}/g)]
      .map((m) => m[0])
      .filter((s) => !s.includes("cheSdt("));
    expect(inTran).toEqual([]);
  });
});

describe("[LTS-CD-03] workflow chỉ biết secret CHỈ-ĐỌC, chỉ chạy tay trên main", () => {
  const yml = docYaml(WORKFLOW);

  it("chỉ tham chiếu PROD_DATABASE_URL_RO", () => {
    const thamChieu = [...yml.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!);
    expect([...new Set(thamChieu)]).toEqual(["PROD_DATABASE_URL_RO"]);
  });

  it("không migration / seed / deploy", () => {
    expect(yml).not.toMatch(/migrate deploy|migrate dev|db:seed|db push/);
  });

  it("chỉ `workflow_dispatch`, và chỉ trên main", () => {
    expect(yml).not.toMatch(/\n\s*(push|pull_request|schedule):/);
    expect(yml).toMatch(/if:\s*github\.ref == 'refs\/heads\/main'/);
  });
});
