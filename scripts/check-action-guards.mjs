#!/usr/bin/env node
/**
 * scripts/check-action-guards.mjs — NHÓM 02 T1b (Guard sweep) CI script.
 *
 * Parses every file with a genuine `'use server'` directive (module-level or
 * per-function) under app/ + lib/, plus every `app/api/**\/route.ts`, and
 * FAILS if an exported async function does not resolve a guard — either
 * directly (`auth(`, `assertPermission(`, `checkPermission(`,
 * `getServerSession(`) or TRANSITIVELY, by calling a same-file helper (the
 * dominant repo pattern: a local `async function requireXxx() { const
 * session = await auth(); ... }` that every action in the file calls first)
 * or a known cross-file guard helper (see KNOWN_GUARD_IMPORTS below).
 *
 * Exceptions (per technical.md §3 mục 3 — NHÓM 02):
 *   - `app/(public)/**`, `app/(legacy)/**`, `app/(auth)/**` — public/pre-auth
 *     pages (login flow itself has nothing to authenticate yet).
 *   - `app/api/auth/**` — NextAuth.js handler itself.
 *   - `app/api/leads/route.ts` — public lead-capture endpoint (rate-limited,
 *     intentionally anonymous; see technical.md §3 mục 4).
 *   - Cron routes (`app/api/cron/**`) — must reference `CRON_SECRET` /
 *     `verifyCronAuth(` instead.
 *   - Webhook routes (path contains `/webhook(s)/`) — must reference a
 *     signature/secret-verification keyword instead.
 *
 * Also SKIPS exported functions whose first parameter is explicitly typed
 * `actor: Actor` / `session: Session` (etc.) — these are ownership/scope
 * helper functions that take an ALREADY-resolved actor from the caller (e.g.
 * `staffOwnsEnrollment(actor: Actor, enrollmentId: string)`), not entry
 * points. They are listed separately as "helper (pre-resolved actor)" —
 * informational only, does not fail the build.
 *
 * Run: node scripts/check-action-guards.mjs
 * Exit 0 = no violations. Exit 1 = violations found (printed to stdout).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", ".git", "__snapshots__"]);
const FILE_EXTS = new Set([".ts", ".tsx"]);

// Directive: a standalone statement `'use server'` / `"use server"` (with or
// without trailing semicolon) — NOT just the substring appearing in a comment.
const USE_SERVER_DIRECTIVE = /^[ \t]*['"]use server['"];?[ \t]*$/m;

// Direct guard calls that prove a session was resolved in THIS function body.
const DIRECT_GUARD_RE = /\b(auth|assertPermission|checkPermission|getServerSession)\s*\(/;

// Cross-file guard helpers verified (2026-07) to internally call auth() or an
// equivalent secret/signature check — calling these counts as guarded even
// though the literal `auth(` text is not in the caller's body.
const KNOWN_GUARD_IMPORTS = [
  "requireActiveStudent", // lib/portal/session.ts — auth() + PARENT + activeStudent
  "assertOwnsStudent", // lib/portal/session.ts — auth() + ownership
  "getPortalContext", // lib/portal/session.ts — auth() + PARENT check
  "verifyCronAuth", // lib/cron/auth.ts — CRON_SECRET header check
];
const KNOWN_GUARD_RE = new RegExp(`\\b(${KNOWN_GUARD_IMPORTS.join("|")})\\s*\\(`);

const CRON_SECRET_RE = /(CRON_SECRET|verifyCronAuth\s*\()/;
const WEBHOOK_SIG_RE =
  /(signature|hmac|verify_token|verifyToken|verifyMetaSignature|verifyWebhookSecret|x-hub|checksum|WEBHOOK_[A-Z_]*SECRET|timingSafeEqual)/i;

/** Public lead-capture endpoint — intentionally anonymous (rate-limited). */
const EXPLICIT_PUBLIC_ROUTES = new Set(["app/api/leads/route.ts"]);

