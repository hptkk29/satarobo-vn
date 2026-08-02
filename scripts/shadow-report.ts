/**
 * scripts/shadow-report.ts — #01 báo cáo shadow-compare RBAC v1↔v2. CHỈ ĐỌC.
 *
 *   pnpm exec tsx scripts/shadow-report.ts            # cửa sổ 7 ngày (mặc định)
 *   SHADOW_WINDOW_DAYS=5 pnpm exec tsx scripts/shadow-report.ts
 *
 * In ra Markdown (stdout) để đổ thẳng vào $GITHUB_STEP_SUMMARY:
 *   1. Preflight coverage — nhân viên thiếu UserOrgRole ACTIVE (v2 sẽ deny sạch).
 *   2. Lệch theo ngày (giờ VN) + chi tiết theo action trong cửa sổ.
 *   3. Cổng flip #09 — khớp `isSafeToEnableRbacV2()` (lib/auth/shadow-report.ts).
 *
 * KHÔNG ghi gì vào DB. Reset đồng hồ (TRUNCATE) làm tay theo runbook, không ở đây.
 * Cảnh báo (::warning::) đi ra stderr để summary sạch.
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../lib/auth/permissions";
import { isIntentionalMismatch } from "../lib/auth/rbac-intentional";

const db = new PrismaClient();

const WINDOW_DAYS = Number(process.env.SHADOW_WINDOW_DAYS ?? 7);
const TZ = "Asia/Ho_Chi_Minh";

type CoverageRow = { id: string; email: string; role: string; roles: string[] };
type DayRow = { ngay: string; so_lech: number; so_user: number };
type ActionRow = {
  action: string;
  v1: boolean;
  v2: boolean;
  thieu_target: boolean;
  so_lech: number;
  so_user: number;
};

/** Ngày hiện tại theo giờ VN, dạng YYYY-MM-DD (không phụ thuộc TZ của runner). */
function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDay(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Số ngày VN TRỌN VẸN liên tiếp (không tính hôm nay) không có dòng lệch nào. */
function cleanStreak(daysWithDiff: Set<string>): number {
  let streak = 0;
  let cursor = shiftDay(vnToday(), -1);
  while (!daysWithDiff.has(cursor) && streak < 30) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

async function main() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // ── 1. Preflight: nhân viên (≠ PARENT) chưa có UserOrgRole ACTIVE ──────────
  // v2 (lib/auth/actor.ts) lấy quyền DUY NHẤT từ UserOrgRole → RoleDef →
  // RolePermission. Thiếu dòng này ⇒ v2 = false mọi action ⇒ lệch giả tràn bảng,
  // và sau flip #09 người đó mất sạch quyền.
  // AUTH-SĐT P5/P6 — `User.email` nay NULLABLE. Raw SQL không được typecheck bắt,
  // nên nếu cứ `SELECT u.email` thì báo cáo in ra dòng trống và người đọc không
  // biết đang nói về ai. COALESCE sang SĐT rồi id để LUÔN định danh được.
  const coverage = await db.$queryRaw<CoverageRow[]>`
    SELECT u.id, COALESCE(u.email, u.phone, u.id) AS email, u.role::text AS role, u.roles::text[] AS roles
    FROM "User" u
    WHERE u."deletedAt" IS NULL
      AND u."isActive" = true
      AND NOT (u.roles <@ ARRAY['PARENT']::"Role"[])
      AND NOT EXISTS (
        SELECT 1 FROM "UserOrgRole" r
        WHERE r."userId" = u.id
          AND r.status = 'ACTIVE'
          AND r."effectiveFrom" <= now()
          AND (r."effectiveTo" IS NULL OR r."effectiveTo" >= now())
      )
    ORDER BY u.email
  `;

  // ── 2. Lệch theo ngày VN (toàn bộ bảng, để thấy đồng hồ) ───────────────────
  const byDay = await db.$queryRaw<DayRow[]>`
    SELECT to_char("createdAt" AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS ngay,
           COUNT(*)::int AS so_lech,
           COUNT(DISTINCT "userId")::int AS so_user
    FROM "RbacShadowDiff"
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 14
  `;

  // ── 3. Chi tiết theo action trong cửa sổ (để phân loại theo runbook C3) ────
  const byAction = await db.$queryRaw<ActionRow[]>`
    SELECT action, v1, v2,
           ("targetKey" IS NULL) AS thieu_target,
           COUNT(*)::int AS so_lech,
           COUNT(DISTINCT "userId")::int AS so_user
    FROM "RbacShadowDiff"
    WHERE "createdAt" >= ${since}
    GROUP BY 1, 2, 3, 4
    ORDER BY so_lech DESC
    LIMIT 25
  `;

  // ── 3b. Lệch theo NGƯỜI — phân biệt "seed thiếu action" với "actor thiếu UserOrgRole" ──
  // Không có mục này thì mọi lệch v1=true/v2=false trông giống nhau, trong khi nguyên
  // nhân phổ biến nhất lại là actor rỗng quyền ở v2 (chưa được gán UserOrgRole).
  const byUser = await db.$queryRaw<
    { userId: string; email: string | null; so_lech: number; actions: string }[]
  >`
    SELECT d."userId", COALESCE(u.email, u.phone, d."userId") AS email,
           COUNT(*)::int AS so_lech,
           string_agg(DISTINCT d.action, ', ') AS actions
    FROM "RbacShadowDiff" d
    LEFT JOIN "User" u ON u.id = d."userId"
    WHERE d."createdAt" >= ${since}
    GROUP BY d."userId", u.email, u.phone
    ORDER BY so_lech DESC
    LIMIT 20
  `;

  const [{ tong, cu_nhat, moi_nhat }] = await db.$queryRaw<
    { tong: number; cu_nhat: Date | null; moi_nhat: Date | null }[]
  >`SELECT COUNT(*)::int AS tong, MIN("createdAt") AS cu_nhat, MAX("createdAt") AS moi_nhat
    FROM "RbacShadowDiff"`;

  // Đếm THẬT — không cộng từ bảng byAction (bảng đó LIMIT 25 nhóm, cộng lại sẽ THIẾU
  // khi có >25 nhóm; 10/07 từng báo 746 trong khi tổng thật 778). Đây là số cổng flip,
  // phải khớp isSafeToEnableRbacV2.
  const [{ window_total }] = await db.$queryRaw<{ window_total: number }[]>`
    SELECT COUNT(*)::int AS window_total FROM "RbacShadowDiff" WHERE "createdAt" >= ${since}
  `;
  const windowTotal = window_total;

  // ── Phân loại CÓ CHỦ ĐÍCH vs CẦN XỬ LÝ ─────────────────────────────────────
  // Các thu hẹp đã ký (rbac-intentional.ts) làm v1=true/v2=false MỖI LẦN người giữ role
  // bị siết chạm trang — v1 runtime vẫn cấp và UI vẫn hiện nút cho tới flip. Đó là lệch
  // ĐÚNG THIẾT KẾ; cổng flip đếm phần CẦN XỬ LÝ (mismatch v1→v2 ngoài danh sách +
  // toàn bộ chiều ngược v1=false/v2=true).
  const perUserAction = await db.$queryRaw<
    { userId: string; action: string; v1: boolean; v2: boolean; n: number; roles: string[] | null }[]
  >`
    SELECT d."userId", d.action, d.v1, d.v2, COUNT(*)::int AS n,
           u.roles::text[] AS roles
    FROM "RbacShadowDiff" d
    LEFT JOIN "User" u ON u.id = d."userId"
    WHERE d."createdAt" >= ${since}
    GROUP BY d."userId", d.action, d.v1, d.v2, u.roles
  `;
  let intentionalCount = 0;
  const intentionalPairs = new Set<string>();
  for (const r of perUserAction) {
    if (
      r.v1 && !r.v2 &&
      isIntentionalMismatch(r.action, r.roles ?? [], PERMISSIONS as Record<string, readonly string[]>)
    ) {
      intentionalCount += r.n;
      intentionalPairs.add(r.action);
    }
  }
  const mustFixTotal = windowTotal - intentionalCount;
  const streak = cleanStreak(new Set(byDay.map((d) => d.ngay)));
  const coverageOk = coverage.length === 0;

  // ── In Markdown ────────────────────────────────────────────────────────────
  const out: string[] = [];
  out.push(`## Shadow-compare RBAC v1↔v2 — cửa sổ ${WINDOW_DAYS} ngày`);
  out.push("");
  out.push(`- Tổng dòng trong bảng: **${tong}**`);
  out.push(`- Cũ nhất: \`${cu_nhat?.toISOString() ?? "—"}\` · Mới nhất: \`${moi_nhat?.toISOString() ?? "—"}\``);
  out.push(`- Lệch trong cửa sổ: **${windowTotal}** — trong đó **CẦN XỬ LÝ: ${mustFixTotal}**` +
    (intentionalCount > 0
      ? ` · có chủ đích (đã ký, tồn tại tới flip): ${intentionalCount} (${[...intentionalPairs].join(", ")})`
      : ""));
  out.push(`- Ngày VN trọn vẹn liên tiếp sạch (không tính hôm nay): **${streak}**`);
  out.push("");

  out.push(`### 1. Preflight — nhân viên thiếu \`UserOrgRole\` ACTIVE`);
  if (coverageOk) {
    out.push("✅ Không có ai. v2 resolve được quyền cho mọi nhân viên.");
  } else {
    out.push(
      `🔴 **${coverage.length} người** — v2 deny sạch với họ. ĐỒNG HỒ KHÔNG HỢP LỆ cho tới khi gán xong,` +
        ` và flip #09 sẽ KHOÁ những tài khoản này.`,
    );
    out.push("");
    out.push("| email | role (v1) | roles[] |");
    out.push("|---|---|---|");
    for (const u of coverage) out.push(`| ${u.email} | ${u.role} | ${u.roles.join(", ")} |`);
  }
  out.push("");

  out.push("### 2. Lệch theo ngày (giờ VN)");
  if (byDay.length === 0) {
    out.push("Bảng trống. ⚠️ Trống vì *không ai dùng prod* ≠ đã kiểm chứng — xem mục traffic trong plan #01.");
  } else {
    out.push("| ngày | số lệch | số user |");
    out.push("|---|---:|---:|");
    for (const d of byDay) out.push(`| ${d.ngay} | ${d.so_lech} | ${d.so_user} |`);
  }
  out.push("");

  out.push(`### 3. Chi tiết theo action (trong ${WINDOW_DAYS} ngày)`);
  if (byAction.length === 0) {
    out.push("Không có lệch.");
  } else {
    out.push("| action | v1 | v2 | thiếu target | số lệch | số user |");
    out.push("|---|:--:|:--:|:--:|---:|---:|");
    for (const r of byAction) {
      out.push(
        `| \`${r.action}\` | ${r.v1 ? "✔" : "✘"} | ${r.v2 ? "✔" : "✘"} | ${r.thieu_target ? "✔" : "✘"} |` +
          ` ${r.so_lech} | ${r.so_user} |`,
      );
    }
    out.push("");
    out.push("> Đọc mục 3b TRƯỚC khi kết luận. `v1=true, v2=false` có 3 nguyên nhân khác hẳn nhau:");
    out.push("> (a) actor chưa có `UserOrgRole` → v2 rỗng quyền (phổ biến nhất, xem cột *thiếu UserOrgRole*);");
    out.push("> (b) `seed-roles.ts` thiếu action cho role → sửa seed + re-seed + TRUNCATE;");
    out.push("> (c) gate check chạy trước khi có `target` ở action CENTER-scope → sửa call-site truyền `target`.");
  }
  out.push("");

  out.push(`### 3b. Lệch theo người (trong ${WINDOW_DAYS} ngày)`);
  if (byUser.length === 0) {
    out.push("Không có lệch.");
  } else {
    const gapIds = new Set(coverage.map((u) => u.id));
    out.push("| email | thiếu UserOrgRole | số lệch | action |");
    out.push("|---|:--:|---:|---|");
    for (const r of byUser) {
      const gap = gapIds.has(r.userId);
      out.push(`| ${r.email ?? `(userId ${r.userId})`} | ${gap ? "🔴 CÓ" : "—"} | ${r.so_lech} | ${r.actions} |`);
    }
    out.push("");
    out.push("> Dòng có 🔴: lệch chỉ vì actor rỗng quyền ở v2. Gán `UserOrgRole` xong là hết — **không** phải sửa seed/call-site.");
  }
  out.push("");

  out.push("### Cổng flip #09");
  const verdict = !coverageOk
    ? "🔴 **CHẶN** — preflight coverage đỏ, đồng hồ chưa được phép chạy."
    : mustFixTotal === 0
      ? `🟢 lệch CẦN XỬ LÝ = 0${intentionalCount > 0 ? ` (${intentionalCount} lệch có chủ đích — sẽ tự hết sau flip)` : ""}. Đủ điều kiện chạy smoke 8 vai trò.`
      : `🔴 còn **${mustFixTotal}** lệch CẦN XỬ LÝ — phân loại theo bảng trên, sửa xong thì TRUNCATE và đếm lại.`;
  out.push(verdict);

  console.log(out.join("\n"));

  if (!coverageOk) {
    console.error(`::warning::Preflight ĐỎ — ${coverage.length} nhân viên thiếu UserOrgRole ACTIVE`);
  }
  if (mustFixTotal > 0) {
    console.error(`::warning::Còn ${mustFixTotal} lệch CẦN XỬ LÝ trong ${WINDOW_DAYS} ngày — chưa đủ điều kiện flip #09`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
