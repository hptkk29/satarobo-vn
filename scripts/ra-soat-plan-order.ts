/**
 * BƯỚC 2c — đo hai thứ quyết định Bước 3. CHỈ ĐỌC.
 *
 * ⚠️ KHÔNG GHI GÌ: chỉ `findMany`. Kiểm: grep lệnh ghi trên file này → 0 dòng mã.
 *
 * (A) ĐỘ PHỦ CỦA `ClassSessionPlan.order` — nếu đổi "Buổi N" sang `plan.order`,
 *     bao nhiêu lớp/buổi hiển thị ĐÚNG, bao nhiêu rơi vào fallback?
 *
 * (B) TÁCH CHUỖI CHÉP cho Q4, áp ĐÚNG `meaningful()` của hàm thật.
 *     `meaningful` là hàm private của `session-project-name.ts`, nhưng cô lập được:
 *     `deriveSessionTitle({ planTitle: X, lessonTitle: null, topic: null })` trả
 *     `meaningful(X)` hoặc "". Nhờ vậy dùng LUẬT THẬT chứ không chép lại.
 *
 * CHẠY: PROD_READONLY_URL='postgresql://…:5432/postgres' pnpm exec tsx scripts/ra-soat-plan-order.ts
 */
import { PrismaClient } from "@prisma/client";
import { meaningfulSessionTitle } from "../lib/lms/session-project-name";

const BIEN = process.env.PROD_READONLY_URL ? "PROD_READONLY_URL" : "DATABASE_URL";
const CHUOI = process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "";
const db = new PrismaClient({ datasources: { db: { url: CHUOI } } });

/**
 * Chuẩn hoá tên bài để SO SÁNH — dùng HÀM THẬT `meaningfulSessionTitle`:
 * `clean()` + coi ô trống `"Buổi N"` là rỗng + cắt tiền tố `"Buổi N —"` + **gỡ `"HPn - "`**.
 *
 * ⚠️ 08/09 — bản đo TRƯỚC chỉ `trim`+`lowercase`, nên `"Bàn tay ma thuật"` KHÔNG khớp
 * `"HP1 - Bàn tay ma thuật"` và 41 chuỗi bị xếp nhầm vào nhóm "không trùng bài nào".
 */
function chuanDeSo(s: string | null | undefined): string {
  return meaningfulSessionTitle(s).trim().toLowerCase();
}

/** Chuỗi có "có nghĩa" theo luật thật không (loại `"Buổi 7"`, chuỗi rỗng…). */
function coNghia(s: string | null | undefined): boolean {
  return meaningfulSessionTitle(s) !== "";
}

function nguonDb(): string {
  try {
    const u = new URL(CHUOI);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(không đọc được)";
  }
}

