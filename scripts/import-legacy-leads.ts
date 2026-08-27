/**
 * SataRobo — Nhập 795 lead cũ (4 sheet của 4 sale) vào CRM.
 *
 *   pnpm import:legacy-leads                          # DRY RUN (mặc định — không ghi gì)
 *   pnpm import:legacy-leads -- --chi-kiem-file       # chỉ soi file CSV, KHÔNG chạm DB
 *   pnpm import:legacy-leads -- --commit --limit=20   # ghi thật 20 dòng đầu
 *   pnpm import:legacy-leads -- --commit              # ghi thật toàn bộ
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUY ƯỚC ĐÃ CHỐT — ĐỪNG SỬA NẾU CHƯA HIỂU LÝ DO
 *
 *  1. SĐT ghi dạng canonical `84XXXXXXXXX` (không `0` đầu, không `+`) — QĐ-4,
 *     xem `lib/phone.ts`. Ghi sai dạng thì lead mới không bao giờ khớp dữ liệu cũ
 *     và không có test nào bắt được.
 *
 *  2. ĐỌC để chống trùng thì tra bằng `phoneVariants` (`84…` LẪN `0…`), không so
 *     khớp đúng-bằng. Đây KHÔNG phải nới quy ước ghi: vẫn ghi `84…`. Lý do ở
 *     `lib/phone.ts` — repo còn dữ liệu cũ dạng `0…` chưa backfill, mà `Student`
 *     và `Order` thì CHƯA từng được kiểm định dạng. So khớp đúng-bằng ở đây là
 *     chỗ chống trùng gãy âm thầm nhất: tạo lead trùng với khách đã là học viên.
 *
 *  3. `source = 'legacy-sheet'` cho cả đợt; nguồn gốc chi tiết nằm trong `note`.
 *
 *  4. `note` mở đầu bằng `[LEGACY-xxxx]` — đây là KHOÁ CHỐNG CHẠY TRÙNG, vì bảng
 *     `Lead` không có cột `legacyKey` và không có unique index trên `phone`.
 *     Chạy lại lần 2 sẽ nhận ra dấu này và bỏ qua.
 *
 *  5. Khoá quan tâm ghi vào `expectedCourseId`. TUYỆT ĐỐI không đụng `courseId` —
 *     cột đó chỉ được set khi lead đã chuyển đổi thành học viên.
 *
 *  6. CHỈ `create`. Không `update`, không `delete`, không `upsert`. Không dòng nào
 *     đang có trên PROD bị sửa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO IMPORT `db` TỪ `@/lib/db` CHỨ KHÔNG `new PrismaClient()`
 *
 *  · `Lead` nằm trong `DUAL_WRITE_MODELS` (`lib/org/center-bridge.ts:347`). Extension
 *    ghi kép ở `lib/db.ts` tự điền `orgUnitId` từ `centerId` khi create. Dùng client
 *    trần thì 793 lead mới ra đời với `orgUnitId = NULL` — trái luật cứng Nền Hệ
 *    thống #3, và cron đối soát đêm `/api/cron/orgunit-drift` phải đi nhặt.
 *  · `lib/db.ts` tự thêm `pgbouncer=true` nên KHÔNG dính lỗi `prepared statement
 *    does not exist` của transaction pooler :6543 (xem `scripts/_script-db.ts`).
 *
 * ⚠️ `Order` ∈ `SOFT_DELETE_MODELS` nên `db.order.findMany` TỰ chèn `deletedAt: null`.
 *    Ở tầng chống trùng ta CỐ Ý đọc cả đơn đã xoá mềm (xem `layDaTonTai`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { db } from "@/lib/db";
import { canonicalPhone, expandPhoneVariants, phoneKey } from "@/lib/phone";
import { vnDateAt } from "@/lib/time/vn";
import { LeadChildTrialStatus, LeadStatus, OrderKind } from "@prisma/client";
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";

// ── Tham số dòng lệnh ────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const CHI_KIEM_FILE = argv.includes("--chi-kiem-file");

/**
 * ⚠️ BẮT BUỘC khi chạy trong GitHub Actions.
 *
 * Repo `hptkk29/satarobo-vn` là PUBLIC ⇒ **log của Actions ai cũng đọc được**.
 * Bản in thường có SĐT + tên phụ huynh từng dòng; đổ nguyên vào log là công khai
 * đúng khối PII mà `.gitignore` vừa cất công giữ ngoài repo.
 *
 * Bật cờ này thì mọi dòng chi tiết chỉ in `ma_import` (`LEGACY-0004`) — đủ để
 * người vận hành tra ngược trong file CSV của mình, mà tự nó không định danh ai.
 * Các con số tổng hợp không phải PII nên vẫn in đầy đủ.
 */
