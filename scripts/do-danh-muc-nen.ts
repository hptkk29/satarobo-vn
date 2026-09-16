/**
 * scripts/do-danh-muc-nen.ts — ĐO TOÀN BỘ danh mục nền chấm công trên prod, đối chiếu seed.
 *
 * CHỈ ĐỌC. Không có chế độ ghi, không tham số nào bật ghi. Toàn bộ là `findMany`/`count`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO CÓ FILE NÀY — phát hiện 09/09/2026
 *
 * Đo `ShiftTemplate` trên prod cho thấy **21 dòng đều mang một bản ghi AuditLog `CREATE`**
 * do một người gõ tay qua màn quản trị đêm 08/09. Prod **chưa từng được seed** nhóm đó, và
 * mọi chỗ lệch với seed khớp đúng giá trị mặc định của form trống.
 *
 * Câu hỏi kế tiếp — và là câu phải trả lời TRƯỚC khi làm bất cứ việc nào khác: **bốn nhóm
 * còn lại thì sao?** Nếu chúng cũng chưa từng được seed thì mọi giả định "danh mục nền đã
 * có sẵn, đúng theo mã nguồn" đều sai, và mọi tính năng đọc chúng đang chạy trên dữ liệu
 * gõ tay.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÁCH SUY RA NGUỒN DỮ LIỆU — đọc kỹ chỗ này trước khi tin cột "gõ tay"
 *
 * `prisma/seed-cham-cong.ts` (qua `lib/cham-cong/seed-core.ts`) **KHÔNG ghi AuditLog**.
 * Mọi đường ghi qua màn quản trị thì **CÓ**. Nên với một dòng đang tồn tại:
 *
 *   · có `AuditLog{entityType, entityId, action:"CREATE"}`  ⇒ **gõ tay qua màn**
 *   · không có                                              ⇒ **seed** (hoặc sinh ra
 *     trước khi đường ghi đó biết viết audit — xem cảnh báo dưới)
 *
 * ⚠️ GIỚI HẠN PHẢI NÓI RA, ĐỪNG ĐỌC CỘT NÀY NHƯ SỰ THẬT TUYỆT ĐỐI:
 *   1. "Không có audit" là bằng chứng ÂM. Nó không phân biệt được "seed tạo" với "một
 *      đường ghi cũ chưa gắn audit tạo". Vì vậy script in kèm ngày `createdAt` sớm nhất —
 *      dòng do seed tạo thường xúm quanh một mốc, dòng gõ tay rải ra.
 *   2. Audit có thể bị dọn. Chưa thấy đường dọn nào trong repo, nhưng không loại trừ được
 *      bằng phép đo này.
 *   3. `WorkLocation` sinh theo CƠ SỞ chứ không theo danh mục mã nguồn — nó không có khái
 *      niệm "thiếu mã", chỉ có "thiếu điểm cho một cơ sở đang hoạt động".
 *
 * ⚠️ `Holiday` **KHÔNG thuộc phạm vi `seed-cham-cong.ts`** (đo bằng cách đọc chính file đó:
 * nó gọi đúng 5 hàm seed, không có ngày lễ). Nguồn của nó là màn `/admin/holidays` và
 * `POST /api/admin/import/holidays`. Script vẫn đếm nó, nhưng ở mục riêng và **không** so
 * với seed — không có seed để mà so.
 *
 * CHẠY:
 *   pnpm tsx scripts/do-danh-muc-nen.ts
 */
// `_load-env` phải chạy TRƯỚC `_script-db` — Prisma đọc DATABASE_URL ngay lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import {
  LEAVE_TYPE_CATALOG,
  SESSION_CATEGORY_CATALOG,
  SHIFT_CATALOG,
  TEACHING_CREDIT_CATALOG,
} from "../lib/cham-cong/catalog";

const db = scriptDb();

