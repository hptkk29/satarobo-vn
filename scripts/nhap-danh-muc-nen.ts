/**
 * scripts/nhap-danh-muc-nen.ts — NHẬP nốt danh mục nền chấm công, chiều seed → prod.
 *
 * ⚠️ CHẠY THỬ LÀ MẶC ĐỊNH. Ghi thật phải có `--apply`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG DÙNG `prisma/seed-cham-cong.ts --force`
 *
 * `--force` làm đúng phần lớn việc này, nhưng nó ĐÈ TOÀN BỘ mọi trường của mọi dòng —
 * kể cả trường chưa ai đo. Cụ thể: `displayOrder` của `LeaveType` và `SessionCategory`
 * KHÔNG nằm trong phép đo 09/09, nên nếu người vận hành đã sắp lại thứ tự trên màn thì
 * `--force` xoá lựa chọn đó mà không ai nhìn thấy.
 *
 * File này chạm ĐÚNG những trường đã đo và đã được chủ dự án chốt, không hơn một trường.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HAI CỔNG, BỎ CÁI NÀO CŨNG MỞ LẠI MỘT ĐƯỜNG GHI ĐÈ MÙ
 *
 * 1. DANH SÁCH DUYỆT (`DUYET` dưới đây). Một trường lệch mà KHÔNG có tên trong danh sách
 *    thì script **không chạm**, và in nó ra mục "CHƯA DUYỆT". Nó không tự quyết.
 * 2. ĐIỀU KIỆN `chiKhi`. Mỗi mục duyệt kèm giá trị prod mà phép đo 09/09 nhìn thấy. Nếu
 *    lúc chạy prod đã mang giá trị KHÁC — ai đó vừa sửa trên màn — thì script BỎ QUA mục
 *    đó và báo. Danh sách duyệt là ảnh chụp một thời điểm; giữa lúc chụp và lúc bấm, người
 *    thật vẫn đang làm việc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHẠM VI — ba phần, chạy theo đúng thứ tự này
 *
 *   a. TeachingCreditType — 6 dòng, bảng đang RỖNG.
 *      ⚠️ LÀM TRƯỚC TIÊN. Bảng rỗng ⇒ `loadLoaiCongDay()` trả mảng rỗng ⇒ `loaiCua()` trả
 *      null ⇒ `congDayCuaNguoi` bỏ MỌI buổi ⇒ công dạy = 0 cho mọi giáo viên, im lặng.
 *      Đây là nguyên nhân ĐỦ THỨ HAI của "công dạy = 0", độc lập với nguyên nhân buổi chưa
 *      đóng đã vá. Không vá cái này thì phép quan sát ba ngày tới sẽ vẫn ra 0 và ta kết
 *      luận sai rằng bản vá kia không chạy. Xem luật 15.
 *
 *      Thứ tự này AN TOÀN dù `seed-core.ts` dặn chạy `SessionCategory` trước: lời dặn đó
 *      là vì FK `TeachingCreditType.categoryId → SessionCategory` để `onDelete: Restrict`.
 *      Cả 6 dòng ở đây mang `categoryId = null` (dòng BAO SÂN) nên không có FK nào để vướng.
 *
 *   b. SessionCategory — 7 dòng, bảng đang RỖNG. Đúng MỘT dòng giữ `isDefault`
 *      (partial unique index `SessionCategory_one_default` ép, không phải lời hứa).
 *
 *   c. Vá trường lệch trên dòng ĐÃ CÓ: 14 trường của 11 mã ca + 6 trường của 5 loại nghỉ.
 *
 * KHÔNG chạm `WorkLocation` (đo 09/09: 0 cơ sở thiếu điểm) và KHÔNG chạm `Holiday`
 * (ngoài phạm vi seed chấm công — đã tách vé riêng).
 *
 * CHẠY:
 *   pnpm tsx scripts/nhap-danh-muc-nen.ts             # chạy thử, in bảng trước→sau
 *   pnpm tsx scripts/nhap-danh-muc-nen.ts --apply     # ghi thật
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
const GHI = process.argv.includes("--apply");

// ── in ấn ────────────────────────────────────────────────────────────────────
function tieu(s: string) {
  console.log("");
  console.log("═".repeat(92));
  console.log(s);
  console.log("═".repeat(92));
}
function muc(s: string) {
  console.log("");
  console.log(`── ${s} ${"─".repeat(Math.max(0, 86 - s.length))}`);
}
function gon(v: unknown, n = 46): string {
  const s = v === null || v === undefined ? "null" : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Sắp khoá trước khi so — Postgres `jsonb` sắp xếp lại khoá, `JSON.stringify` thì nhạy. */