async function main() {
  console.log("# BƯỚC 2c — độ phủ plan.order + tách chuỗi chép (CHỈ ĐỌC)");
  console.log(`DB: ${nguonDb()}   [biến: ${BIEN}]`);
  console.log("");

  const classes = await db.class.findMany({
    where: { deletedAt: null },
    select: { id: true, classCode: true, name: true, courseId: true, curriculumId: true },
  });
  const sessions = await db.classSession.findMany({
    select: { id: true, classId: true, date: true, lessonId: true, planId: true, topic: true },
  });
  const plans = await db.classSessionPlan.findMany({
    select: { id: true, classId: true, seq: true, order: true, lessonId: true, customTitle: true },
  });
  const lessons = await db.lesson.findMany({
    select: { id: true, curriculumId: true, order: true, title: true },
  });
  const curricula = await db.curriculum.findMany({
    select: { id: true, courseId: true, version: true, isActive: true },
  });

  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const planById = new Map(plans.map((p) => [p.id, p]));
  const buoiTheoLop = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const a = buoiTheoLop.get(s.classId) ?? [];
    a.push(s);
    buoiTheoLop.set(s.classId, a);
  }
  const planTheoLop = new Map<string, typeof plans>();
  for (const p of plans) {
    const a = planTheoLop.get(p.classId) ?? [];
    a.push(p);
    planTheoLop.set(p.classId, a);
  }
  const activeTheoCourse = new Map<string, string>();
  for (const c of [...curricula].sort((a, b) => b.version - a.version)) {
    if (c.isActive && !activeTheoCourse.has(c.courseId)) activeTheoCourse.set(c.courseId, c.id);
  }
  // Tên bài → tập giáo trình chứa nó (cho phép đo B).
  const gtCoTen = new Map<string, Set<string>>();
  for (const l of lessons) {
    const k = chuanDeSo(l.title);
    if (!k) continue;
    const set = gtCoTen.get(k) ?? new Set<string>();
    set.add(l.curriculumId);
    gtCoTen.set(k, set);
  }

  // ══ (A) ĐỘ PHỦ plan.order ═════════════════════════════════════════════════
  console.log("## (A) Độ phủ ClassSessionPlan.order");
  const A = {
    lopGhim: 0, buoiGhim: 0, lopKhongGhim: 0, buoiKhongGhim: 0,
    lopPlanDu: 0, lopPlanThieu: 0, lopKhongPlan: 0,
    buoiCoPlan: 0, buoiKhongPlan: 0,
    lopOrderLienTuc: 0, lopOrderHo: 0, lopOrderTrung: 0, lopPlanKhop11: 0,
    buoiLessonKhacPlan: 0,
  };
  const chiTiet: string[] = [];

  for (const cls of classes) {
    const buoi = buoiTheoLop.get(cls.id) ?? [];
    if (buoi.length === 0) continue;
    const ps = (planTheoLop.get(cls.id) ?? []).slice().sort((a, b) => a.order - b.order || a.seq - b.seq);

    if (cls.curriculumId) { A.lopGhim += 1; A.buoiGhim += buoi.length; }
    else { A.lopKhongGhim += 1; A.buoiKhongGhim += buoi.length; }

    const coPlan = buoi.filter((s) => s.planId !== null).length;
    A.buoiCoPlan += coPlan;
    A.buoiKhongPlan += buoi.length - coPlan;
    if (ps.length === 0) A.lopKhongPlan += 1;
    else if (coPlan === buoi.length) A.lopPlanDu += 1;
    else A.lopPlanThieu += 1;

    // order liên tục 0..N-1? trùng?
    let lienTuc = ps.length > 0;
    let trung = false;
    const seen = new Set<number>();
    for (let i = 0; i < ps.length; i++) {
      const o = ps[i]!.order;
      if (seen.has(o)) trung = true;
      seen.add(o);
      if (o !== i) lienTuc = false;
    }
    if (ps.length > 0) {
      if (trung) A.lopOrderTrung += 1;
      else if (lienTuc) A.lopOrderLienTuc += 1;
      else A.lopOrderHo += 1;
    }

    // plan.order ↔ lesson.order khớp 1-1 (order i ↔ lesson.order i+1)?
    let khop11 = ps.length > 0;
    for (let i = 0; i < ps.length; i++) {
      const l = ps[i]!.lessonId ? lessonById.get(ps[i]!.lessonId!) : null;
      if (!l || l.order !== i + 1) { khop11 = false; break; }
    }
    if (khop11) A.lopPlanKhop11 += 1;

    // buổi có lessonId KHÁC lesson của plan chính nó
    let lech = 0;
    for (const s of buoi) {
      if (!s.planId) continue;
      const p = planById.get(s.planId);
      if (!p) continue;
      if ((p.lessonId ?? null) !== (s.lessonId ?? null)) lech += 1;
    }
    A.buoiLessonKhacPlan += lech;

    chiTiet.push(
      [cls.classCode ?? cls.name, buoi.length, ps.length, coPlan,
        cls.curriculumId ? "ghim" : "-",
        ps.length === 0 ? "khôngPlan" : trung ? "TRÙNG" : lienTuc ? "liênTục" : "HỔNG",
        khop11 ? "khớp1-1" : "KHÔNG",
        lech].join("\t"),
    );
  }

  console.log(`lớp có buổi:                    ${A.lopGhim + A.lopKhongGhim}`);
  console.log(`  ghim giáo trình:              ${A.lopGhim} lớp / ${A.buoiGhim} buổi`);
  console.log(`  KHÔNG ghim:                   ${A.lopKhongGhim} lớp / ${A.buoiKhongGhim} buổi`);
  console.log(`  plan ĐỦ (mọi buổi có plan):   ${A.lopPlanDu} lớp`);
  console.log(`  plan THIẾU một phần:          ${A.lopPlanThieu} lớp`);
  console.log(`  KHÔNG có dòng plan nào:       ${A.lopKhongPlan} lớp`);
  console.log(`  buổi CÓ planId:               ${A.buoiCoPlan}`);
  console.log(`  buổi KHÔNG có planId:         ${A.buoiKhongPlan}  ← rơi vào fallback`);
  console.log(`  lớp order liên tục 0..N-1:    ${A.lopOrderLienTuc}`);
  console.log(`  lớp order HỔNG (không liên tục): ${A.lopOrderHo}`);
  console.log(`  lớp order TRÙNG:              ${A.lopOrderTrung}`);
  console.log(`  lớp plan khớp 1-1 lesson.order: ${A.lopPlanKhop11}`);
  console.log(`  buổi có lessonId KHÁC plan:   ${A.buoiLessonKhacPlan}`);
  console.log("");
  console.log("mã lớp\tbuổi\tplan\tbuổiCóPlan\tghim\torder\tkhớp1-1\tlệchPlan");
  for (const d of chiTiet) console.log(d);
  console.log("");

  // ══ (B) TÁCH CHUỖI CHÉP — áp meaningful() thật ════════════════════════════
  console.log("## (B) Chuỗi chép, áp meaningful() của hàm thật");
  const B = {
    planPlaceholder: 0, planTrungGtLop: 0, planTrungGtKhac: 0, planKhongTrung: 0, planTrong: 0,
    topicPlaceholder: 0, topicTrungGtLop: 0, topicTrungGtKhac: 0, topicKhongTrung: 0, topicTrong: 0,
  };
  const mauKhongTrung: string[] = [];

  for (const cls of classes) {
    const buoi = buoiTheoLop.get(cls.id) ?? [];
    if (buoi.length === 0) continue;
    const curId = cls.curriculumId ?? activeTheoCourse.get(cls.courseId) ?? null;

    for (const s of buoi) {
      const p = s.planId ? planById.get(s.planId) : null;
      for (const [nguon, chuoi] of [["plan", p?.customTitle ?? null], ["topic", s.topic]] as const) {
        const la = nguon === "plan";
        if (!chuoi || !chuoi.trim()) { if (la) B.planTrong += 1; else B.topicTrong += 1; continue; }
        if (!coNghia(chuoi)) { if (la) B.planPlaceholder += 1; else B.topicPlaceholder += 1; continue; }
        const set = gtCoTen.get(chuanDeSo(chuoi));
        if (set && curId && set.has(curId)) { if (la) B.planTrungGtLop += 1; else B.topicTrungGtLop += 1; }
        else if (set) { if (la) B.planTrungGtKhac += 1; else B.topicTrungGtKhac += 1; }
        else {
          if (la) B.planKhongTrung += 1; else B.topicKhongTrung += 1;
          {
            mauKhongTrung.push(`  [${nguon}] ${cls.classCode ?? cls.name} · ${chuoi.trim().slice(0, 60)}`);
          }
        }
      }
    }
  }

  console.log("customTitle:");
  console.log(`  trống / null:                       ${B.planTrong}`);
  console.log(`  placeholder (meaningful() LOẠI):    ${B.planPlaceholder}  ← rác máy sinh, KHÔNG che FK`);
  console.log(`  trùng tên bài GIÁO TRÌNH CỦA LỚP:   ${B.planTrungGtLop}`);
  console.log(`  trùng tên bài giáo trình KHÁC:      ${B.planTrungGtKhac}  ← nghi giáo trình cũ`);
  console.log(`  KHÔNG trùng bài nào:                ${B.planKhongTrung}  ← nghi GV tự đặt, PHẢI GIỮ`);
  console.log("topic:");
  console.log(`  trống / null:                       ${B.topicTrong}`);
  console.log(`  placeholder:                        ${B.topicPlaceholder}`);
  console.log(`  trùng bài của lớp / khác / không:   ${B.topicTrungGtLop} / ${B.topicTrungGtKhac} / ${B.topicKhongTrung}`);
  console.log("");
  console.log(`TẤT CẢ ${mauKhongTrung.length} chuỗi nhóm KHÔNG TRÙNG (sau khi gỡ tiền tố HPn):`);
  for (const m of mauKhongTrung) console.log(m);
  console.log("");

  // Số lớp "lệch THẬT" sau khi áp meaningful()
  let lopCheThat = 0;
  for (const cls of classes) {
    const buoi = buoiTheoLop.get(cls.id) ?? [];
    if (buoi.length === 0) continue;
    const co = buoi.some((s) => {
      const p = s.planId ? planById.get(s.planId) : null;
      const les = s.lessonId ? lessonById.get(s.lessonId) : null;
      return coNghia(p?.customTitle) && !!les?.title;
    });
    if (co) lopCheThat += 1;
  }
  console.log(`## Lớp có ÍT NHẤT MỘT buổi bị customTitle CÓ NGHĨA che lesson.title: ${lopCheThat}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