// ── in ấn ────────────────────────────────────────────────────────────────────
function tieu(s: string) {
  console.log("");
  console.log("═".repeat(84));
  console.log(s);
  console.log("═".repeat(84));
}
function muc(s: string) {
  console.log("");
  console.log(`── ${s} ${"─".repeat(Math.max(0, 78 - s.length))}`);
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(56)} ${String(n).padStart(10)}`);
}

/**
 * So hai giá trị theo kiểu "bằng nhau về NỘI DUNG".
 *
 * ⚠️ Postgres `jsonb` **sắp xếp lại khoá** của object khi lưu. `JSON.stringify` so trực tiếp
 * là nhạy với thứ tự khoá ⇒ báo lệch giả cho `ShiftTemplate.segments`. Đã ăn thật ở phép đo
 * V10 hôm 09/09. Nên chuẩn hoá bằng cách sắp khoá trước khi so.
 */
function chuan(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(chuan);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const ra: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) ra[k] = chuan(o[k]);
    return ra;
  }
  // Float trong Prisma và số nguyên trong danh mục: 1 và 1.0 phải bằng nhau.
  return v;
}
function bang(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  return JSON.stringify(chuan(a)) === JSON.stringify(chuan(b));
}

// ── nguồn dữ liệu qua AuditLog ───────────────────────────────────────────────
type NguonDong = { id: string; code: string; coAudit: boolean; nguoiTao: string | null; luc: Date | null };

async function nguonCua(
  entityType: string,
  dong_: { id: string; code: string; createdAt: Date }[],
): Promise<{ chiTiet: NguonDong[]; goTay: number; khongAudit: number; theoNguoi: Map<string, number> }> {
  const ids = dong_.map((d) => d.id);
  const audit = ids.length
    ? await db.auditLog.findMany({
        where: { entityType, entityId: { in: ids }, action: "CREATE" },
        select: { entityId: true, actorName: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const theoId = new Map<string, { actorName: string; createdAt: Date }>();
  for (const a of audit) if (!theoId.has(a.entityId)) theoId.set(a.entityId, a);

  const chiTiet: NguonDong[] = dong_.map((d) => {
    const a = theoId.get(d.id);
    return { id: d.id, code: d.code, coAudit: !!a, nguoiTao: a?.actorName ?? null, luc: a?.createdAt ?? null };
  });
  const theoNguoi = new Map<string, number>();
  for (const c of chiTiet) {
    if (!c.coAudit) continue;
    const k = `${c.nguoiTao} · ${c.luc?.toISOString().slice(0, 10)}`;
    theoNguoi.set(k, (theoNguoi.get(k) ?? 0) + 1);
  }
  return {
    chiTiet,
    goTay: chiTiet.filter((c) => c.coAudit).length,
    khongAudit: chiTiet.filter((c) => !c.coAudit).length,
    theoNguoi,
  };
}

function inNguon(entityType: string, kq: Awaited<ReturnType<typeof nguonCua>>, somNhat: Date | null) {
  dong("có AuditLog CREATE  ⇒ GÕ TAY qua màn", kq.goTay);
  dong("không có AuditLog   ⇒ nhiều khả năng SEED", kq.khongAudit);
  if (kq.theoNguoi.size) {
    console.log("  ai gõ, ngày nào:");
    for (const [k, n] of [...kq.theoNguoi.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)} dòng   ${k}`);
    }
  }
  if (somNhat) console.log(`  createdAt sớm nhất trong nhóm: ${somNhat.toISOString()}`);
  void entityType;
}

/** So một nhóm danh mục theo mã, theo đúng danh sách trường mà seed ghi. */
function soNhom<TDb extends Record<string, unknown>, TSeed extends Record<string, unknown>>(
  ten: string,
  seed: readonly TSeed[],
  tren: TDb[],
  layMa: (x: TDb | TSeed) => string,
  truong: (keyof TSeed & string)[],
) {
  const theoMa = new Map(tren.map((r) => [layMa(r), r]));
  const maSeed = new Set(seed.map((s) => layMa(s as unknown as TSeed)));

  const thieu: string[] = [];
  const lech: { ma: string; truong: string; prod: unknown; seed: unknown }[] = [];
  for (const s of seed) {
    const ma = layMa(s as unknown as TSeed);
    const r = theoMa.get(ma);
    if (!r) {
      thieu.push(ma);
      continue;
    }
    for (const f of truong) {
      if (!bang(r[f], s[f])) lech.push({ ma, truong: f, prod: r[f], seed: s[f] });
    }
  }
  const thua = tren.map(layMa).filter((m) => !maSeed.has(m));
  const khop = seed.length - thieu.length - new Set(lech.map((l) => l.ma)).size;

  muc(`${ten} — đối chiếu với seed`);
  dong("dòng trên PROD", tren.length);
  dong("dòng trong DANH MỤC mã nguồn", seed.length);
  dong("khớp seed HOÀN TOÀN", khop);
  dong("THIẾU trên prod (có trong seed)", thieu.length);
  dong("LỆCH ít nhất một trường", new Set(lech.map((l) => l.ma)).size);
  dong("THỪA trên prod (không có trong seed)", thua.length);
  if (thieu.length) console.log(`  mã thiếu: ${thieu.join(", ")}`);
  if (thua.length) console.log(`  mã thừa:  ${thua.join(", ")}`);
  if (lech.length) {
    console.log("  từng chỗ lệch (prod ← → seed):");
    for (const l of lech) {
      console.log(
        `    ${l.ma.padEnd(16)} ${l.truong.padEnd(20)} prod=${JSON.stringify(l.prod)}   seed=${JSON.stringify(l.seed)}`,
      );
    }
  }
  return { thieu, lech, thua };
}