function chuan(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(chuan);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const ra: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) ra[k] = chuan(o[k]);
    return ra;
  }
  return v;
}
function bangNhau(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  return JSON.stringify(chuan(a)) === JSON.stringify(chuan(b));
}

// ── CỔNG 2: điều kiện giá trị prod hiện tại ──────────────────────────────────
type DieuKien = (prod: unknown, seed: unknown) => boolean;

/** Prod đang TRỐNG — ca an toàn nhất, không có gì để mất. */
const dangTrong: DieuKien = (p) => p === null || p === undefined;

/** Prod đang mang đúng giá trị này (mặc định của form trống, hoặc chuỗi đã đo). */
const dangLa = (v: unknown): DieuKien => (p) => bangNhau(p, v);

/**
 * Prod bằng seed SAU KHI bỏ khoá `place` khỏi từng đoạn.
 *
 * Đây là hình dạng của cả 5 mã ca lệch `segments`: form quản trị không có ô `place` cho
 * từng đoạn nên người gõ dựng được đúng giờ, thiếu đúng nơi làm. Diễn đạt điều kiện theo
 * ĐÚNG hình dạng đó — chứ không chép cứng chuỗi JSON — để nếu prod lệch thêm bất kỳ chỗ
 * nào khác (một giờ bị sửa chẳng hạn) thì script từ chối thay vì đè lên.
 */
const chiThieuPlace: DieuKien = (prod, seed) => {
  if (!Array.isArray(prod) || !Array.isArray(seed)) return false;
  const boPlace = (xs: unknown[]) =>
    xs.map((x) => {
      const { place: _bo, ...con } = (x ?? {}) as Record<string, unknown>;
      void _bo;
      return con;
    });
  return bangNhau(boPlace(prod), boPlace(seed));
};

// ── CỔNG 1: DANH SÁCH DUYỆT ──────────────────────────────────────────────────
//
// Nguồn: phép đo prod 09/09/2026 (`scripts/do-danh-muc-nen.ts`, chạy qua workflow ĐO bằng
// user chỉ-đọc) + bốn câu chủ dự án chốt cùng ngày.
//
// KHÔNG thêm dòng vào đây mà không có phép đo và một câu chốt. Danh sách này là chỗ duy
// nhất script được phép ghi đè giá trị prod đang có.
type MucDuyet = {
  ma: string;
  truong: string;
  viSao: string;
  chiKhi: DieuKien;
};

const DUYET_CA: MucDuyet[] = [
  // — mặc định của form trống rò ra, không phải lựa chọn —
  { ma: "HC", truong: "segments", viSao: "form không có ô `place` từng đoạn", chiKhi: chiThieuPlace },
  { ma: "12", truong: "segments", viSao: "form không có ô `place` từng đoạn", chiKhi: chiThieuPlace },
  { ma: "21", truong: "segments", viSao: "form không có ô `place` từng đoạn", chiKhi: chiThieuPlace },
  { ma: "2C", truong: "segments", viSao: "form không có ô `place` từng đoạn", chiKhi: chiThieuPlace },
  { ma: "NG", truong: "segments", viSao: "form không có ô `place` từng đoạn", chiKhi: chiThieuPlace },
  { ma: "2C", truong: "defaultPlace", viSao: "HOME là mặc định form; ca 2 cơ sở phải là ANY_CENTER", chiKhi: dangLa("HOME") },

  // — trường đang TRỐNG —
  { ma: "CS", truong: "note", viSao: "prod bỏ trống", chiKhi: dangTrong },
  { ma: "HC", truong: "note", viSao: "prod bỏ trống", chiKhi: dangTrong },
  { ma: "SCT", truong: "note", viSao: "prod bỏ trống", chiKhi: dangTrong },
  { ma: "NG", truong: "nominalMinutes", viSao: "prod bỏ trống; 450 phút = 7h30 công tác ngoài", chiKhi: dangTrong },

  // — bốn câu chủ dự án chốt 09/09 —
  {
    ma: "CG",
    truong: "name",
    viSao: "chốt: lấy seed, đồng bộ chữ hoa/thường với 20 mã còn lại",
    chiKhi: dangLa("CA GÃY"),
  },
  {
    ma: "CT",
    truong: "note",
    viSao:
      "chốt: lấy seed. Hai câu KHÔNG mâu thuẫn — 13:45→21:00 đúng bằng 7h15 vì nghỉ " +
      "16:30–17:30 TÍNH vào giờ làm. Prod tả KẾT QUẢ, seed tả CƠ CHẾ; giữ seed vì nó nói được VÌ SAO",
    chiKhi: dangLa("Liền 13:45–21:00 = 7h15"),
  },
  {
    ma: "X",
    truong: "payMode",
    viSao: "chốt: lấy seed NONE. SHIFT là mặc định form rò ra — 'Nghỉ' mà trả lương theo ca là sai nghĩa",
    chiKhi: dangLa("SHIFT"),
  },
  {
    ma: "P",
    truong: "payMode",
    viSao: "chốt: lấy seed NONE. Cùng lý do mã X",
    chiKhi: dangLa("SHIFT"),
  },
];