const CHE_PII = argv.includes("--che-pii");
const arg = (ten: string, macDinh: string) =>
  (argv.find((a) => a.startsWith(`--${ten}=`)) ?? `--${ten}=${macDinh}`).slice(ten.length + 3);

/** Mặc định trỏ vào BẢN GỐC trong `docs/merge-lead/`. Không nhân bản CSV ra nơi khác:
 *  hai bản khác nhau là nguồn gốc của mọi tranh cãi "số liệu không khớp". */
const FILE = path.resolve(process.cwd(), arg("file", "docs/merge-lead/staging_leads.csv"));
const LIMIT = Number(arg("limit", "0"));

// ── Map đã xác nhận trên PROD (khảo sát 27/08/2026) ──────────────────────────
const SALE_MAP: Record<string, string> = {
  "Ms Diệu": "cmrd3x31h00079xkd9tmqz5d4", // Huỳnh Thị Diệu — CS1
  "Ms Hạ": "cmrd3t3y9000mm1lawkthdig1", // Nguyễn Thị Lộc — CS1 ("Hạ" là tên gọi khác)
  "Ms Liên": "cmrd3qm0s000em1lag3ait8hk", // Lê Thị Phương Liên — CS2
  "Ms Vân": "cmrd3ugi3000uvmwv2domge49", // Tô Thị Thuý Vân — CS2
};

/** `Center.id` của repo này LÀ chuỗi slug (không phải cuid) — đã đo trên DB. */
const CENTER_MAP: Record<string, string> = {
  CS1: "co-so-nguyen-huu-tho",
  CS2: "co-so-hoang-dieu",
};

const COURSE_MAP: Record<string, string> = {
  Sata3: "cmpqrne4n000461mh148jyxqm",
  Sata4: "cmpqrneh8000561mhulh2a1p6",
  Sata5: "cmpqrnetp000661mhbcggybx2",
  Sata6: "cmpqrnf6c000761mhgz17lpin",
  Sata7: "cmpqrnfit000861mh0sgqqj5g",
};

/** `trang_thai_lead` trong CSV → enum `LeadStatus`. Kiểu Prisma ⇒ gõ sai là lỗi BIÊN DỊCH. */
const STATUS_MAP: Record<string, LeadStatus> = {
  "Đã đăng ký": LeadStatus.REGISTERED,
  "Đã học thử": LeadStatus.TRIAL_ATTENDED,
  "Đã hẹn học thử": LeadStatus.TRIAL_SCHEDULED,
  "Đang nuôi dưỡng": LeadStatus.NURTURING,
  "Đã mất": LeadStatus.LOST,
};

/** Giá trị THẬT của enum `LeadChildTrialStatus`: NONE | SCHEDULED | IN_PROGRESS | ATTENDED.
 *  "Chưa học thử" = `NONE` — cũng đúng bằng `@default` của cột. */
const CHILD_TRIAL_DEFAULT: LeadChildTrialStatus = LeadChildTrialStatus.NONE;

type Row = {
  ma_import: string;
  phone_norm: string;
  phone_84: string;
  ten_ph: string;
  ten_con: string;
  nguon: string;
  khoa_quan_tam: string;
  lop_tuoi_goc: string;
  trang_thai_hoc_thu: string;
  trang_thai_lead: string;
  ma_co_so: string;
  sale: string;
  ngay_nhan_lead: string;
  ghi_chu: string;
  canh_bao: string;
};

