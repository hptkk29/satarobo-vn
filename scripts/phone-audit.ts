/**
 * AUTH-SĐT P1 — BÁO CÁO CHỈ ĐỌC về hiện trạng dữ liệu SĐT.
 *
 * Script này **KHÔNG GHI GÌ**. Chạy được trên PROD an toàn, và PHẢI chạy trên
 * PROD trước khi chốt lịch P5: cả kế hoạch AUTH-SĐT có 3 ẩn số không suy ra
 * được từ code, script này đo 2 trong 3.
 *
 *   pnpm phone:audit
 *
 * Đọc: Lead.phone · Student.parentPhone/parent2Phone/phone · Employee.phone ·
 * User (qua Student.parentUserId) · ConvertConflict.
 * KHÔNG đọc/đụng Order.customerPhone và VoucherRedemption.customerPhone —
 * chúng là **snapshot hoá đơn**, cố ý giữ nguyên văn lịch sử.
 */
import { db } from "../lib/db";
import { canonicalPhone } from "../lib/phone";

type Row = { label: string; total: number; canonical: number; legacy: number; invalid: number };

function classify(values: (string | null)[]): Omit<Row, "label"> {
  let canonical = 0;
  let legacy = 0;
  let invalid = 0;
  for (const v of values) {
    if (!v || !v.trim()) continue;
    const c = canonicalPhone(v);
    if (!c) invalid++;
    else if (v === c) canonical++;
    else legacy++;
  }
  return { total: values.filter((v) => v && v.trim()).length, canonical, legacy, invalid };
}

/** Gom theo SĐT canonical → các nhóm có >1 bản ghi là ứng viên trùng. */
function groupByCanonical<T>(rows: T[], pick: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const c = canonicalPhone(pick(r));
    if (!c) continue;
    const arr = m.get(c);
    if (arr) arr.push(r);
    else m.set(c, [r]);
  }
  return m;
}

