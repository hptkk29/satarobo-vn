/**
 * SataRobo — Import lead cũ (4 sheet sale) vào PROD
 * Đã khớp schema thật khảo sát ngày 27/08/2026.
 *
 * Cài:  npm i -D tsx csv-parse
 * Chạy: npx tsx scripts/import-legacy-leads.ts                     # DRY RUN
 *       npx tsx scripts/import-legacy-leads.ts --commit --limit=20 # thử 20 dòng
 *       npx tsx scripts/import-legacy-leads.ts --commit            # chạy hết
 *
 * QUY ƯỚC ĐÃ CHỐT (đừng sửa nếu chưa hiểu lý do):
 *  - phone ghi dạng 84xxxxxxxxx, KHÔNG có số 0 đầu — đúng quy ước PROD.
 *  - source = 'legacy-sheet' cho cả đợt; nguồn gốc chi tiết nằm trong note.
 *  - note bắt đầu bằng [LEGACY-xxxx] — đây là khoá chống chạy trùng, vì bảng
 *    Lead KHÔNG có cột legacyKey và KHÔNG có unique index trên phone.
 *  - Bỏ qua nếu SĐT đã có ở Lead / Student / Order. Không bao giờ ghi đè.
 *  - Khoá quan tâm ghi vào expectedCourseId; TUYỆT ĐỐI không đụng courseId
 *    (courseId chỉ set khi lead đã chuyển đổi thành học viên).
 */

import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import fs from 'node:fs';

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const FILE = (argv.find((a) => a.startsWith('--file=')) ?? '--file=staging_leads.csv').split('=')[1];
const LIMIT = Number((argv.find((a) => a.startsWith('--limit=')) ?? '--limit=0').split('=')[1]);

// ── Map đã xác nhận từ PROD ────────────────────────────────────────────
const SALE_MAP: Record<string, string> = {
  'Ms Diệu': 'cmrd3x31h00079xkd9tmqz5d4', // Huỳnh Thị Diệu — CS1
  'Ms Hạ':   'cmrd3t3y9000mm1lawkthdig1', // Nguyễn Thị Lộc — CS1 (Hạ = Lộc)
  'Ms Liên': 'cmrd3qm0s000em1lag3ait8hk', // Lê Thị Phương Liên — CS2
  'Ms Vân':  'cmrd3ugi3000uvmwv2domge49', // Tô Thị Thuý Vân — CS2
};

const CENTER_MAP: Record<string, string> = {
  CS1: 'co-so-nguyen-huu-tho',
  CS2: 'co-so-hoang-dieu',
};

const COURSE_MAP: Record<string, string> = {
  Sata3: 'cmpqrne4n000461mh148jyxqm',
  Sata4: 'cmpqrneh8000561mhulh2a1p6',
  Sata5: 'cmpqrnetp000661mhbcggybx2',
  Sata6: 'cmpqrnf6c000761mhgz17lpin',
  Sata7: 'cmpqrnfit000861mh0sgqqj5g',
};

// trang_thai_lead trong CSV -> enum LeadStatus
const STATUS_MAP: Record<string, string> = {
  'Đã đăng ký':      'REGISTERED',
  'Đã học thử':      'TRIAL_ATTENDED',
  'Đã hẹn học thử':  'TRIAL_SCHEDULED',
  'Đang nuôi dưỡng': 'NURTURING',
  'Đã mất':          'LOST',
};

// >>> CHẠY QUERY 4.1 RỒI ĐIỀN ĐÚNG GIÁ TRỊ ENUM trialStatus CỦA LeadChild <<<
const CHILD_TRIAL_DEFAULT = 'NOT_STARTED';

type Row = {
  ma_import: string; phone_norm: string; phone_84: string;
  ten_ph: string; ten_con: string; nguon: string;
  khoa_quan_tam: string; lop_tuoi_goc: string;
  trang_thai_hoc_thu: string; trang_thai_lead: string;
  ma_co_so: string; sale: string; ngay_nhan_lead: string;
  ghi_chu: string; canh_bao: string;
};

const to84 = (v: string) => {
  let d = (v ?? '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(d)) d = '84' + d.slice(1);
  if (/^\d{9}$/.test(d)) d = '84' + d;
  return d;
};
const valid84 = (d: string) => /^84\d{9}$/.test(d);

const parseDate = (v: string): Date | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((v ?? '').trim());
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
};

/** Chỉ map khi suy ra ĐÚNG MỘT khoá. "Sata4 / Sata3" -> null, để sale tự chọn. */
const courseId = (v: string): string | null => {
  const parts = (v ?? '').split('/').map((s) => s.trim()).filter(Boolean);
  return parts.length === 1 ? COURSE_MAP[parts[0]] ?? null : null;
};

