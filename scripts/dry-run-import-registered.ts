// Task #07 Việc 1 — dry-run parser import danh sách "khách ĐÃ ĐĂNG KÝ" trên file
// Excel thật + DB hiện tại (KHÔNG ghi gì — chỉ parse + plan + in số liệu).
//
// Chạy:  pnpm tsx scripts/dry-run-import-registered.ts "D:\...\Satarobo - Danh sách đăng ký.xlsx"
//
// DB lấy theo DATABASE_URL trong .env (Prisma tự load). SĐT in ra được che bớt (PII).
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import {
  parseRegisteredSheets,
  planRegisteredImport,
  buildCourseKeyMap,
  type SheetAoA,
  type CellValue,
  type ExistingLead,
} from "../lib/lead/import-registered";

const maskPhone = (p: string) => (p.length >= 7 ? `${p.slice(0, 4)}***${p.slice(-3)}` : p);

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Cách dùng: pnpm tsx scripts/dry-run-import-registered.ts <file.xlsx>");
    process.exit(1);
  }

  const wb = XLSX.readFile(filePath); // không cellDates — parser tự xử lý serial
  const sheets: SheetAoA[] = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[name], {
      header: 1,
      defval: null,
      raw: true,
    }),
  }));

  const parsed = parseRegisteredSheets(sheets);

  const db = new PrismaClient();
  const phones = parsed.parents.map((p) => p.phone);
  const [centers, orgUnits, courses, users, existingLeads] = await Promise.all([
    db.center.findMany({ where: { code: { not: null } }, select: { id: true, code: true } }),
    db.orgUnit.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    db.course.findMany({ select: { id: true, name: true, slug: true } }),
    db.user.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, role: true, roles: true },
    }),
    phones.length > 0
      ? db.lead.findMany({
          where: { phone: { in: phones }, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true, parentName: true, phone: true, status: true, note: true,
            centerId: true, orgUnitId: true, courseId: true, assignedToId: true,
            children: {
              select: {
                id: true, fullName: true, gradeLevel: true, note: true,
                interestedCourseId: true, interestedCenterId: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  await db.$disconnect();

  const existingByPhone = new Map<string, ExistingLead>();
  for (const l of existingLeads) {
    if (!existingByPhone.has(l.phone)) existingByPhone.set(l.phone, l as ExistingLead);
  }

  const plan = planRegisteredImport(parsed, {
    centerByCode: new Map(centers.filter((c) => c.code).map((c) => [c.code as string, c.id])),
    orgUnitByCode: new Map(orgUnits.filter((o) => o.code).map((o) => [o.code, o.id])),
    courseByKey: buildCourseKeyMap(courses),
    salesUsers: users.map((u) => ({
      id: u.id,
      name: u.name,
      roles: [...new Set([u.role, ...u.roles])],
    })),
    existingByPhone,
  });

  const changed = plan.merges.filter((m) => m.changed);
  console.log("── DRY-RUN import danh sách ĐÃ ĐĂNG KÝ ─────────────────────");
  console.log(`File: ${filePath}`);
  console.log(`Sheet: ${wb.SheetNames.join(" · ")}`);
  console.log(`Tổng dòng dữ liệu đã đọc : ${parsed.totalDataRows}`);
  console.log(`Bỏ qua (dòng trống)      : ${parsed.skippedEmpty}`);
  console.log(`Hợp lệ                   : ${parsed.validRows}`);
  console.log(`Lặp giữa sheet (đã gộp)  : ${parsed.mergedDuplicateRows}`);
  console.log(`Lỗi                      : ${parsed.errors.length}`);
  for (const e of parsed.errors) console.log(`  - [${e.sheet}] dòng ${e.row}: ${e.reason}`);
  console.log(`Phụ huynh (lead)         : ${parsed.parents.length}`);
  console.log(`Học viên (con)           : ${parsed.parents.reduce((n, p) => n + p.children.length, 0)}`);
  const multi = parsed.parents.filter((p) => p.children.length > 1);
  console.log(`PH nhiều con             : ${multi.length}`);
  for (const p of multi) console.log(`  - ${maskPhone(p.phone)}: ${p.children.length} con`);
  console.log(`Sẽ TẠO lead mới          : ${plan.creates.length}`);
  console.log(`Sẽ GỘP vào lead có sẵn   : ${plan.merges.length} (có thay đổi: ${changed.length})`);
  for (const m of plan.merges) {
    console.log(`  - ${maskPhone(m.phone)} → lead ${m.leadId} (+${m.newChildren.length} con, ${m.changed ? "có" : "không"} thay đổi)`);
  }
  console.log(`Sales không khớp user    : ${plan.unmatchedSales.join(", ") || "(không)"}`);
  console.log(`Khoá không khớp          : ${plan.unmatchedCourses.join(", ") || "(không)"}`);
  console.log(`Cơ sở không khớp         : ${plan.unmatchedCenters.join(", ") || "(không)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