function normName(s: string | null): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(`\n═══ PHONE AUDIT (CHỈ ĐỌC) ═══`);
  console.log(`DB host: ${host || "(không đọc được DATABASE_URL)"}\n`);

  const [leads, students, employees] = await Promise.all([
    db.lead.findMany({
      where: { deletedAt: null },
      select: { id: true, phone: true, parentName: true, centerId: true, createdAt: true },
    }),
    db.student.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        parentPhone: true,
        parent2Phone: true,
        parentName: true,
        parentUserId: true,
      },
    }),
    db.employee.findMany({ select: { id: true, phone: true } }),
  ]);

  // ── 1. Phân bố định dạng ────────────────────────────────────────────────
  const rows: Row[] = [
    { label: "Lead.phone", ...classify(leads.map((l) => l.phone)) },
    { label: "Student.parentPhone", ...classify(students.map((s) => s.parentPhone)) },
    { label: "Student.parent2Phone", ...classify(students.map((s) => s.parent2Phone)) },
    { label: "Student.phone", ...classify(students.map((s) => s.phone)) },
    { label: "Employee.phone", ...classify(employees.map((e) => e.phone)) },
  ];
  console.log("── 1. Định dạng hiện tại ──");
  console.table(
    rows.map((r) => ({
      Cột: r.label,
      "Có dữ liệu": r.total,
      "Đã canonical (84…)": r.canonical,
      "Dạng cũ (cần backfill)": r.legacy,
      "KHÔNG chuẩn hoá được": r.invalid,
    })),
  );
  const totalLegacy = rows.reduce((a, r) => a + r.legacy, 0);
  const totalInvalid = rows.reduce((a, r) => a + r.invalid, 0);
  console.log(`→ Tổng cần backfill: ${totalLegacy} · Tổng rác phải sửa tay: ${totalInvalid}\n`);

  // ── 2. Trùng SĐT sau canonical (quyết định P5 mất mấy ngày dọn tay) ─────
  const leadGroups = [...groupByCanonical(leads, (l) => l.phone)].filter(([, v]) => v.length > 1);
  const studentGroups = [...groupByCanonical(students, (s) => s.parentPhone)].filter(
    ([, v]) => v.length > 1,
  );
  console.log("── 2. Nhóm TRÙNG sau khi canonical ──");
  console.log(`Lead trùng SĐT:    ${leadGroups.length} nhóm`);
  console.log(`Student cùng parentPhone: ${studentGroups.length} nhóm (bình thường — anh chị em)\n`);

  // ── 3. 1 SĐT → NHIỀU User phụ huynh (chặn `User.phone @unique` ở P3) ────
  const parentByPhone = new Map<string, Set<string>>();
  for (const s of students) {
    const c = canonicalPhone(s.parentPhone);
    if (!c || !s.parentUserId) continue;
    const set = parentByPhone.get(c) ?? new Set<string>();
    set.add(s.parentUserId);
    parentByPhone.set(c, set);
  }
  const multiUser = [...parentByPhone].filter(([, set]) => set.size > 1);
  console.log("── 3. 🔴 1 SĐT trỏ NHIỀU tài khoản phụ huynh ──");
  console.log(`${multiUser.length} trường hợp — mỗi cái CHẶN migration \`User.phone @unique\` ở P3.`);
  for (const [phone, set] of multiUser.slice(0, 20)) {
    console.log(`   ${phone} → ${set.size} User: ${[...set].join(", ")}`);
  }
  if (multiUser.length > 20) console.log(`   … còn ${multiUser.length - 20} trường hợp nữa`);
  console.log();

  // ── 4. Cùng SĐT nhưng KHÁC TÊN phụ huynh (§8 — QĐ-A "1 SĐT = 1 hộ") ─────
  // Mỗi nhóm ở đây là một CẶP GIA ĐÌNH sẽ nhìn thấy con của nhau nếu gộp nhầm.
  const nameConflicts: { phone: string; names: string[]; source: string }[] = [];
  for (const [phone, group] of groupByCanonical(leads, (l) => l.phone)) {
    const names = [...new Set(group.map((l) => normName(l.parentName)).filter(Boolean))];
    if (names.length > 1) nameConflicts.push({ phone, names, source: "Lead" });
  }
  for (const [phone, group] of groupByCanonical(students, (s) => s.parentPhone)) {
    const names = [...new Set(group.map((s) => normName(s.parentName)).filter(Boolean))];
    if (names.length > 1) nameConflicts.push({ phone, names, source: "Student" });
  }
  console.log("── 4. 🔴 Cùng SĐT nhưng KHÁC TÊN phụ huynh ──");
  console.log(
    `${nameConflicts.length} nhóm — QĐ-A chốt "1 SĐT = 1 hộ", nên mỗi nhóm là một cặp gia đình\n` +
      `   sẽ NHÌN THẤY CON CỦA NHAU nếu gộp nhầm. PHẢI duyệt tay từng cái trước P5.`,
  );
  for (const c of nameConflicts.slice(0, 20)) {
    console.log(`   [${c.source}] ${c.phone} → ${c.names.join(" | ")}`);
  }
  if (nameConflicts.length > 20) console.log(`   … còn ${nameConflicts.length - 20} nhóm nữa`);
  console.log();

  // ── 5. ConvertConflict còn mở (điều kiện vào P5) ────────────────────────
  const openConflicts = await db.convertConflict.count({ where: { status: "OPEN" } });
  console.log("── 5. ConvertConflict OPEN ──");
  console.log(`${openConflicts} — phải về 0 trước khi vào P5.\n`);

  console.log("═══ TÓM TẮT ═══");
  console.log(`Cần backfill:                 ${totalLegacy}`);
  console.log(`Rác phải sửa tay:             ${totalInvalid}`);
  console.log(`1 SĐT → nhiều User (CHẶN P3): ${multiUser.length}`);
  console.log(`Cùng SĐT khác tên PH:         ${nameConflicts.length}`);
  console.log(`ConvertConflict OPEN:         ${openConflicts}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