const DUYET_NGHI: MucDuyet[] = [
  { ma: "NGHI_PHEP", truong: "noticeDays", viSao: "cột thêm sau, prod bỏ trống", chiKhi: dangTrong },
  { ma: "KHONG_LUONG", truong: "noticeDays", viSao: "cột thêm sau, prod bỏ trống", chiKhi: dangTrong },
  { ma: "KET_HON", truong: "noticeDays", viSao: "cột thêm sau, prod bỏ trống", chiKhi: dangTrong },
  { ma: "CON_KET_HON", truong: "noticeDays", viSao: "cột thêm sau, prod bỏ trống", chiKhi: dangTrong },
  { ma: "NGHI_BU", truong: "noticeDays", viSao: "cột thêm sau, prod bỏ trống", chiKhi: dangTrong },
  {
    ma: "NGHI_BU",
    truong: "countsAsWorked",
    viSao:
      "chốt: lấy seed true. Nghỉ bù là nghỉ ĐỀN cho ngày đã làm thêm — để false nghĩa là " +
      "người ta làm thêm một ngày rồi mất một công. Chủ dự án sẽ xác nhận lại với Nhân sự",
    chiKhi: dangLa(false),
  },
];

// ── tính KẾ HOẠCH ────────────────────────────────────────────────────────────
type Sua = { ma: string; truong: string; truoc: unknown; sau: unknown; viSao: string };
type ChuaDuyet = { ma: string; truong: string; truoc: unknown; seed: unknown; vuong: string };

function tinhKeHoach<TDb extends Record<string, unknown>, TSeed extends Record<string, unknown>>(
  seed: readonly TSeed[],
  tren: TDb[],
  truong: string[],
  duyet: MucDuyet[],
): { sua: Sua[]; chuaDuyet: ChuaDuyet[]; thieu: string[] } {
  const theoMa = new Map(tren.map((r) => [String(r.code), r]));
  const sua: Sua[] = [];
  const chuaDuyet: ChuaDuyet[] = [];
  const thieu: string[] = [];

  for (const s of seed) {
    const ma = String(s.code);
    const r = theoMa.get(ma);
    if (!r) {
      thieu.push(ma);
      continue;
    }
    for (const f of truong) {
      if (bangNhau(r[f], s[f])) continue;
      const d = duyet.find((x) => x.ma === ma && x.truong === f);
      if (!d) {
        chuaDuyet.push({ ma, truong: f, truoc: r[f], seed: s[f], vuong: "KHÔNG có trong danh sách duyệt" });
        continue;
      }
      if (!d.chiKhi(r[f], s[f])) {
        chuaDuyet.push({
          ma,
          truong: f,
          truoc: r[f],
          seed: s[f],
          vuong: "prod ĐÃ ĐỔI so với lúc đo 09/09 — điều kiện `chiKhi` không thoả",
        });
        continue;
      }
      sua.push({ ma, truong: f, truoc: r[f], sau: s[f], viSao: d.viSao });
    }
  }
  return { sua, chuaDuyet, thieu };
}