/** Một dòng của bảng tổng. `null` = nhóm không có khái niệm đó. */
type DongTong = {
  ten: string;
  prod: number;
  seed: number | null;
  thieu: number | null;
  lech: number | null;
  thua: number | null;
  goTay: number;
  khongAudit: number;
};
const TONG: DongTong[] = [];

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(db), false);

  tieu("ĐO TOÀN BỘ DANH MỤC NỀN CHẤM CÔNG — PROD vs SEED (chỉ đọc)");
  console.log("Phạm vi seed `prisma/seed-cham-cong.ts` phụ trách: ĐÚNG 5 nhóm.");
  console.log("`Holiday` KHÔNG thuộc phạm vi đó — đo riêng ở mục 6, không so seed.");

  // ── 1. ShiftTemplate ───────────────────────────────────────────────────────
  // Seed chỉ tạo dòng DÙNG CHUNG (`centerId: null`). Dòng riêng của cơ sở là do người vận
  // hành tạo và KHÔNG phải chỗ lệch — đếm riêng để không tính nhầm thành "thừa".
  const caChung = await db.shiftTemplate.findMany({
    where: { centerId: null },
    select: {
      id: true, code: true, name: true, kind: true, segments: true, defaultPlace: true,
      attendanceMode: true, dayCredit: true, isLeave: true, nominalMinutes: true,
      payMode: true, amStart: true, amEnd: true, pmStart: true, pmEnd: true,
      pmBreakStart: true, pmBreakEnd: true, note: true, displayOrder: true, createdAt: true,
    },
    orderBy: { displayOrder: "asc" },
  });
  const caRieng = await db.shiftTemplate.count({ where: { centerId: { not: null } } });

  const kqCa = soNhom(
    "1. ShiftTemplate (mã ca dùng chung)",
    SHIFT_CATALOG,
    caChung,
    (x) => x.code as string,
    ["name", "kind", "segments", "defaultPlace", "attendanceMode", "dayCredit", "isLeave",
     "nominalMinutes", "payMode", "amStart", "amEnd", "pmStart", "pmEnd",
     "pmBreakStart", "pmBreakEnd", "note", "displayOrder"] as never[],
  );
  dong("dòng RIÊNG của cơ sở (không thuộc seed)", caRieng);
  muc("1b. ShiftTemplate — nguồn dữ liệu");
  const ngCa = await nguonCua("ShiftTemplate", caChung);
  inNguon("ShiftTemplate", ngCa,
    caChung.length ? caChung.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt : null);
  TONG.push({ ten: "ShiftTemplate", prod: caChung.length, seed: SHIFT_CATALOG.length,
    thieu: kqCa.thieu.length, lech: new Set(kqCa.lech.map((l) => l.ma)).size,
    thua: kqCa.thua.length, goTay: ngCa.goTay, khongAudit: ngCa.khongAudit });

  // ── 2. LeaveType ───────────────────────────────────────────────────────────
  const loaiNghi = await db.leaveType.findMany({
    select: { id: true, code: true, name: true, paidRatio: true, maxDaysPerYear: true,
      noticeDays: true, countsAsWorked: true, isActive: true, displayOrder: true, createdAt: true },
    orderBy: { displayOrder: "asc" },
  });
  const kqNghi = soNhom("2. LeaveType (loại nghỉ)", LEAVE_TYPE_CATALOG, loaiNghi, (x) => x.code as string,
    ["name", "paidRatio", "maxDaysPerYear", "countsAsWorked", "noticeDays"] as never[]);
  muc("2b. LeaveType — nguồn dữ liệu");
  const ngNghi = await nguonCua("LeaveType", loaiNghi);
  inNguon("LeaveType", ngNghi,
    loaiNghi.length ? loaiNghi.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt : null);
  TONG.push({ ten: "LeaveType", prod: loaiNghi.length, seed: LEAVE_TYPE_CATALOG.length,
    thieu: kqNghi.thieu.length, lech: new Set(kqNghi.lech.map((l) => l.ma)).size,
    thua: kqNghi.thua.length, goTay: ngNghi.goTay, khongAudit: ngNghi.khongAudit });

  // ── 3. SessionCategory ─────────────────────────────────────────────────────
  const phanLoai = await db.sessionCategory.findMany({
    select: { id: true, code: true, name: true, isDefault: true, countsTowardQuota: true,
      isActive: true, displayOrder: true, createdAt: true },
    orderBy: { displayOrder: "asc" },
  });
  const kqPL = soNhom("3. SessionCategory (phân loại buổi)", SESSION_CATEGORY_CATALOG, phanLoai,
    (x) => x.code as string, ["name", "isDefault", "countsTowardQuota"] as never[]);
  // Chỉ số VẬN HÀNH riêng: partial unique index cho ĐÚNG MỘT dòng mặc định. 0 dòng mặc định
  // là hỏng câm — mọi buổi mới không có phân loại.
  dong("số dòng đang giữ cờ isDefault (phải = 1)", phanLoai.filter((p) => p.isDefault).length);
  muc("3b. SessionCategory — nguồn dữ liệu");
  const ngPL = await nguonCua("SessionCategory", phanLoai);
  inNguon("SessionCategory", ngPL,
    phanLoai.length ? phanLoai.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt : null);
  TONG.push({ ten: "SessionCategory", prod: phanLoai.length, seed: SESSION_CATEGORY_CATALOG.length,
    thieu: kqPL.thieu.length, lech: new Set(kqPL.lech.map((l) => l.ma)).size,
    thua: kqPL.thua.length, goTay: ngPL.goTay, khongAudit: ngPL.khongAudit });

  // ── 4. TeachingCreditType ──────────────────────────────────────────────────
  const congDay = await db.teachingCreditType.findMany({
    select: { id: true, code: true, name: true, source: true, role: true, basis: true,
      factor: true, countsInPeriod: true, isActive: true, displayOrder: true, createdAt: true },
    orderBy: { displayOrder: "asc" },
  });
  const kqCD = soNhom("4. TeachingCreditType (loại công dạy)", TEACHING_CREDIT_CATALOG, congDay,
    (x) => x.code as string, ["name", "source", "role", "basis", "factor", "countsInPeriod"] as never[]);
  muc("4b. TeachingCreditType — nguồn dữ liệu");
  const ngCD = await nguonCua("TeachingCreditType", congDay);
  inNguon("TeachingCreditType", ngCD,
    congDay.length ? congDay.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt : null);
  TONG.push({ ten: "TeachingCreditType", prod: congDay.length, seed: TEACHING_CREDIT_CATALOG.length,
    thieu: kqCD.thieu.length, lech: new Set(kqCD.lech.map((l) => l.ma)).size,
    thua: kqCD.thua.length, goTay: ngCD.goTay, khongAudit: ngCD.khongAudit });

  // ── 5. WorkLocation ────────────────────────────────────────────────────────
  // KHÔNG theo danh mục mã nguồn: seed tạo 1 điểm cho MỖI Center đang hoạt động có `code`,
  // BỎ QUA "HO" (Q-04). Nên phép so đúng là "cơ sở nào chưa có điểm", không phải "mã nào thiếu".
  const diemCham = await db.workLocation.findMany({
    select: { id: true, code: true, name: true, centerId: true, latitude: true, longitude: true,
      radiusMeters: true, geofenceEnabled: true, isActive: true, createdAt: true },
    orderBy: { code: "asc" },
  });
  const coSo = await db.center.findMany({
    where: { isActive: true, code: { not: null } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const coSoVanHanh = coSo.filter((c) => c.code !== "HO");
  const maDiem = new Set(diemCham.map((d) => d.code));
  const coSoThieuDiem = coSoVanHanh.filter((c) => !maDiem.has(c.code as string));

  muc("5. WorkLocation (điểm chấm) — so theo CƠ SỞ, không theo danh mục");
  dong("điểm chấm trên PROD", diemCham.length);
  dong("cơ sở đang hoạt động có code", coSo.length);
  dong("  trong đó VẬN HÀNH (bỏ HO — Q-04)", coSoVanHanh.length);
  dong("cơ sở vận hành CHƯA có điểm chấm", coSoThieuDiem.length);
  if (coSoThieuDiem.length) console.log(`  thiếu: ${coSoThieuDiem.map((c) => c.code).join(", ")}`);
  dong("điểm chấm ĐANG BẬT geofence", diemCham.filter((d) => d.geofenceEnabled).length);
  dong("điểm chấm THIẾU toạ độ (lat hoặc lng null)",
    diemCham.filter((d) => d.latitude === null || d.longitude === null).length);
  for (const d of diemCham) {
    console.log(
      `    ${(d.code ?? "").padEnd(10)} ${(d.name ?? "").slice(0, 26).padEnd(28)}` +
      ` lat=${d.latitude ?? "null"} lng=${d.longitude ?? "null"} r=${d.radiusMeters}` +
      ` geofence=${d.geofenceEnabled} bật=${d.isActive}`,
    );
  }
  muc("5b. WorkLocation — nguồn dữ liệu");
  const ngDiem = await nguonCua("WorkLocation", diemCham);
  inNguon("WorkLocation", ngDiem,
    diemCham.length ? diemCham.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt : null);
  TONG.push({ ten: "WorkLocation", prod: diemCham.length, seed: null,
    thieu: coSoThieuDiem.length, lech: null, thua: null,
    goTay: ngDiem.goTay, khongAudit: ngDiem.khongAudit });

  // ── 6. Holiday — NGOÀI phạm vi seed chấm công ──────────────────────────────
  const namNay = new Date().getUTCFullYear();
  const ngayLe = await db.holiday.findMany({
    select: { id: true, date: true, createdAt: true },
    orderBy: { date: "asc" },
  });
  muc("6. Holiday — KHÔNG do seed-cham-cong phụ trách, đo để biết có dữ liệu chưa");
  dong("tổng dòng trên PROD", ngayLe.length);
  const theoNam = new Map<number, number>();
  for (const h of ngayLe) {
    const y = h.date.getUTCFullYear();
    theoNam.set(y, (theoNam.get(y) ?? 0) + 1);
  }
  for (const [y, n] of [...theoNam.entries()].sort((a, b) => a[0] - b[0])) dong(`  năm ${y}`, n);
  dong(`ngày lễ năm ${namNay}`, theoNam.get(namNay) ?? 0);
  dong(`ngày lễ năm ${namNay + 1}`, theoNam.get(namNay + 1) ?? 0);
  muc("6b. Holiday — nguồn dữ liệu");
  const nguonLe = await nguonCua(
    "Holiday",
    ngayLe.map((h) => ({ id: h.id, code: h.date.toISOString().slice(0, 10), createdAt: h.createdAt })),
  );
  inNguon("Holiday", nguonLe,
    ngayLe.length ? ngayLe.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt : null);
  TONG.push({ ten: "Holiday (ngoài seed)", prod: ngayLe.length, seed: null,
    thieu: null, lech: null, thua: null, goTay: nguonLe.goTay, khongAudit: nguonLe.khongAudit });

  // ── 7. Bảng tổng — đọc dòng này TRƯỚC, chi tiết ở mục 1–6 ──────────────────
  tieu("BẢNG TỔNG — đọc dòng này trước");
  console.log(
    "  nhóm                        prod   seed  thiếu   lệch  thừa  gõ-tay  ko-audit",
  );
  console.log("  " + "-".repeat(76));
  for (const r of TONG) {
    console.log(
      "  " +
        r.ten.padEnd(26) +
        String(r.prod).padStart(6) +
        String(r.seed === null ? "—" : r.seed).padStart(7) +
        String(r.thieu === null ? "—" : r.thieu).padStart(7) +
        String(r.lech === null ? "—" : r.lech).padStart(7) +
        String(r.thua === null ? "—" : r.thua).padStart(6) +
        String(r.goTay).padStart(8) +
        String(r.khongAudit).padStart(10),
    );
  }
  console.log("");
  console.log("  Cột 'gõ-tay'   = số dòng CÓ AuditLog CREATE  ⇒ vào bằng màn quản trị.");
  console.log("  Cột 'ko-audit' = số dòng KHÔNG có            ⇒ nhiều khả năng do seed.");
  console.log("  '—' = nhóm không so được với seed (WorkLocation theo cơ sở · Holiday ngoài phạm vi).");
  console.log("  ⚠️ 'ko-audit' là bằng chứng ÂM — xem phần cảnh báo ở đầu file trước khi kết luận.");

  console.log("");
  console.log("Toàn bộ phép đo trên là SELECT. Không dòng nào bị ghi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
