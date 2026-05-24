/**
 * One-off bulk replace: strip `/admin/` prefix from page URLs in admin code.
 * Skips `/api/admin/...` (those stay — they're API endpoints).
 *
 * Run: node scripts/strip-admin-prefix.mjs
 *
 * After running, manually verify:
 * - proxy.ts intentional admin path checks (kept by negative lookbehind hits)
 * - eslint.config.mjs glob patterns (NOT touched, no `/admin/` slash literal)
 * - robots.ts disallow rules (handled separately)
 */
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOTS = [
  "app/(admin)",
  "app/(auth)",
  "components/admin",
  "components/honors",
  "components/sections",
  "components/design-system",
  "components/public",
  "components/legacy-laptrinhrobot",
  "components/legacy-luyenthirobosim",
];

// Match `/admin/` ONLY at the start of a string literal — i.e. immediately
// after `"`, `'`, or backtick. This targets URL paths like "/admin/leads"
// without touching filesystem imports like "@/components/admin/X" or
// "@/app/(admin)/admin/X" where `/admin/` sits in the middle of the path.
const PATTERN = /(?<=["'`])\/admin\//g;

async function walk(dir) {
  let files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await walk(full));
    } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function processFile(filepath) {
  const content = await readFile(filepath, "utf-8");
  if (!content.includes("/admin/")) return null;
  const replaced = content.replace(PATTERN, "/");
  if (replaced === content) return null;
  await writeFile(filepath, replaced, "utf-8");
  return filepath;
}

async function main() {
  let changedFiles = 0;
  let totalReplacements = 0;
  for (const root of ROOTS) {
    const ok = await stat(root)
      .then(() => true)
      .catch(() => false);
    if (!ok) continue;
    const files = await walk(root);
    for (const f of files) {
      const before = await readFile(f, "utf-8");
      const matches = before.match(PATTERN) ?? [];
      const result = await processFile(f);
      if (result) {
        console.log(`changed (${matches.length}): ${f}`);
        changedFiles++;
        totalReplacements += matches.length;
      }
    }
  }
  console.log(
    `\nDone. ${changedFiles} files updated, ${totalReplacements} occurrences replaced.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