function inSua(nhom: string, kq: { sua: Sua[]; chuaDuyet: ChuaDuyet[]; thieu: string[] }) {
  muc(nhom);
  if (!kq.sua.length && !kq.chuaDuyet.length && !kq.thieu.length) {
    console.log("  không có gì để làm — prod đã khớp seed ở mọi trường đo.");
    return;
  }
  if (kq.thieu.length) console.log(`  ⚠️ THIẾU HẲN DÒNG (script này không tạo): ${kq.thieu.join(", ")}`);
  if (kq.sua.length) {
    console.log(`  SẼ SỬA ${kq.sua.length} trường:`);
    console.log(`    ${"mã".padEnd(14)}${"trường".padEnd(16)}${"TRƯỚC".padEnd(48)}SAU`);
    for (const s of kq.sua) {
      console.log(`    ${s.ma.padEnd(14)}${s.truong.padEnd(16)}${gon(s.truoc).padEnd(48)}${gon(s.sau)}`);
      console.log(`      ↳ ${s.viSao}`);
    }
  }
  if (kq.chuaDuyet.length) {
    console.log("");
    console.log(`  🔶 KHÔNG CHẠM ${kq.chuaDuyet.length} trường — cần chủ dự án quyết:`);
    for (const c of kq.chuaDuyet) {
      console.log(`    ${c.ma.padEnd(14)}${c.truong.padEnd(16)}prod=${gon(c.truoc)}  seed=${gon(c.seed)}`);
      console.log(`      ↳ ${c.vuong}`);
    }
  }
}

