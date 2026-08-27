/**
 * Kiểm tra sau khi nhập 795 lead cũ — CHỈ ĐỌC, không ghi một dòng nào.
 *
 *   pnpm kiem-tra:legacy-leads
 *   pnpm kiem-tra:legacy-leads -- --che-pii        # bắt buộc khi chạy trong Actions
 *
 * VÌ SAO CẦN, khi dry-run chạy lại đã nói "còn 0 dòng để tạo":
 * dry-run chỉ đối chiếu SĐT. Nó KHÔNG nhìn thấy lead vào đủ nhưng thiếu `orgUnitId`,
 * mất `assignedAt`, `expectedCourseId` không có `orderKind` đi kèm, hay tệ nhất là
 * `courseId` bị chạm (cột chỉ được set khi lead đã chuyển đổi thành học viên).
 * File này soi đúng những thứ đó trên chính 708 dòng vừa ghi.
 *
 * Mỗi mục in ĐẠT / LỆCH kèm số đo. LỆCH không tự sửa gì — chỉ báo, vì mọi đường sửa
 * đều là UPDATE trên prod, thứ mà luật chỉ-create của đợt nhập này cấm.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { db } from "@/lib/db";
import { canonicalPhone, expandPhoneVariants, phoneKey } from "@/lib/phone";
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const CHE_PII = argv.includes("--che-pii");
const arg = (ten: string, macDinh: string) =>
  (argv.find((a) => a.startsWith(`--${ten}=`)) ?? `--${ten}=${macDinh}`).slice(ten.length + 3);
const FILE = path.resolve(process.cwd(), arg("file", "docs/merge-lead/staging_leads.csv"));

const DAU = "[LEGACY-";
const chunk = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

type Row = Record<string, string>;

let soLech = 0;
function muc(ten: string, dat: boolean, doDuoc: string) {
  if (!dat) soLech++;
  console.log(`  ${dat ? "ĐẠT " : "LỆCH"}  ${ten.padEnd(46)} ${doDuoc}`);
}

/**
 * Mục kiểm trên tập N dòng. `n === 0` KHÔNG được tính là ĐẠT.
 *
 * Không có guard này thì cả khối "trường bắt buộc" xanh hết với `0/0` khi chưa
 * nhập gì — xanh giả, đúng kiểu bản kiểm tra tự trấn an. Đã thấy thật khi chạy
 * thử trên DB dev (0 dòng mang dấu ⇒ 12/12 mục ĐẠT).
 */
function mucTren(n: number, ten: string, dung: number, doDuoc?: string) {
  muc(ten, n > 0 && dung === n, doDuoc ?? `${dung}/${n}`);
}