async function preflight() {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT e.enumlabel AS v FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid AND c.relname = 'LeadChild'
    JOIN pg_type  t ON t.oid = a.atttypid
    JOIN pg_enum  e ON e.enumtypid = t.oid
    WHERE a.attname = 'trialStatus'`);
  const labels = rows.map((r) => r.v);
  if (!labels.includes(CHILD_TRIAL_DEFAULT)) {
    throw new Error(
      `CHILD_TRIAL_DEFAULT='${CHILD_TRIAL_DEFAULT}' không hợp lệ.\n` +
      `Giá trị hợp lệ của LeadChild.trialStatus: ${labels.join(' | ')}`,
    );
  }
  for (const [k, v] of Object.entries(CENTER_MAP)) {
    if (!(await prisma.center.findUnique({ where: { id: v } })))
      throw new Error(`Không tìm thấy Center '${v}' (${k})`);
  }
  for (const [k, v] of Object.entries(SALE_MAP)) {
    const u = await prisma.user.findUnique({ where: { id: v }, select: { name: true } });
    if (!u) throw new Error(`Không tìm thấy User '${v}' (${k})`);
    console.log(`  ${k.padEnd(9)} -> ${u.name}`);
  }
  console.log('');
}

async function main() {
  let rows: Row[] = parse(fs.readFileSync(FILE, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  });
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);

  console.log(`\nChế độ : ${COMMIT ? '*** GHI THẬT (--commit) ***' : 'DRY RUN'}`);
  console.log(`File   : ${FILE} — ${rows.length} dòng\n`);
  console.log('Kiểm tra map:');
  await preflight();

  const st = { taoMoi: 0, coLead: 0, laHocVien: 0, coDonHang: 0, trungFile: 0, daImport: 0, sdtLoi: 0, loi: 0 };
  const seen = new Set<string>();
  const errs: string[] = [];

  for (const r of rows) {
    const phone = to84(r.phone_84 || r.phone_norm);
    if (!valid84(phone)) { st.sdtLoi++; continue; }
    if (seen.has(phone)) { st.trungFile++; continue; }
    seen.add(phone);

    // chống chạy lại: note đã mang dấu [LEGACY-xxxx]
    if (await prisma.lead.findFirst({
          where: { note: { startsWith: `[${r.ma_import}]` } }, select: { id: true } })) {
      st.daImport++; continue;
    }

    const lead = await prisma.lead.findFirst({
      where: { phone, deletedAt: null }, select: { id: true, parentName: true } });
    if (lead) {
      st.coLead++;
      console.log(`  [đã có lead]  ${phone}  ${r.ten_ph}  ->  ${lead.parentName}`);
      continue;
    }

    if (await prisma.student.count({
          where: { OR: [{ parentPhone: phone }, { parent2Phone: phone }, { phone }] } })) {
      st.laHocVien++; console.log(`  [đã là HV]    ${phone}  ${r.ten_ph}`); continue;
    }

    if (await prisma.order.count({ where: { customerPhone: phone } })) {
      st.coDonHang++; console.log(`  [có đơn hàng] ${phone}  ${r.ten_ph}`); continue;
    }

    const center = CENTER_MAP[r.ma_co_so];
    const owner  = SALE_MAP[r.sale];
    if (!center || !owner) {
      st.loi++; errs.push(`${r.ma_import}: thiếu map "${r.ma_co_so}" / "${r.sale}"`); continue;
    }

    const cid = courseId(r.khoa_quan_tam);
    const note =
      `[${r.ma_import}] Nguồn gốc: ${r.nguon || 'không rõ'}` +
      (r.khoa_quan_tam ? ` | Khoá gợi ý: ${r.khoa_quan_tam}` : '') +
      (r.ghi_chu ? ` | ${r.ghi_chu}` : '');

    if (!COMMIT) { st.taoMoi++; continue; }

    try {
      await prisma.$transaction(async (tx) => {
        const nl = await tx.lead.create({
          data: {
            phone,
            parentName: r.ten_ph || `PH của ${r.ten_con || phone}`,
            childName: r.ten_con || null,
            status: (STATUS_MAP[r.trang_thai_lead] ?? 'NURTURING') as any,
            source: 'legacy-sheet',
            centerId: center,
            assignedToId: owner,
            expectedCourseId: cid,
            note,
            createdAt: parseDate(r.ngay_nhan_lead) ?? new Date(),
            updatedAt: new Date(),
          },
          select: { id: true },
        });
        if (r.ten_con) {
          await tx.leadChild.create({
            data: {
              leadId: nl.id,
              fullName: r.ten_con,
              gradeLevel: r.lop_tuoi_goc || null,
              interestedCourseId: cid,
              interestedCenterId: center,
              trialStatus: CHILD_TRIAL_DEFAULT as any,
              note: r.trang_thai_hoc_thu || null,
            },
          });
        }
      });
      st.taoMoi++;
    } catch (e: any) {
      st.loi++; errs.push(`${r.ma_import} ${phone}: ${e.message}`);
    }
  }

  console.log('\n──────────── KẾT QUẢ ────────────');
  console.log(`  Tạo mới              : ${st.taoMoi}${COMMIT ? '' : '  (dry run)'}`);
  console.log(`  Bỏ — đã có lead      : ${st.coLead}`);
  console.log(`  Bỏ — đã là học viên  : ${st.laHocVien}`);
  console.log(`  Bỏ — đã có đơn hàng  : ${st.coDonHang}`);
  console.log(`  Bỏ — đã import trước : ${st.daImport}`);
  console.log(`  Bỏ — trùng trong file: ${st.trungFile}`);
  console.log(`  Bỏ — SĐT lỗi         : ${st.sdtLoi}`);
  console.log(`  Lỗi                  : ${st.loi}`);
  if (errs.length) {
    console.log('\nLỗi chi tiết:');
    errs.slice(0, 50).forEach((e) => console.log('  - ' + e));
  }
  console.log('─────────────────────────────────\n');
}

main()
  .catch((e) => { console.error('\n' + e.message + '\n'); process.exit(1); })
  .finally(() => prisma.$disconnect());