const TRUONG_CA = [
  "name", "kind", "segments", "defaultPlace", "attendanceMode", "dayCredit", "isLeave",
  "nominalMinutes", "payMode", "amStart", "amEnd", "pmStart", "pmEnd",
  "pmBreakStart", "pmBreakEnd", "note", "displayOrder",
];
const TRUONG_NGHI = ["name", "paidRatio", "maxDaysPerYear", "countsAsWorked", "noticeDays"];

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(db), GHI);
  tieu(GHI ? "NHẬP DANH MỤC NỀN — GHI THẬT (--apply)" : "NHẬP DANH MỤC NỀN — CHẠY THỬ (chưa ghi gì)");
  if (!GHI) console.log("Không có `--apply` ⇒ chỉ in kế hoạch. Không câu lệnh ghi nào chạy.");

  // ── a. TeachingCreditType — LÀM TRƯỚC TIÊN ─────────────────────────────────
  const congDayCo = await db.teachingCreditType.findMany({ select: { code: true } });
  const coCD = new Set(congDayCo.map((x) => x.code));
  const taoCD = TEACHING_CREDIT_CATALOG.filter((t) => !coCD.has(t.code));
  muc("a. TeachingCreditType (loại công dạy) — nguyên nhân ĐỦ của 'công dạy = 0'");
  console.log(`  đang có ${congDayCo.length} · sẽ TẠO ${taoCD.length}`);
  for (const [i, t] of taoCD.entries()) {
    console.log(
      `    + ${t.code.padEnd(14)}${t.name.padEnd(36)}${t.source}/${t.role}/${t.basis}` +
        ` hệ số=${t.factor} vàoKỳ=${t.countsInPeriod} thứ tự=${i + 1} phânLoại=null(bao sân)`,
    );
  }
  if (GHI && taoCD.length) {
    for (const [i, t] of taoCD.entries()) {
      await db.teachingCreditType.create({ data: { ...t, displayOrder: i + 1 } });
    }
    console.log(`  ✓ đã tạo ${taoCD.length} dòng.`);
  }

  // ── b. SessionCategory ─────────────────────────────────────────────────────
  const plCo = await db.sessionCategory.findMany({ select: { code: true, isDefault: true } });
  const coPL = new Set(plCo.map((x) => x.code));
  const taoPL = SESSION_CATEGORY_CATALOG.filter((c) => !coPL.has(c.code));
  const daiGiuMacDinh = plCo.find((x) => x.isDefault)?.code ?? null;
  muc("b. SessionCategory (phân loại buổi)");
  console.log(`  đang có ${plCo.length} · sẽ TẠO ${taoPL.length} · dòng đang giữ isDefault: ${daiGiuMacDinh ?? "KHÔNG CÓ"}`);
  for (const [i, c] of taoPL.entries()) {
    // Chỉ đặt mặc định khi CHƯA ai giữ cờ — cùng luật "nhường" của `seedSessionCategories`:
    // partial unique index chỉ cho một dòng, và dòng đang giữ có thể là lựa chọn của người vận hành.
    const datMacDinh = c.isDefault && daiGiuMacDinh === null;
    console.log(
      `    + ${c.code.padEnd(16)}${c.name.padEnd(34)}mặcĐịnh=${datMacDinh}` +
        `${c.isDefault && !datMacDinh ? "  (NHƯỜNG — đã có dòng khác giữ)" : ""}` +
        ` vàoĐịnhMức=${c.countsTowardQuota} thứ tự=${i + 1}`,
    );
  }
  if (GHI && taoPL.length) {
    for (const [i, c] of taoPL.entries()) {
      const datMacDinh = c.isDefault && daiGiuMacDinh === null;
      await db.sessionCategory.create({ data: { ...c, isDefault: datMacDinh, displayOrder: i + 1 } });
    }
    console.log(`  ✓ đã tạo ${taoPL.length} dòng.`);
  }

  // ── c. Vá trường lệch trên dòng đã có ──────────────────────────────────────
  const caChung = await db.shiftTemplate.findMany({
    where: { centerId: null },
    select: {
      id: true, code: true, name: true, kind: true, segments: true, defaultPlace: true,
      attendanceMode: true, dayCredit: true, isLeave: true, nominalMinutes: true,
      payMode: true, amStart: true, amEnd: true, pmStart: true, pmEnd: true,
      pmBreakStart: true, pmBreakEnd: true, note: true, displayOrder: true,
    },
  });
  const kqCa = tinhKeHoach(SHIFT_CATALOG, caChung, TRUONG_CA, DUYET_CA);
  inSua("c1. ShiftTemplate — vá trường lệch trên 21 dòng đã có", kqCa);

  const loaiNghi = await db.leaveType.findMany({
    select: {
      id: true, code: true, name: true, paidRatio: true, maxDaysPerYear: true,
      noticeDays: true, countsAsWorked: true,
    },
  });
  const kqNghi = tinhKeHoach(LEAVE_TYPE_CATALOG, loaiNghi, TRUONG_NGHI, DUYET_NGHI);
  inSua("c2. LeaveType — vá trường lệch trên 8 dòng đã có", kqNghi);

  if (GHI) {
    // Gom theo MÃ rồi ghi MỘT câu update cho mỗi dòng: `updatedAt` nhảy một lần, và audit
    // đọc sau này thấy một lượt sửa chứ không phải bốn lượt rời rạc trong cùng giây.
    const goms = (sua: Sua[]) => {
      const m = new Map<string, Record<string, unknown>>();
      for (const s of sua) m.set(s.ma, { ...(m.get(s.ma) ?? {}), [s.truong]: s.sau });
      return m;
    };
    for (const [ma, data] of goms(kqCa.sua)) {
      const r = caChung.find((x) => x.code === ma)!;
      await db.shiftTemplate.update({ where: { id: r.id }, data });
    }
    for (const [ma, data] of goms(kqNghi.sua)) {
      const r = loaiNghi.find((x) => x.code === ma)!;
      await db.leaveType.update({ where: { id: r.id }, data });
    }
    console.log("");
    console.log(`  ✓ đã sửa ${goms(kqCa.sua).size} mã ca và ${goms(kqNghi.sua).size} loại nghỉ.`);
  }

  // ── tổng ───────────────────────────────────────────────────────────────────
  const chuaDuyet = [...kqCa.chuaDuyet, ...kqNghi.chuaDuyet];
  tieu(GHI ? "ĐÃ GHI" : "CHẠY THỬ — CHƯA GHI GÌ");
  console.log(`  tạo mới:  ${taoCD.length} loại công dạy · ${taoPL.length} phân loại buổi`);
  console.log(`  sửa:      ${kqCa.sua.length} trường mã ca · ${kqNghi.sua.length} trường loại nghỉ`);
  console.log(`  KHÔNG chạm: ${chuaDuyet.length} trường (cần chủ dự án quyết)`);
  console.log("  KHÔNG chạm WorkLocation (đo 09/09: 0 cơ sở thiếu điểm) và Holiday (ngoài phạm vi, đã tách vé).");
  if (!GHI) {
    console.log("");
    console.log("  Chưa ghi gì. Thêm `--apply` để ghi thật.");
  } else {
    console.log("");
    console.log("  ⚠️ ĐO LẠI ngay bằng workflow ĐO (viec = danh-muc-nen) — đừng tin log này.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