// ── Tiện ích ─────────────────────────────────────────────────────────────────
const chunk = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** "dd/mm/yyyy" → 00:00 giờ VN. Dùng `vnDateAt` chứ KHÔNG `new Date(y, m, d)`:
 *  cái sau bám múi giờ MÁY, nên chạy ở CI (UTC) lệch 7 tiếng so với chạy ở máy dev. */
const parseNgay = (v: string): Date | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((v ?? "").trim());
  if (!m) return null;
  const d = vnDateAt(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Chỉ map khi suy ra ĐÚNG MỘT khoá. "Sata4 / Sata5" → null, để sale tự chọn sau. */
const suyKhoaHoc = (v: string): string | null => {
  const parts = (v ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  return parts.length === 1 ? (COURSE_MAP[parts[0]] ?? null) : null;
};

/** Nhãn nhận dạng một dòng trong bản in. Che PII thì chỉ còn `ma_import`. */
const nhan = (ma: string, phone: string, ten: string) =>
  CHE_PII ? ma : `${phone}  ${ten}`;

/** Một dòng CSV đã chuẩn hoá, sẵn sàng ghi. */
type BanGhi = {
  ma: string;
  phone: string;
  row: Row;
  centerId: string | null;
  ownerId: string | null;
  courseId: string | null;
  status: LeadStatus;
  note: string;
  createdAt: Date | null;
};

// ── Đọc + chuẩn hoá file ─────────────────────────────────────────────────────
function docFile() {
  if (!fs.existsSync(FILE)) throw new Error(`Không thấy file: ${FILE}`);
  let rows: Row[] = parse(fs.readFileSync(FILE, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);

  const st = { sdtLoi: 0, trungFile: 0 };
  const loiSdt: string[] = [];
  const trungTrongFile: string[] = [];
  const daThay = new Set<string>();
  const banGhi: BanGhi[] = [];

  for (const r of rows) {
    // `canonicalPhone` là NGUỒN DUY NHẤT chuẩn hoá SĐT của repo — nó chặn cả số cố
    // định lẫn số sai đầu số, việc mà regex `^84\d{9}$` viết tay không làm được.
    const phone = canonicalPhone(r.phone_84 || r.phone_norm);
    if (!phone) {
      st.sdtLoi++;
      loiSdt.push(CHE_PII ? r.ma_import : `${r.ma_import}: "${r.phone_84}" / "${r.phone_norm}"`);
      continue;
    }
    if (daThay.has(phone)) {
      st.trungFile++;
      trungTrongFile.push(
        CHE_PII ? r.ma_import : `${r.ma_import}: ${phone} — ${r.ten_ph}`,
      );
      continue;
    }
    daThay.add(phone);

    banGhi.push({
      ma: r.ma_import,
      phone,
      row: r,
      centerId: CENTER_MAP[r.ma_co_so] ?? null,
      ownerId: SALE_MAP[r.sale] ?? null,
      courseId: suyKhoaHoc(r.khoa_quan_tam),
      status: STATUS_MAP[r.trang_thai_lead] ?? LeadStatus.NURTURING,
      createdAt: parseNgay(r.ngay_nhan_lead),
      note:
        `[${r.ma_import}] Nguồn gốc: ${r.nguon || "không rõ"}` +
        (r.khoa_quan_tam ? ` | Khoá gợi ý: ${r.khoa_quan_tam}` : "") +
        (r.ghi_chu ? ` | ${r.ghi_chu}` : ""),
    });
  }
  return { tongDong: rows.length, banGhi, st, loiSdt, trungTrongFile };
}

// ── Preflight: giải map bằng 3 truy vấn, báo HẾT chỗ thiếu chứ không dừng ở cái đầu ──
async function preflight() {
  console.log(`  DB đang trỏ tới : ${currentDbHost()}`);
  const [conHieuLuc, tong] = await Promise.all([
    db.lead.count({ where: { deletedAt: null } }),
    db.lead.count(),
  ]);
  console.log(`  Lead hiện có    : ${conHieuLuc} còn hiệu lực / ${tong} tổng\n`);

  // `$queryRaw` (tagged template — KHÔNG phải `$queryRawUnsafe`, thứ CLAUDE.md cấm):
  // đọc enum THẬT trong DB thay vì tin vào hằng số trong code.
  const nhan = (
    await db.$queryRaw<{ v: string }[]>`
      SELECT e.enumlabel::text AS v
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'LeadChildTrialStatus' ORDER BY e.enumsortorder`
  ).map((r) => r.v);
  if (!nhan.includes(CHILD_TRIAL_DEFAULT)) {
    throw new Error(
      `CHILD_TRIAL_DEFAULT='${CHILD_TRIAL_DEFAULT}' không có thật trong DB.\n` +
        `LeadChild.trialStatus hợp lệ: ${nhan.join(" | ")}`,
    );
  }
  console.log(
    `  LeadChild.trialStatus (đọc từ DB): ${nhan.join(" | ")}  → dùng "${CHILD_TRIAL_DEFAULT}"\n`,
  );

  const thieu: string[] = [];
  const [centers, users, courses] = await Promise.all([
    db.center.findMany({
      where: { id: { in: Object.values(CENTER_MAP) } },
      select: { id: true, name: true, code: true },
    }),
    db.user.findMany({
      where: { id: { in: Object.values(SALE_MAP) } },
      select: { id: true, name: true },
    }),
    db.course.findMany({
      where: { id: { in: Object.values(COURSE_MAP) } },
      select: { id: true, name: true, code: true },
    }),
  ]);
  const mC = new Map(centers.map((x) => [x.id, x]));
  const mU = new Map(users.map((x) => [x.id, x]));
  const mK = new Map(courses.map((x) => [x.id, x]));

  console.log("  Cơ sở:");
  for (const [k, v] of Object.entries(CENTER_MAP)) {
    const c = mC.get(v);
    console.log(`    ${k.padEnd(9)} → ${c ? `${c.name} (code=${c.code})` : "✗ KHÔNG CÓ TRÊN DB NÀY"}`);
    if (!c) thieu.push(`Center "${v}" (${k})`);
  }
  console.log("  Sale:");
  for (const [k, v] of Object.entries(SALE_MAP)) {
    const u = mU.get(v);
    console.log(`    ${k.padEnd(9)} → ${u ? u.name : "✗ KHÔNG CÓ TRÊN DB NÀY"}`);
    if (!u) thieu.push(`User "${v}" (${k})`);
  }
  console.log("  Khoá học:");
  for (const [k, v] of Object.entries(COURSE_MAP)) {
    const c = mK.get(v);
    console.log(`    ${k.padEnd(9)} → ${c ? `${c.name} (code=${c.code})` : "✗ KHÔNG CÓ TRÊN DB NÀY"}`);
    if (!c) thieu.push(`Course "${v}" (${k})`);
  }
  if (thieu.length) {
    throw new Error(
      `${thieu.length} định danh trong bảng map KHÔNG tồn tại trên DB đang kết nối:\n` +
        thieu.map((t) => `  · ${t}`).join("\n") +
        `\n\nBảng map lấy từ PROD. Nếu DB đang trỏ tới là dev/test thì đây là hành vi ĐÚNG:\n` +
        `script từ chối chạy trên nhầm DB. Kiểm tra DATABASE_URL trước khi chạy lại.`,
    );
  }
  console.log("");
}

// ── Nạp sẵn dữ liệu đối chiếu: 3 tầng chống trùng, gom về vài truy vấn ────────
// Bản gốc bắn 4 truy vấn/dòng × 795 dòng ≈ 3.200 lượt đi-về Tokyo (~5–10 phút, rất dễ
// đứt giữa chừng). Ở đây gom còn ~6 truy vấn. KHÔNG bỏ tầng nào.
async function layDaTonTai(phones: string[]) {
  const variants = expandPhoneVariants(phones); // `84…` + `0…`
  const lo = chunk(variants, 800);
  const gom = async <T>(f: (v: string[]) => Promise<T[]>) => (await Promise.all(lo.map(f))).flat();

  const [leads, students, orders, daImport] = await Promise.all([
    // Tầng 1 — Lead. `deletedAt: null`: lead đã xoá mềm KHÔNG chặn nhập lại.
    gom((v) =>
      db.lead.findMany({
        where: { phone: { in: v }, deletedAt: null },
        select: { phone: true, parentName: true },
      }),
    ),
    // Tầng 2 — Student (3 cột SĐT). `Student` ∉ SOFT_DELETE_MODELS ⇒ không có bộ lọc
    // ngầm; CỐ Ý tính cả học viên đã xoá mềm: từng là học viên thì không dựng lead mới.
    gom((v) =>
      db.student.findMany({
        where: {
          OR: [{ parentPhone: { in: v } }, { parent2Phone: { in: v } }, { phone: { in: v } }],
        },
        select: { parentPhone: true, parent2Phone: true, phone: true, deletedAt: true },
      }),
    ),
    // Tầng 3 — Order. `deletedAt: undefined` VÔ HIỆU HOÁ bộ lọc soft-delete tự động
    // (`injectSoftDelete` bỏ qua khi `where` đã nhắc tới `deletedAt`) — cố ý tính cả
    // đơn đã xoá mềm, cùng lý do với tầng 2.
    gom((v) =>
      db.order.findMany({
        where: { customerPhone: { in: v }, deletedAt: undefined },
        select: { customerPhone: true, deletedAt: true },
      }),
    ),
    // Chống chạy lại — MỘT truy vấn lấy hết dấu `[LEGACY-…]` đã ghi, thay vì 795 lần
    // `findFirst({ note: { startsWith } })` (mỗi lần là một seq scan).
    db.lead.findMany({ where: { note: { startsWith: "[LEGACY-" } }, select: { note: true } }),
  ]);

  // `phoneKey` bắt buộc khi dựng Map từ kết quả truy vấn: truy vấn trả về CẢ dòng `0…`
  // cũ lẫn `84…` mới, key bằng chuỗi thô sẽ tra trượt đúng những dòng vừa cất công tìm ra.
  const tenLead = new Map<string, string>();
  for (const l of leads) tenLead.set(phoneKey(l.phone), l.parentName);

  const coHocVien = new Set<string>();
  for (const s of students)
    for (const p of [s.parentPhone, s.parent2Phone, s.phone]) if (p) coHocVien.add(phoneKey(p));

  const coDon = new Set<string>();
  for (const o of orders) coDon.add(phoneKey(o.customerPhone));

  const daCoDau = new Set<string>();
  for (const l of daImport) {
    const m = /^\[(LEGACY-[^\]]+)\]/.exec(l.note ?? "");
    if (m) daCoDau.add(m[1]);
  }

  return {
    tenLead,
    coHocVien,
    coDon,
    daCoDau,
    soHvDaXoa: students.filter((s) => s.deletedAt != null).length,
    soDonDaXoa: orders.filter((o) => o.deletedAt != null).length,
  };
}

type KetQua = {
  taoMoi: number;
  coLead: number;
  laHocVien: number;
  coDonHang: number;
  daImport: number;
  loi: number;
};

// ── Chạy ─────────────────────────────────────────────────────────────────────
async function main() {
  const { tongDong, banGhi, st, loiSdt, trungTrongFile } = docFile();

  console.log(
    `\nChế độ : ${
      CHI_KIEM_FILE
        ? "CHỈ KIỂM FILE (không chạm DB)"
        : COMMIT
          ? "*** GHI THẬT (--commit) ***"
          : "DRY RUN — không ghi gì"
    }`,
  );
  console.log(`File   : ${FILE}`);
  console.log(`         ${tongDong} dòng → ${banGhi.length} SĐT duy nhất hợp lệ`);
  console.log(
    `PII    : ${
      CHE_PII
        ? "ĐÃ CHE — dòng chi tiết chỉ in ma_import. Tra ngược trong CSV của bạn."
        : "IN ĐẦY ĐỦ — chỉ chạy vậy ở MÁY. Trong GitHub Actions phải thêm `--che-pii` (log repo public là log công khai)."
    }\n`,
  );

  const kq: KetQua = { taoMoi: 0, coLead: 0, laHocVien: 0, coDonHang: 0, daImport: 0, loi: 0 };
  const errs: string[] = [];

  if (CHI_KIEM_FILE) {
    // Dòng thiếu map cơ sở/sale — kiểm được mà không cần DB.
    for (const b of banGhi)
      if (!b.centerId || !b.ownerId)
        errs.push(`${b.ma}: thiếu map cơ sở "${b.row.ma_co_so}" / sale "${b.row.sale}"`);
    kq.loi = errs.length;
    kq.taoMoi = banGhi.length - errs.length;
    inKetQua(kq, st, errs, loiSdt, trungTrongFile, banGhi, null);
    return;
  }

  console.log("Preflight:");
  await preflight();

  const daTonTai = await layDaTonTai(banGhi.map((b) => b.phone));

  for (const b of banGhi) {
    if (daTonTai.daCoDau.has(b.ma)) {
      kq.daImport++;
      continue;
    }
    const ten = daTonTai.tenLead.get(b.phone);
    if (ten !== undefined) {
      kq.coLead++;
      console.log(
        `  [đã có lead]  ${nhan(b.ma, b.phone, b.row.ten_ph)}${CHE_PII ? "" : `  ->  ${ten}`}`,
      );
      continue;
    }
    if (daTonTai.coHocVien.has(b.phone)) {
      kq.laHocVien++;
      console.log(`  [đã là HV]    ${nhan(b.ma, b.phone, b.row.ten_ph)}`);
      continue;
    }
    if (daTonTai.coDon.has(b.phone)) {
      kq.coDonHang++;
      console.log(`  [có đơn hàng] ${nhan(b.ma, b.phone, b.row.ten_ph)}`);
      continue;
    }
    if (!b.centerId || !b.ownerId) {
      kq.loi++;
      errs.push(`${b.ma}: thiếu map "${b.row.ma_co_so}" / "${b.row.sale}"`);
      continue;
    }
    if (!COMMIT) {
      kq.taoMoi++;
      continue;
    }

    try {
      // Ghi LỒNG: Prisma bọc Lead + LeadChild trong MỘT transaction ngầm, một lượt
      // đi-về. Không cần `$transaction` tương tác (vốn có timeout riêng và giữ
      // connection lâu hơn — rất dễ đứt qua pooler).
      await db.lead.create({
        data: {
          phone: b.phone,
          parentName: b.row.ten_ph || `PH của ${b.row.ten_con || b.phone}`,
          childName: b.row.ten_con || null,
          status: b.status,
          source: "legacy-sheet",
          centerId: b.centerId,
          assignedToId: b.ownerId,
          expectedCourseId: b.courseId,
          // `orderKind` PHẢI đi kèm `expectedCourseId`. Ô chọn ở màn chi tiết lead khởi
          // tạo giá trị theo `orderKind` (`order-kind-select.tsx:39-46`): `orderKind`
          // rỗng ⇒ ô hiện TRỐNG dù cột có dữ liệu, và lần đầu sale chạm vào ô thì
          // `updateLeadOrderKind` (`admin/leads/actions.ts:307`) ghi đè cả cụm ⇒ khoá
          // vừa nhập bị mất im lặng.
          ...(b.courseId ? { orderKind: OrderKind.COURSE } : {}),
          note: b.note,
          // `createdAt` lùi về ngày sale nhận lead. `updatedAt` có `@updatedAt` nên
          // Prisma tự điền — KHÔNG gán tay.
          ...(b.createdAt ? { createdAt: b.createdAt } : {}),
          ...(b.row.ten_con
            ? {
                children: {
                  create: {
                    fullName: b.row.ten_con,
                    gradeLevel: b.row.lop_tuoi_goc || null,
                    interestedCourseId: b.courseId,
                    interestedCenterId: b.centerId,
                    trialStatus: CHILD_TRIAL_DEFAULT,
                    note: b.row.trang_thai_hoc_thu || null,
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      });
      kq.taoMoi++;
      if (kq.taoMoi % 50 === 0) console.log(`  … đã tạo ${kq.taoMoi}`);
    } catch (e) {
      kq.loi++;
      errs.push(
        `${b.ma}${CHE_PII ? "" : ` ${b.phone}`}: ${
          e instanceof Error ? e.message.split("\n")[0] : String(e)
        }`,
      );
    }
  }

  inKetQua(kq, st, errs, loiSdt, trungTrongFile, banGhi, daTonTai);
}

function inKetQua(
  kq: KetQua,
  st: { sdtLoi: number; trungFile: number },
  errs: string[],
  loiSdt: string[],
  trungTrongFile: string[],
  banGhi: BanGhi[],
  daTonTai: { soDonDaXoa: number; soHvDaXoa: number } | null,
) {
  const coCon = banGhi.filter((b) => b.row.ten_con).length;
  const coNgay = banGhi.filter((b) => b.createdAt).length;
  const coKhoa = banGhi.filter((b) => b.courseId).length;

  console.log("\n──────────────── KẾT QUẢ ────────────────");
  console.log(
    `  ${COMMIT ? "Đã tạo mới" : "Sẽ tạo mới"}           : ${kq.taoMoi}${COMMIT ? "" : "  (chưa ghi)"}`,
  );
  console.log(`  Bỏ — đã có lead        : ${kq.coLead}`);
  console.log(`  Bỏ — đã là học viên    : ${kq.laHocVien}`);
  console.log(`  Bỏ — đã có đơn hàng    : ${kq.coDonHang}`);
  console.log(`  Bỏ — đã import trước   : ${kq.daImport}`);
  console.log(`  Bỏ — trùng trong file  : ${st.trungFile}`);
  console.log(`  Bỏ — SĐT lỗi           : ${st.sdtLoi}`);
  console.log(`  Lỗi                    : ${kq.loi}`);
  console.log("  ───────────────────────────────────────");
  console.log(
    `  Kèm theo: ${coCon} LeadChild · ${coKhoa} dòng có expectedCourseId · ` +
      `${coNgay}/${banGhi.length} dòng lùi được createdAt`,
  );
  if (daTonTai)
    console.log(
      `  (khớp phải nhờ bản ghi đã xoá mềm: ${daTonTai.soHvDaXoa} HV · ${daTonTai.soDonDaXoa} đơn)`,
    );

  if (trungTrongFile.length) {
    console.log(`\n  SĐT trùng TRONG FILE — chỉ giữ dòng đầu, dòng sau bị bỏ (${trungTrongFile.length}):`);
    trungTrongFile.forEach((e) => console.log("    - " + e));
    console.log("    ⚠️ Dữ liệu dòng bị bỏ KHÔNG được gộp. Xem cột `canh_bao` và gộp tay nếu cần.");
  }
  if (loiSdt.length) {
    console.log(`\n  SĐT không chuẩn hoá được (${loiSdt.length}):`);
    loiSdt.slice(0, 30).forEach((e) => console.log("    - " + e));
  }
  if (errs.length) {
    console.log(`\n  Lỗi chi tiết (${errs.length}):`);
    errs.slice(0, 50).forEach((e) => console.log("    - " + e));
    if (errs.length > 50) console.log(`    … và ${errs.length - 50} lỗi nữa`);
  }
  console.log("─────────────────────────────────────────");
  if (CHI_KIEM_FILE)
    console.log("CHỈ KIỂM FILE — chưa kết nối DB, nên chưa trừ 'đã có lead / HV / đơn'.\n");
  else if (!COMMIT) console.log("DRY RUN — chưa ghi gì. Thêm `--commit` để ghi thật.\n");
}

main()
  .catch((e) => {
    console.error("\n" + (e instanceof Error ? e.message : String(e)) + "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
