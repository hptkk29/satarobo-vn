/**
 * Ca [NLW-*] — hai nút workflow MƯỢN cho việc nối học viên ↔ lead (26/09/2026).
 *
 * GitHub chỉ nhận chạy tay workflow đã có trên `main`, nên đợt này thêm lựa chọn vào hai nút đã
 * đăng ký thay vì tạo tệp mới (cùng cách 8f964d48). Lưới canh ba chuyện mà một lượt sửa YAML dễ
 * làm hỏng im lặng: mặc định cũ vẫn là mặc định (bấm như cũ ra đúng việc cũ), input không nội suy
 * thẳng vào `run`, và lựa chọn đo prod không mở đường ghi.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const doc = (tep: string) => readFileSync(resolve(process.cwd(), tep), "utf8");
const khongNoiSuyVaoRun = (wf: string) =>
  wf.split(/\r?\n/).filter((d) => /\brun:.*\$\{\{\s*inputs\./.test(d));

describe("[NLW-01] Seed dữ liệu TEST — lựa chọn nối học viên ↔ lead", () => {
  const wf = doc(".github/workflows/seed-test-data.yml");

  it("mặc định `khong` ⇒ job seed cũ chạy như trước; chọn khác ⇒ job seed BỎ QUA", () => {
    expect(wf).toMatch(/noi_hoc_vien_lead:[\s\S]*?default:\s*khong\s*\r?\n/);
    expect(wf).toMatch(/if: \$\{\{ inputs\.noi_hoc_vien_lead == '' \|\| inputs\.noi_hoc_vien_lead == 'khong' \}\}/);
  });

  it("seed-uat chạy LỐI RIÊNG (không qua index.ts vốn đặt lại mật khẩu uat.*)", () => {
    expect(wf).toContain("seed-uat) UAT_SEED=1 pnpm exec tsx prisma/seed-uat/chay-noi-lead.ts ;;");
    expect(wf).not.toMatch(/seed-uat\)[^\n]*db:seed:uat/);
  });

  it("ghi thật bắt buộc số duyệt; input đi qua env; lựa chọn lạ ⇒ đỏ", () => {
    expect(wf).toContain('pnpm exec tsx scripts/noi-hoc-vien-voi-lead.ts --ghi "--expect=$SO_DUYET"');
    // Chỉ xét job của đợt này — job seed cũ có sẵn một dòng nội suy (seed chấm công), ngoài phạm vi.
    const job = wf.slice(wf.indexOf("  noi-hoc-vien-lead:"), wf.indexOf("\n  seed:"));
    expect(job.length).toBeGreaterThan(100);
    expect(khongNoiSuyVaoRun(job)).toEqual([]);
    expect(job).toMatch(/\*\) echo "::error::Lựa chọn lạ: \$CHE_DO"; exit 1 ;;/);
  });
});

describe("[NLW-02] PROD · ĐỌC — đo 'lên prod có phải gắn tay không'", () => {
  const wf = doc(".github/workflows/nguong-thanh-toan-prod-chi-doc.yml");

  it("lựa chọn noi-hoc-vien-lead chạy chế độ ĐO TRƯỚC MIGRATION, mã thoát là của script (pipefail)", () => {
    expect(wf).toMatch(/^\s*-\s*noi-hoc-vien-lead\s*$/m);
    expect(wf).toContain("pnpm exec tsx scripts/noi-hoc-vien-voi-lead.ts --truoc-migration | tee bao-cao.txt");
    const khoi = wf.slice(wf.indexOf("noi-hoc-vien-lead)"));
    expect(khoi.indexOf("set -o pipefail")).toBeGreaterThan(0);
    expect(khoi.indexOf("set -o pipefail")).toBeLessThan(khoi.indexOf("--truoc-migration"));
    expect(wf).not.toMatch(/noi-hoc-vien-voi-lead\.ts[^\n]*--ghi/);
  });

  it("script: --truoc-migration đi với --ghi là DỪNG trước mọi lượt đọc/ghi", () => {
    const s = doc("scripts/noi-hoc-vien-voi-lead.ts");
    const dung = s.indexOf("if (TRUOC_MIGRATION && GHI)");
    expect(dung).toBeGreaterThan(0);
    expect(dung).toBeLessThan(s.indexOf("db.student.findMany({"));
  });
});
