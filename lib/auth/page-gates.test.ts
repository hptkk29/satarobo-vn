/**
 * Bất biến "MENU NÓI THẬT": với mọi mục sidebar có `perm` và trang có cổng
 * `if (...) redirect(...)`, tập action ở menu phải BẰNG tập action ở cổng.
 *
 * Hai chiều lệch, hai loại lỗi — smoke prod 10/07 gặp đủ cả hai:
 *   menu ⊄ gate  → DEAD LINK: bấm menu là văng /dashboard (Marketing × /site-content).
 *   gate ⊄ menu  → HỞ QUYỀN THEO URL: gõ URL là vào dù menu giấu (Kế toán đọc học bạ).
 *
 * Test này quét TĨNH sidebar.tsx + page.tsx nên bắt được cả route mới thêm sau này.
 * Muốn lệch có chủ đích → khai vào GATE_MISMATCH_ALLOWLIST kèm lý do trong page-gates.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PAGE_GATES, GATE_MISMATCH_ALLOWLIST } from "@/lib/auth/page-gates";
import { PERMISSIONS } from "@/lib/auth/permissions";

const ROOT = process.cwd();
const SIDEBAR = path.join(ROOT, "components/admin/sidebar.tsx");
const pageFile = (href: string) => path.join(ROOT, "app/(admin)/admin", href, "page.tsx");

/** Bỏ comment để chuỗi trong `// ...` không bị đếm là action thật. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

type MenuItem = { label: string; href: string; perms: string[] };

/** Đọc mục sidebar: dạng `perm: [...PAGE_GATES["/x"]]` và dạng mảng chuỗi thường. */
function readSidebar(): MenuItem[] {
  const src = stripComments(fs.readFileSync(SIDEBAR, "utf8"));
  const out: MenuItem[] = [];
  const viaGates = /label:\s*"([^"]+)"[^}]*?href:\s*"([^"]+)"[^}]*?perm:\s*\[\s*\.\.\.PAGE_GATES\[\s*"([^"]+)"\s*\]\s*\]/g;
  for (const m of src.matchAll(viaGates)) {
    const gate = PAGE_GATES[m[3] as keyof typeof PAGE_GATES];
    expect(gate, `sidebar trỏ PAGE_GATES["${m[3]}"] nhưng bảng không có route đó`).toBeDefined();
    out.push({ label: m[1], href: m[2], perms: [...gate] });
  }
  const literal = /label:\s*"([^"]+)"[^}]*?href:\s*"([^"]+)"[^}]*?perm:\s*\[([^.\]][^\]]*)\]/g;
  for (const m of src.matchAll(literal)) {
    out.push({ label: m[1], href: m[2], perms: [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]) });
  }
  return out;
}

/** CHỈ lấy action nằm trong điều kiện của `if (...) redirect(...)` — bỏ qua các
 *  checkPermission tính cờ UI (canCreate/canEdit/canApprove...). */
function readGate(href: string): string[] | null {
  const f = pageFile(href);
  if (!fs.existsSync(f)) return null;
  const src = stripComments(fs.readFileSync(f, "utf8"));
  const out = new Set<string>();
  for (const m of src.matchAll(/if\s*\(([\s\S]{0,400}?)\)\s*\{?\s*redirect\(/g)) {
    const cond = m[1];
    for (const a of cond.matchAll(/check(?:Any)?Permission\(\s*["']([^"']+)["']/g)) out.add(a[1]);
    for (const g of cond.matchAll(/PAGE_GATES\[\s*["']([^"']+)["']\s*\]/g)) {
      for (const act of PAGE_GATES[g[1] as keyof typeof PAGE_GATES] ?? []) out.add(act);
    }
  }
  return out.size > 0 ? [...out] : null;
}

const sorted = (xs: readonly string[]) => [...xs].sort();

describe("PAGE_GATES — bảng gate là nguồn duy nhất", () => {
  it("mọi action trong bảng đều là Action hợp lệ của ma trận v1", () => {
    for (const [href, actions] of Object.entries(PAGE_GATES)) {
      for (const a of actions) {
        expect(PERMISSIONS, `${href}: action "${a}" không tồn tại trong PERMISSIONS`).toHaveProperty(a);
      }
    }
  });

  it("mỗi route trong bảng có page.tsx và page.tsx gác bằng chính PAGE_GATES[href]", () => {
    for (const href of Object.keys(PAGE_GATES)) {
      const f = pageFile(href);
      expect(fs.existsSync(f), `thiếu ${f}`).toBe(true);
      const src = stripComments(fs.readFileSync(f, "utf8"));
      expect(
        src.includes(`PAGE_GATES["${href}"]`) || src.includes(`PAGE_GATES['${href}']`),
        `${href}/page.tsx phải gác bằng PAGE_GATES["${href}"], không khai action rời`,
      ).toBe(true);
    }
  });

  it("không route nào vừa nằm trong bảng vừa nằm trong allowlist", () => {
    for (const href of GATE_MISMATCH_ALLOWLIST) {
      expect(Object.keys(PAGE_GATES)).not.toContain(href);
    }
  });
});

describe("Bất biến menu ≡ gate (chống dead-link và hở-quyền-theo-URL)", () => {
  const items = readSidebar();

  it("đọc được sidebar (guard cho chính regex của test)", () => {
    expect(items.length).toBeGreaterThan(20);
    expect(items.some((i) => i.href === "/students")).toBe(true);
  });

  it("mọi mục menu có perm + trang có cổng ⇒ menu ≡ gate", () => {
    const lech: string[] = [];
    for (const it of items) {
      if (!it.perms.length || GATE_MISMATCH_ALLOWLIST.includes(it.href)) continue;
      const gate = readGate(it.href);
      if (!gate) continue; // trang không gác bằng permission (layout lo) — ngoài phạm vi
      if (JSON.stringify(sorted(it.perms)) !== JSON.stringify(sorted(gate))) {
        lech.push(`${it.href}\n     menu = [${sorted(it.perms)}]\n     gate = [${sorted(gate)}]`);
      }
    }
    expect(lech, `Route lệch menu↔gate:\n  - ${lech.join("\n  - ")}\n`).toEqual([]);
  });

  it("allowlist không chứa route đã hết lệch (dọn rác)", () => {
    for (const href of GATE_MISMATCH_ALLOWLIST) {
      const it = items.find((i) => i.href === href);
      if (!it) continue;
      const gate = readGate(href);
      if (!gate) continue;
      const equal = JSON.stringify(sorted(it.perms)) === JSON.stringify(sorted(gate));
      expect(equal, `${href} đã hết lệch → bỏ khỏi GATE_MISMATCH_ALLOWLIST`).toBe(false);
    }
  });
});