async function main() {
  const rows: Row[] = parse(fs.readFileSync(FILE, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  // ── Kỳ vọng dựng từ CHÍNH file nguồn ──────────────────────────────────────
  const daThay = new Set<string>();
  const theoMa = new Map<string, Row>();
  for (const r of rows) {
    const p = canonicalPhone(r.phone_84 || r.phone_norm);
    if (!p || daThay.has(p)) continue;
    daThay.add(p);
    theoMa.set(r.ma_import, r);
  }
  const phones = [...daThay];

  console.log(`\nDB đang trỏ tới : ${currentDbHost()}`);
  console.log(`File nguồn      : ${FILE}`);
  console.log(`                  ${rows.length} dòng → ${phones.length} SĐT duy nhất\n`);

  // ── Đọc prod (mọi truy vấn đều là findMany/count — không có đường ghi) ────
  const variants = expandPhoneVariants(phones);
  const lo = chunk(variants, 800);
  const leadTheoSdt = (
    await Promise.all(
      lo.map((v) =>
        db.lead.findMany({
          where: { phone: { in: v }, deletedAt: null },
          select: { id: true, phone: true, note: true },
        }),
      ),
    )
  ).flat();

  const dem = new Map<string, number>();
  for (const l of leadTheoSdt) dem.set(phoneKey(l.phone), (dem.get(phoneKey(l.phone)) ?? 0) + 1);

  console.log("═══ ĐỦ CHƯA ═══");
  const thieu = phones.filter((p) => !dem.has(p));
  muc("Mọi SĐT trong file đều có lead trên prod", thieu.length === 0,
      `${phones.length - thieu.length}/${phones.length}` + (thieu.length ? ` · thiếu ${thieu.length}` : ""));

  const trung = [...dem.entries()].filter(([, n]) => n > 1);
  muc("Không SĐT nào có >1 lead (không tạo trùng)", trung.length === 0,
      `${trung.length} SĐT bị trùng`);

  // ── 708 dòng do đợt này tạo ra, nhận diện bằng dấu [LEGACY- ───────────────
  const daNhap = await db.lead.findMany({
    where: { note: { startsWith: DAU }, deletedAt: null },
    select: {
      id: true, phone: true, note: true, centerId: true, orgUnitId: true,
      assignedToId: true, assignedAt: true, source: true, courseId: true,
      expectedCourseId: true, orderKind: true, status: true, createdAt: true,
      childName: true, _count: { select: { children: true } },
    },
  });
  const n = daNhap.length;

  const maDaNhap = new Set<string>();
  for (const l of daNhap) {
    const m = /^\[(LEGACY-[^\]]+)\]/.exec(l.note ?? "");
    if (m) maDaNhap.add(m[1]);
  }
  const maThieu = [...theoMa.keys()].filter((ma) => !maDaNhap.has(ma));

  console.log(`\n═══ ${n} DÒNG DO ĐỢT NÀY TẠO (mang dấu ${DAU}…]) ═══`);
  muc("Có dòng mang dấu để kiểm (n > 0)", n > 0, `${n} dòng`);
  muc("Số dòng mang dấu = số lead có mã trong file", n > 0 && maDaNhap.size === n,
      `${maDaNhap.size} mã / ${n} dòng`);

  console.log("\n─── trường bắt buộc ───");
  const dsCo = (f: (l: (typeof daNhap)[number]) => boolean) => daNhap.filter(f).length;
  mucTren(n, "centerId đã điền", dsCo((l) => !!l.centerId));
  mucTren(n, "orgUnitId đã điền (ghi kép hoạt động)", dsCo((l) => !!l.orgUnitId));
  mucTren(n, "assignedToId đã điền", dsCo((l) => !!l.assignedToId));
  mucTren(n, "assignedAt đã điền", dsCo((l) => !!l.assignedAt));
  mucTren(n, "assignedAt == createdAt",
          dsCo((l) => l.assignedAt?.getTime() === l.createdAt.getTime()));
  mucTren(n, 'source = "legacy-sheet"', dsCo((l) => l.source === "legacy-sheet"));

  console.log("\n─── trường KHÔNG được chạm ───");
  const coCourseId = dsCo((l) => l.courseId !== null);
  muc("courseId vẫn rỗng (chỉ set khi đã chuyển đổi)", n > 0 && coCourseId === 0, `${coCourseId} dòng bị set`);

  console.log("\n─── khoá quan tâm ───");
  const coKhoa = dsCo((l) => !!l.expectedCourseId);
  const coKind = dsCo((l) => l.orderKind === "COURSE");
  muc("expectedCourseId luôn kèm orderKind=COURSE", n > 0 && coKhoa === coKind,
      `${coKhoa} có khoá · ${coKind} có orderKind`);
  const kindThua = dsCo((l) => !!l.orderKind && !l.expectedCourseId);
  muc("Không dòng nào có orderKind mà thiếu khoá", n > 0 && kindThua === 0, `${kindThua} dòng`);

  console.log("\n─── LeadChild ───");
  const conThat = daNhap.reduce((s, l) => s + l._count.children, 0);
  const conKyVong = [...maDaNhap].filter((ma) => (theoMa.get(ma)?.ten_con ?? "").trim()).length;
  muc("Số con khớp số dòng có ten_con", n > 0 && conThat === conKyVong,
      `${conThat} thật / ${conKyVong} kỳ vọng`);
  const lechCon = dsCo((l) => !!l.childName && l._count.children === 0);
  muc("Dòng có childName đều có LeadChild", n > 0 && lechCon === 0, `${lechCon} dòng thiếu con`);

  console.log("\n─── phân bố (đối chiếu với file) ───");
  const demTheo = <T>(xs: T[], k: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1);
    return m;
  };
  const csThat = demTheo(daNhap, (l) => l.centerId ?? "(rỗng)");
  const csKyVong = demTheo([...maDaNhap], (ma) => {
    const c = theoMa.get(ma)?.ma_co_so;
    return c === "CS1" ? "co-so-nguyen-huu-tho" : c === "CS2" ? "co-so-hoang-dieu" : "(rỗng)";
  });
  for (const [k, v] of [...csKyVong].sort())
    muc(`cơ sở ${k}`, csThat.get(k) === v, `${csThat.get(k) ?? 0} thật / ${v} kỳ vọng`);

  const ttThat = demTheo(daNhap, (l) => l.status);
  console.log("\n─── trạng thái ───");
  for (const [k, v] of [...ttThat].sort((a, b) => b[1] - a[1])) console.log(`         ${k.padEnd(20)} ${v}`);

  const ngay = daNhap.map((l) => l.createdAt).sort((a, b) => a.getTime() - b.getTime());
  if (ngay.length)
    console.log(
      `\n─── createdAt: ${ngay[0].toISOString().slice(0, 10)} → ${ngay[ngay.length - 1].toISOString().slice(0, 10)}`,
    );

  // ── Chi tiết chỗ lệch ─────────────────────────────────────────────────────
  if (thieu.length) {
    const maThieuTuSdt = rows
      .filter((r) => {
        const p = canonicalPhone(r.phone_84 || r.phone_norm);
        return p && thieu.includes(p);
      })
      .map((r) => r.ma_import);
    console.log(`\n⚠️ ${thieu.length} SĐT KHÔNG có lead trên prod:`);
    (CHE_PII ? maThieuTuSdt : thieu).slice(0, 40).forEach((x) => console.log("    - " + x));
  }
  if (maThieu.length) {
    console.log(`\n⚠️ ${maThieu.length} mã trong file chưa mang dấu ${DAU}…] (có thể là 85 dòng vốn đã có lead trước đợt nhập):`);
    maThieu.slice(0, 40).forEach((x) => console.log("    - " + x));
    if (maThieu.length > 40) console.log(`    … và ${maThieu.length - 40} mã nữa`);
  }
  if (trung.length) {
    console.log(`\n⚠️ SĐT có nhiều hơn 1 lead:`);
    trung.slice(0, 20).forEach(([p, c]) => console.log(`    - ${CHE_PII ? "(che)" : p} × ${c}`));
  }

  console.log(
    `\n${soLech === 0 ? "✅ TẤT CẢ ĐẠT — không có mục nào lệch." : `❌ ${soLech} mục LỆCH — xem chi tiết ở trên.`}\n`,
  );
  if (soLech > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\n" + (e instanceof Error ? e.message : String(e)) + "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