// Param annotations that mark a function as an "ownership/scope helper" which
// receives an ALREADY-resolved actor/session/user from its caller — not an
// entry point, so it is not required to call auth() itself. Matches the
// FIRST parameter only (`(actor: Actor, ...)` / `(user: { id; role }, ...)`).
const PRE_RESOLVED_PARAM_RE =
  /\(\s*(actor|session|user)\s*:\s*(Actor\b|Session\b|\{[^{}]*\brole\b)/;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

/** Category: which guard is required for this file (or 'skip'). */
function categorize(relPath) {
  const p = toPosix(relPath);
  if (/\/webhooks?\//.test(p)) return "webhook";
  if (p.startsWith("app/api/cron/")) return "cron";
  if (p.startsWith("app/(public)/") || p.startsWith("app/(legacy)/")) return "skip";
  if (p.startsWith("app/(auth)/")) return "skip";
  if (p.startsWith("app/api/auth/")) return "skip";
  if (EXPLICIT_PUBLIC_ROUTES.has(p)) return "skip";
  return "normal";
}

async function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIR_NAMES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out = out.concat(await walk(full));
    } else if (FILE_EXTS.has(path.extname(e.name))) {
      if (/\.(test|spec)\.tsx?$/.test(e.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function isRouteFile(relPath) {
  const p = toPosix(relPath);
  return p.startsWith("app/api/") && p.endsWith("/route.ts");
}

/** Find index of the `{` that opens the function body, starting the scan
 *  right after the parameter list's closing `)`. Treats `<`, `(`, `[` as
 *  nesting opens so a return-type annotation like `Promise<{ id: string }>`
 *  does not get mistaken for the body. */
function findBodyStart(src, fromIndex) {
  let depth = 0;
  for (let i = fromIndex; i < src.length; i++) {
    const c = src[i];
    if (c === "<" || c === "(" || c === "[") depth++;
    else if (c === ">" || c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === "{") {
      if (depth === 0) return i;
      depth++;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return -1;
}

/** Balance braces from an opening `{`, skipping over strings/templates/comments. */
function findBodyEnd(src, bodyStart) {
  let depth = 0;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = bodyStart; i < src.length; i++) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && c2 === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        i++;
      } else if (c === inStr) {
        inStr = null;
      }
      continue;
    }
    if (c === "/" && c2 === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length - 1;
}

/** Given index of an opening `(`, find the matching `)` (string/comment-aware). */
function findMatchingParen(src, openIdx) {
  let depth = 0;
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && c2 === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && c2 === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Find EVERY function definition in `src` (exported or not — module-private
 * `requireXxx()` helpers are the dominant local-guard pattern in this repo).
 * Returns { name, isExported, isAsync, paramsText, bodyStart, bodyEnd }[].
 */
function findAllFunctions(src) {
  const results = [];
  const seen = new Set();

  const push = (name, isExported, paramsStart, parenIdx) => {
    if (!name) return;
    const paramCloseIdx = findMatchingParen(src, parenIdx);
    if (paramCloseIdx === -1) return;
    const bodyStart = findBodyStart(src, paramCloseIdx + 1);
    if (bodyStart === -1) return;
    const bodyEnd = findBodyEnd(src, bodyStart);
    const key = `${name}:${bodyStart}`;
    if (seen.has(key)) return;
    seen.add(key);
    const paramsText = src.slice(paramsStart, paramCloseIdx + 1);
    results.push({ name, isExported, paramsText, bodyStart, bodyEnd });
  };

  // (export)? (default)? async? function NAME(
  const fnRe = /(export\s+(default\s+)?)?(async\s+)?function\s*(\*)?\s*(\w+)?\s*/g;
  let m;
  while ((m = fnRe.exec(src))) {
    const isExported = !!m[1];
    const name = m[5] ?? "(default)";
    const afterKeyword = fnRe.lastIndex;
    const parenIdx = src.indexOf("(", afterKeyword);
    if (parenIdx === -1 || parenIdx - afterKeyword > 5) continue;
    push(name, isExported, afterKeyword, parenIdx);
  }

  // (export)? const NAME (: Type)? = async (
  const constRe = /(export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*async\s*(\*)?\s*[\w<>,\s]*\(/g;
  while ((m = constRe.exec(src))) {
    const isExported = !!m[1];
    const name = m[2];
    const parenIdx = constRe.lastIndex - 1;
    push(name, isExported, parenIdx, parenIdx);
  }

  return results;
}

/** Identifiers called (as `name(`) inside `bodyText`. */
function calledNames(bodyText) {
  const names = new Set();
  const re = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(bodyText))) names.add(m[1]);
  return names;
}

/**
 * True if `fn` is guarded — directly, transitively via a same-file helper,
 * or via a known cross-file guard import.
 */
function isGuarded(fn, byName, src, visiting = new Set()) {
  const body = src.slice(fn.bodyStart, fn.bodyEnd + 1);
  if (DIRECT_GUARD_RE.test(body)) return true;
  if (KNOWN_GUARD_RE.test(body)) return true;
  if (visiting.has(fn.name)) return false;
  visiting.add(fn.name);
  for (const called of calledNames(body)) {
    if (called === fn.name) continue;
    const target = byName.get(called);
    if (target && isGuarded(target, byName, src, visiting)) return true;
  }
  return false;
}

async function main() {
  let files = [];
  for (const d of SCAN_DIRS) {
    files = files.concat(await walk(path.join(ROOT, d)));
  }

  const violations = [];
  const cronViolations = [];
  const webhookViolations = [];
  const helperSkips = []; // informational only
  let scannedFiles = 0;
  let scannedFns = 0;

  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    const relPosix = toPosix(rel);
    const isRoute = isRouteFile(rel);
    let src;
    try {
      src = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    const hasDirective = USE_SERVER_DIRECTIVE.test(src);
    if (!isRoute && !hasDirective) continue;

    scannedFiles++;
    const category = categorize(rel);
    if (category === "skip") continue;

    const allFns = findAllFunctions(src);
    const byName = new Map(allFns.map((f) => [f.name, f]));
    const exportedAsyncFns = allFns.filter((f) => f.isExported);

    for (const fn of exportedAsyncFns) {
      scannedFns++;
      const body = src.slice(fn.bodyStart, fn.bodyEnd + 1);

      if (category === "cron") {
        if (!CRON_SECRET_RE.test(body) && !CRON_SECRET_RE.test(src)) {
          cronViolations.push({ file: relPosix, fn: fn.name });
        }
        continue;
      }
      if (category === "webhook") {
        if (!WEBHOOK_SIG_RE.test(body) && !WEBHOOK_SIG_RE.test(src)) {
          webhookViolations.push({ file: relPosix, fn: fn.name });
        }
        continue;
      }

      if (PRE_RESOLVED_PARAM_RE.test(fn.paramsText)) {
        helperSkips.push({ file: relPosix, fn: fn.name });
        continue;
      }

      if (!isGuarded(fn, byName, src)) {
        violations.push({ file: relPosix, fn: fn.name });
      }
    }
  }

  console.log(
    `[check-action-guards] scanned ${scannedFiles} files, ${scannedFns} exported functions (${helperSkips.length} pre-resolved-actor helpers skipped).`,
  );
  console.log("");

  if (violations.length) {
    console.log(`VIOLATIONS — no guard reachable (direct or via local/known helper) (${violations.length}):`);
    for (const v of violations) console.log(`  - ${v.file} :: ${v.fn}`);
    console.log("");
  }
  if (cronViolations.length) {
    console.log(`CRON VIOLATIONS — missing CRON_SECRET/verifyCronAuth check (${cronViolations.length}):`);
    for (const v of cronViolations) console.log(`  - ${v.file} :: ${v.fn}`);
    console.log("");
  }
  if (webhookViolations.length) {
    console.log(`WEBHOOK VIOLATIONS — missing signature/secret check (${webhookViolations.length}):`);
    for (const v of webhookViolations) console.log(`  - ${v.file} :: ${v.fn}`);
    console.log("");
  }

  const total = violations.length + cronViolations.length + webhookViolations.length;
  if (total === 0) {
    console.log("PASS — all exported async Server Actions / API routes have a guard.");
    process.exit(0);
  } else {
    console.log(`FAIL — ${total} guard violation(s) found.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[check-action-guards] fatal error:", err);
  process.exit(1);
});
