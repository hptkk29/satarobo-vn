/**
 * NGHIỆM THU sau khi chạy `don-customtitle-may-chep.ts --apply`. Một lệnh, ba phép, mỗi
 * phép tự nói ĐẠT hay KHÔNG ĐẠT so với kỳ vọng.
 *
 * ⚠️ CHỈ ĐỌC. Không create/update/delete, không $executeRaw.
 *
 * CHẠY:
 *   PROD_READONLY_URL='postgresql://…:5432/postgres' \
 *     pnpm exec tsx scripts/nghiem-thu-don-customtitle.ts
 *
 * Mã thoát 0 khi cả ba ĐẠT, 1 khi có phép trượt — dùng được trong runbook.
 */
import { PrismaClient } from "@prisma/client";

import { meaningfulSessionTitle } from "../lib/lms/session-project-name";

const MAU = ["CS1.SATA3.26.001", "CS1.SATA3.26.002", "CS2.SATA3.26.001"];
const DAU_VET_NGUOI_MS = 2000;

const db = new PrismaClient({
  datasources: { db: { url: process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "" } },
});
const norm = (s: string | null | undefined) => meaningfulSessionTitle(s).trim().toLowerCase();

function moTaDich(url: string): string {
  if (!url) return "(TRỐNG)";
  try {
    const u = new URL(url);
    return `${u.username}@${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(chuỗi không đọc được)";
  }
}

const ket: { ten: string; dat: boolean; noiDung: string }[] = [];
function cham(ten: string, dat: boolean, noiDung: string) {
  ket.push({ ten, dat, noiDung });
  console.log(`${dat ? "✔ ĐẠT " : "✘ TRƯỢT"}  ${ten}\n        ${noiDung}\n`);
}

async function main() {
  console.log(`Đích: ${moTaDich(process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "")}\n`);

  const [plans, lessons, classes, sessions] = await Promise.all([
    db.classSessionPlan.findMany({
      select: {
        id: true,
        classId: true,
        order: true,
        customTitle: true,
        lessonId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.lesson.findMany({ select: { id: true, title: true } }),
    db.class.findMany({ select: { id: true, classCode: true, name: true } }),
    db.classSession.findMany({ select: { id: true, classId: true, planId: true, lessonId: true } }),
  ]);
  const L = new Map(lessons.map((l) => [l.id, l.title]));
  const C = new Map(classes.map((c) => [c.id, c.classCode ?? c.name]));
  const P = new Map(plans.map((p) => [p.id, p]));

  // ── PHÉP 1: lặp lại đúng phép đếm của script dọn. Kỳ vọng SẼ DỌN 0 · GIỮ 2.
  const nguoiGo = plans.filter((p) => +p.updatedAt - +p.createdAt > DAU_VET_NGUOI_MS);
  const idNguoiGo = new Set(nguoiGo.map((p) => p.id));
  const conPhaiDon = plans.filter((p) => p.customTitle !== null && !idNguoiGo.has(p.id));
  cham(
    "1. Không còn gì để dọn",
    conPhaiDon.length === 0 && nguoiGo.length === 2,
    `SẼ DỌN ${conPhaiDon.length} (kỳ vọng 0) · GIỮ ${nguoiGo.length} (kỳ vọng 2)` +
      (conPhaiDon.length
        ? `\n        còn sót: ${conPhaiDon
            .slice(0, 5)
            .map((p) => `${C.get(p.classId)} order ${p.order}`)
            .join(" · ")}`
        : ""),
  );

  // ── PHÉP 2: 3 lớp mẫu — buổi nào còn HIỆN tên giáo trình cũ. Kỳ vọng 0.
  //
  // Cố ý KHÔNG đo bằng "số buổi đổi nhãn" của `doi-chieu-nhan-truoc-sau.ts`: script đó
  // đếm cả những buổi đổi vì SỐ (lộ trình thay hạng-theo-ngày), mà việc đó là chủ đích
  // và vẫn đúng sau khi dọn. Ở đây chỉ hỏi một câu: `customTitle` còn che `Lesson.title`
  // ở buổi nào nữa không.
  const idMau = new Set(classes.filter((c) => MAU.includes(c.classCode ?? "")).map((c) => c.id));
  const buoiConChe = sessions.filter((s) => {
    if (!idMau.has(s.classId)) return false;
    const p = s.planId ? P.get(s.planId) : null;
    const a = norm(p?.customTitle);
    if (!a) return false;
    return a !== norm(s.lessonId ? L.get(s.lessonId) : null);
  });
  cham(
    "2. Ba lớp mẫu — không buổi nào còn hiện tên giáo trình cũ",
    buoiConChe.length === 0,
    `${buoiConChe.length} buổi (kỳ vọng 0)` +
      (buoiConChe.length
        ? `\n        ${buoiConChe
            .slice(0, 5)
            .map((s) => `${C.get(s.classId)} · plan ${P.get(s.planId!)?.order}`)
            .join(" · ")}`
        : ""),
  );

  // ── PHÉP 3: đếm thô — plan có customTitle KHÁC NULL. Kỳ vọng đúng 2.
  const coTitle = plans.filter((p) => p.customTitle !== null);
  cham(
    "3. Toàn hệ thống chỉ còn 2 plan mang customTitle",
    coTitle.length === 2,
    `${coTitle.length}/${plans.length} plan (kỳ vọng 2)` +
      (coTitle.length
        ? `\n        ${coTitle
            .slice(0, 5)
            .map((p) => `${C.get(p.classId)} order ${p.order} = ${JSON.stringify(p.customTitle)}`)
            .join("\n        ")}`
        : ""),
  );

  const truot = ket.filter((k) => !k.dat);
  console.log(
    truot.length === 0
      ? "═══ CẢ BA ĐẠT — đợt dọn thành công."
      : `═══ ${truot.length}/3 TRƯỢT: ${truot.map((k) => k.ten).join(" · ")}\n` +
          `    Quay lui: pnpm exec tsx scripts/quay-lui-customtitle.ts --dump=var/customtitle/dump-truoc-khi-don.json --apply`,
  );
  if (truot.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
