/**
 * P2-4 — Dọn dữ liệu test ZZTEST_ AN TOÀN.
 *
 *   pnpm exec tsx scripts/cleanup-zztest.ts          # DRY-RUN (mặc định) — chỉ liệt kê
 *   pnpm exec tsx scripts/cleanup-zztest.ts --apply  # thực thi
 *
 * Nguyên tắc:
 *  - Mặc định DRY-RUN, KHÔNG đổi DB.
 *  - Chỉ đụng record có tiền tố `ZZTEST_` ở name/code/email/phone/note.
 *  - Order/hoá đơn test → CANCELLED (archive), KHÔNG hard delete.
 *  - Lead/Student/User/Class có deletedAt → soft delete. Enrollment → CANCELLED.
 *  - KHÔNG đụng record thật.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const P = "ZZTEST_";
const now = new Date();

type Plan = { model: string; count: number; action: string; ids: string[] };

async function main() {
  console.log(`\n🧹 Cleanup ZZTEST_ — chế độ: ${APPLY ? "APPLY (thực thi)" : "DRY-RUN (chỉ liệt kê)"}\n`);
  const plans: Plan[] = [];

  // ─── Lead ──────────────────────────────────────────────────────────────
  const leads = await db.lead.findMany({
    where: {
      deletedAt: null,
      OR: [
        { parentName: { startsWith: P } },
        { childName: { startsWith: P } },
        { phone: { startsWith: P } },
        { email: { startsWith: P } },
        { note: { contains: P } },
      ],
    },
    select: { id: true },
  });
  plans.push({ model: "Lead", count: leads.length, action: "soft delete (deletedAt)", ids: leads.map((x) => x.id) });

  // ─── Student ───────────────────────────────────────────────────────────
  const students = await db.student.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { startsWith: P } },
        { studentCode: { startsWith: P } },
        { parentName: { startsWith: P } },
        { parentPhone: { startsWith: P } },
        { parentEmail: { startsWith: P } },
      ],
    },
    select: { id: true },
  });
  plans.push({ model: "Student", count: students.length, action: "soft delete (deletedAt)", ids: students.map((x) => x.id) });

  // ─── User (phụ huynh test) ───────────────────────────────────────────────
  const users = await db.user.findMany({
    where: {
      deletedAt: null,
      role: "PARENT",
      OR: [{ name: { startsWith: P } }, { email: { startsWith: P } }],
    },
    select: { id: true },
  });
  plans.push({ model: "User(PARENT)", count: users.length, action: "soft delete (deletedAt)", ids: users.map((x) => x.id) });

  // ─── Class ─────────────────────────────────────────────────────────────
  const classes = await db.class.findMany({
    where: {
      deletedAt: null,
      OR: [{ name: { startsWith: P } }, { classCode: { startsWith: P } }],
    },
    select: { id: true },
  });
  plans.push({ model: "Class", count: classes.length, action: "soft delete (deletedAt)", ids: classes.map((x) => x.id) });

  // ─── Enrollment (theo student test) ──────────────────────────────────────
  const enrollments = await db.enrollment.findMany({
    where: { status: { notIn: ["CANCELLED"] }, studentId: { in: students.map((s) => s.id) } },
    select: { id: true },
  });
  plans.push({ model: "Enrollment", count: enrollments.length, action: "status → CANCELLED", ids: enrollments.map((x) => x.id) });

  // ─── Order (hoá đơn test) → CANCELLED, KHÔNG xoá ─────────────────────────
  const orders = await db.order.findMany({
    where: {
      status: { notIn: ["CANCELLED"] },
      OR: [
        { code: { startsWith: P } },
        { customerName: { startsWith: P } },
        { customerPhone: { startsWith: P } },
        { customerEmail: { startsWith: P } },
        { studentId: { in: students.map((s) => s.id) } },
      ],
    },
    select: { id: true },
  });
  plans.push({ model: "Order", count: orders.length, action: "status → CANCELLED (archive)", ids: orders.map((x) => x.id) });

  // ─── In kế hoạch ─────────────────────────────────────────────────────────
  let total = 0;
  for (const p of plans) {
    total += p.count;
    console.log(`  • ${p.model.padEnd(14)} ${String(p.count).padStart(4)}  → ${p.action}`);
    if (p.count > 0 && p.count <= 20) console.log(`      ids: ${p.ids.join(", ")}`);
  }
  console.log(`\n  Tổng: ${total} bản ghi khớp ZZTEST_.\n`);

  if (!APPLY) {
    console.log("ℹ️  DRY-RUN — chưa thay đổi gì. Chạy lại với --apply để thực thi.\n");
    return;
  }

  // ─── Thực thi (chỉ khi --apply) ───────────────────────────────────────────
  if (leads.length)
    await db.lead.updateMany({ where: { id: { in: leads.map((x) => x.id) } }, data: { deletedAt: now } });
  if (students.length)
    await db.student.updateMany({ where: { id: { in: students.map((x) => x.id) } }, data: { deletedAt: now } });
  if (users.length)
    await db.user.updateMany({ where: { id: { in: users.map((x) => x.id) } }, data: { deletedAt: now, isActive: false } });
  if (classes.length)
    await db.class.updateMany({ where: { id: { in: classes.map((x) => x.id) } }, data: { deletedAt: now } });
  if (enrollments.length)
    await db.enrollment.updateMany({ where: { id: { in: enrollments.map((x) => x.id) } }, data: { status: "CANCELLED" } });
  if (orders.length)
    await db.order.updateMany({
      where: { id: { in: orders.map((x) => x.id) } },
      data: { status: "CANCELLED", internalNote: "Dọn dữ liệu test ZZTEST_" },
    });

  console.log(`✅ Đã xử lý ${total} bản ghi ZZTEST_ (soft delete / archive). KHÔNG hard delete.\n`);
}

main()
  .catch((e) => {
    console.error("❌ Lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
