/**
 * Xuất danh sách buổi đang hiển thị TÊN BÀI KHÁC giáo trình hiện hành — bàn giao Đào tạo.
 *
 * ⚠️ CHỈ ĐỌC. Không `create`/`update`/`delete`, không `$executeRaw`.
 *
 * Đo prod 08/09: **32 buổi / 3 lớp Sata3** (26 đã dạy · 6 chưa diễn ra). Đó là toàn bộ
 * phạm vi của vấn đề "tên bài lạ" — 153 buổi khác cũng có `customTitle` nhưng in ra ĐÚNG
 * cùng chữ với `lesson.title`, và 502 buổi mang placeholder `"Buổi N"` bị `meaningful()`
 * loại nên không che gì cả.
 *
 * Vì sao bàn giao thay vì tự sửa: `customTitle` là NỘI DUNG, thuộc quyền Đào tạo. Bản vá
 * Đợt 1 cố ý KHÔNG đụng thứ tự ưu tiên tên bài (xem `docs/dieu-tra-lech-bai-hoc.md` §3.1).
 *
 * CHẠY: PROD_READONLY_URL='postgresql://…:5432/postgres' pnpm exec tsx scripts/xuat-32-buoi-sata3.ts
 * Kết quả in ra CSV trên stdout — hứng vào file rồi gửi Đào tạo.
 */
import { PrismaClient } from "@prisma/client";
import { meaningfulSessionTitle, deriveSessionLabel } from "../lib/lms/session-project-name";
import { buildSessionNumberMap } from "../lib/lms/session-order";

const CHUOI = process.env.PROD_READONLY_URL ?? process.env.DATABASE_URL ?? "";
const db = new PrismaClient({ datasources: { db: { url: CHUOI } } });

const norm = (s: string | null | undefined) => meaningfulSessionTitle(s).trim().toLowerCase();
const csv = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function main() {
  const [classes, sessions, plans, lessons, att, fb, med] = await Promise.all([
    db.class.findMany({ where: { deletedAt: null }, select: { id: true, classCode: true, name: true } }),
    db.classSession.findMany({
      select: { id: true, classId: true, date: true, lessonId: true, planId: true, topic: true, status: true, completedAt: true },
    }),
    db.classSessionPlan.findMany({ select: { id: true, order: true, customTitle: true } }),
    db.lesson.findMany({ select: { id: true, order: true, title: true, moduleCode: true } }),
    db.attendance.groupBy({ by: ["sessionId"], _count: { _all: true } }),
    db.studentSessionFeedback.groupBy({ by: ["classSessionId"], _count: { _all: true } }),
    db.classSessionMedia.groupBy({ by: ["classSessionId"], _count: { _all: true } }),
  ]);

  const P = new Map(plans.map((p) => [p.id, p]));
  const L = new Map(lessons.map((l) => [l.id, l]));
  const A = new Set(att.map((r) => r.sessionId));
  const F = new Set(fb.map((r) => r.classSessionId));
  const M = new Set(med.map((r) => r.classSessionId).filter((x): x is string => !!x));
  const coVet = (s: (typeof sessions)[number]) =>
    s.status === "COMPLETED" || s.completedAt !== null || A.has(s.id) || F.has(s.id) || M.has(s.id);

  const theoLop = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const a = theoLop.get(s.classId) ?? [];
    a.push(s);
    theoLop.set(s.classId, a);
  }

  console.log(
    ["ma_lop", "ngay", "so_buoi_theo_lich", "nhan_dang_hien_thi", "ten_bai_giao_trinh_hien_hanh", "da_day"]
      .map(csv).join(","),
  );

  for (const cls of classes) {
    const buoi = (theoLop.get(cls.id) ?? []).slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    if (buoi.length === 0) continue;

    // Mốc nước cao: mọi buổi trước buổi-có-dấu-vết-muộn-nhất coi là ĐÃ DẠY.
    let moc: number | null = null;
    for (const s of buoi) if (coVet(s)) { const t = s.date.getTime(); if (moc === null || t > moc) moc = t; }

    const soLich = buildSessionNumberMap(buoi.map((s) => ({ id: s.id, classId: s.classId, date: s.date })));

    for (const s of buoi) {
      const plan = s.planId ? P.get(s.planId) : null;
      const les = s.lessonId ? L.get(s.lessonId) : null;
      const a = norm(plan?.customTitle);
      const b = norm(les?.title);
      if (!a) continue;      // placeholder → không che gì
      if (a === b) continue; // in ra cùng chữ → không phải ca cần sửa

      const n = soLich.get(s.id) ?? null;
      const nhan = deriveSessionLabel({
        sessionNumber: n,
        planTitle: plan?.customTitle ?? null,
        lessonTitle: les?.title ?? null,
        lessonOrder: les?.order ?? null,
        moduleCode: les?.moduleCode ?? null,
        topic: s.topic,
      });
      const daDay = coVet(s) || (moc !== null && s.date.getTime() <= moc);

      console.log([
        cls.classCode ?? cls.name,
        s.date.toISOString().slice(0, 10),
        String(n ?? ""),
        nhan || "",
        les?.title ?? "(buổi không gắn bài)",
        daDay ? "đã dạy" : "chưa diễn ra",
      ].map(csv).join(","));
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
