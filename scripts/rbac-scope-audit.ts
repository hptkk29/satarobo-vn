/**
 * scripts/rbac-scope-audit.ts — R1: scope non-GLOBAL + call-site gọi trần = khoá trang.
 *
 *   pnpm exec tsx scripts/rbac-scope-audit.ts
 *
 * `can.ts` trả false khi scope cần target mà call-site không truyền:
 *   CENTER → cần target.centerId · CLASS/ASSIGNED → target.classId
 *   OWN → target.createdById   · CHILDREN → target.parentUserId
 * Nên mọi action đang có ≥1 call-site `checkPermission("x")` KHÔNG truyền target
 * mà lại được seed với scope non-GLOBAL ⇒ role đó mất đường đi ngay khi flip #09.
 *
 * Script quét app/ + lib/ đếm call-site trần, đối chiếu ROLE_SEED, in bảng vi phạm.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROLE_SEED } from "../prisma/seed-roles";

const ROOTS = ["app", "lib"];
const EXT = /\.tsx?$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(p)) out.push(p);
  }
  return out;
}

/** Bỏ comment: dòng chú thích chứa `checkPermission("x")` từng bị đếm thành call-site trần. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const sources = ROOTS.flatMap((r) => walk(r)).map((f) => stripComments(readFileSync(f, "utf8")));
const blob = sources.join("\n");

/** Call-site gọi TRẦN: checkPermission/assertPermission("x") + `<obj>.can("x")` (cfg.can). */
function bareCallSites(action: string): number {
  const esc = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(checkPermission|assertPermission)\\(\\s*["']${esc}["']\\s*\\)`, "g");
  const reDotCan = new RegExp(`\\.can\\(\\s*["']${esc}["']\\s*\\)`, "g");
  return (blob.match(re) ?? []).length + (blob.match(reDotCan) ?? []).length;
}

const cache = new Map<string, number>();
const bare = (a: string) => {
  if (!cache.has(a)) cache.set(a, bareCallSites(a));
  return cache.get(a)!;
};

/** Ngoại lệ: PARENT không đi qua checkPermission (portal có 0 call-site) — xem
 *  lib/auth/rbac-scope.test.ts. 5 call-site trần của parent-feedback:view nằm ở
 *  trang admin mà phụ huynh không vào được. */
const MIEN_TRU = new Set(["PARENT:parent-feedback:view"]);

let viPham = 0;
console.log("# R1 audit — scope non-GLOBAL trên action bị gọi trần\n");

for (const role of ROLE_SEED) {
  const bad = role.perms.filter(
    (p) => p.scopeType !== "GLOBAL" && bare(p.action) > 0 && !MIEN_TRU.has(`${role.code}:${p.action}`),
  );
  if (bad.length === 0) continue;
  viPham += bad.length;
  console.log(`## ${role.code} — ${bad.length} vi phạm`);
  for (const p of bad) console.log(`   🔴 ${p.action} [${p.scopeType}] · ${bare(p.action)} call-site trần`);
  console.log("");
}

const okNonGlobal = ROLE_SEED.flatMap((r) =>
  r.perms.filter((p) => p.scopeType !== "GLOBAL" && bare(p.action) === 0).map((p) => `${r.code}:${p.action}[${p.scopeType}]`),
);
console.log(`# ${viPham} vi phạm R1.`);
console.log(`# ${okNonGlobal.length} perm non-GLOBAL HỢP LỆ (0 call-site trần — call-site đã truyền target):`);
console.log(okNonGlobal.map((s) => `   ✅ ${s}`).join("\n") || "   (không có)");

if (viPham > 0) process.exitCode = 1;
