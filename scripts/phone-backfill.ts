/**
 * AUTH-SĐT P1 — Backfill SĐT về canonical `84XXXXXXXXX`.
 *
 *   pnpm phone:backfill            # DRY-RUN: chỉ in ra sẽ đổi gì, KHÔNG ghi
 *   pnpm phone:backfill --apply    # ghi thật
 *
 * ⚠️ Mặc định là DRY-RUN. Phải truyền `--apply` mới ghi.
 *
 * KHÔNG đụng `Order.customerPhone` và `VoucherRedemption.customerPhone`:
 * đó là **snapshot hoá đơn**, cố ý giữ nguyên văn tại thời điểm phát hành —
 * sửa lại là sửa chứng từ. Cũng không đụng các cột log (`ZaloMessageLog.toPhone`,
 * `OtpRequest.target`) vì chúng ghi lại **sự việc đã xảy ra**.
 *
 * ── Vì sao script này KHÔNG phải chạy cùng deploy ──
 * Kế hoạch gốc (QĐ-4) bắt backfill nằm cùng deploy với việc đổi đường ghi, nếu
 * không thì dedupe gãy âm thầm ngay ngày deploy. Ràng buộc đó đã được gỡ: mọi
 * đường ĐỌC theo SĐT nay dùng `phoneVariants()` nên khớp được cả `84…` lẫn `0…`.
 * Backfill vì thế là việc **dọn dẹp**, chạy lúc nào cũng được, và chạy lại nhiều
 * lần cũng vô hại (idempotent).
 */
// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { db } from "../lib/db";
import { canonicalPhone } from "../lib/phone";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

type Change = { id: string; field: string; from: string; to: string };

function planChange(id: string, field: string, value: string | null): Change | null {
  if (!value || !value.trim()) return null;
  const c = canonicalPhone(value);
  if (!c || c === value) return null; // đã canonical, hoặc rác không sửa tự động được
  return { id, field, from: value, to: c };
}

async function main() {
  console.log(`\n═══ PHONE BACKFILL ${APPLY ? "(GHI THẬT)" : "(DRY-RUN — không ghi gì)"} ═══`);
  console.log(`DB host: ${currentDbHost()}\n`);

  const [leads, students, employees] = await Promise.all([
    db.lead.findMany({ where: { deletedAt: null }, select: { id: true, phone: true } }),
    db.student.findMany({
      where: { deletedAt: null },
      select: { id: true, phone: true, parentPhone: true, parent2Phone: true },
    }),
    db.employee.findMany({ select: { id: true, phone: true } }),
  ]);

  const leadChanges = leads
    .map((l) => planChange(l.id, "phone", l.phone))
    .filter((c): c is Change => c !== null);

  const studentChanges: Change[] = [];
  for (const s of students) {
    for (const f of ["phone", "parentPhone", "parent2Phone"] as const) {
      const c = planChange(s.id, f, s[f]);
      if (c) studentChanges.push(c);
    }
  }

  // Employee.phone là trường TỰ DO (có thể là số bàn cơ sở) → chỉ đổi khi
  // canonicalPhone nhận ra là di động; số cố định giữ nguyên, không phá.
  const employeeChanges = employees
    .map((e) => planChange(e.id, "phone", e.phone))
    .filter((c): c is Change => c !== null);

  console.log(`Lead.phone:      ${leadChanges.length} bản ghi sẽ đổi`);
  console.log(`Student.*:       ${studentChanges.length} trường sẽ đổi`);
  console.log(`Employee.phone:  ${employeeChanges.length} bản ghi sẽ đổi\n`);

  const sample = [...leadChanges, ...studentChanges, ...employeeChanges].slice(0, 15);
  if (sample.length) {
    console.log("── Mẫu 15 thay đổi đầu ──");
    for (const c of sample) console.log(`   ${c.field}: ${c.from} → ${c.to}`);
    console.log();
  }

  if (!APPLY) {
    console.log("DRY-RUN — chưa ghi gì. Chạy lại với `--apply` để ghi thật.\n");
    return;
  }

  let done = 0;
  const runBatch = async (changes: Change[], write: (c: Change) => Promise<unknown>) => {
    for (let i = 0; i < changes.length; i += BATCH) {
      const slice = changes.slice(i, i + BATCH);
      await Promise.all(slice.map(write));
      done += slice.length;
      console.log(`   … đã ghi ${done}`);
    }
  };

  await runBatch(leadChanges, (c) =>
    db.lead.update({ where: { id: c.id }, data: { phone: c.to } }),
  );
  await runBatch(studentChanges, (c) =>
    db.student.update({ where: { id: c.id }, data: { [c.field]: c.to } }),
  );
  await runBatch(employeeChanges, (c) =>
    db.employee.update({ where: { id: c.id }, data: { phone: c.to } }),
  );

  console.log(`\n✓ Xong — đã cập nhật ${done} trường.`);
  console.log("Chạy lại `pnpm phone:audit` để xác nhận cột 'Dạng cũ' về 0.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
